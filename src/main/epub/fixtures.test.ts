// ID stability: these snapshots catch any parser change that silently shifts word IDs, which would
// orphan cached audio and notes. If a snapshot changes, that change needs a deliberate decision.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Block } from '../../shared/book';
import { wordId } from '../../shared/wordId';
import { parseEpub, type ParsedBook } from './parseEpub';

const FIXTURES = path.resolve(__dirname, '../../../test/fixtures/epub');

async function parseFixture(name: string): Promise<ParsedBook> {
  const result = await parseEpub(await readFile(path.join(FIXTURES, name)));
  if (!result.ok) throw new Error(`${result.reason}: ${result.message}`);
  return result.book;
}

/** A block as one line per word: its ID, its text and `*` for emphasis. */
function describeBlock(book: string, chapter: number, paragraph: number, block: Block) {
  return {
    kind: block.kind,
    ...(block.level !== undefined && { level: block.level }),
    words: block.words.map(
      (w, word) => `${wordId({ book, chapter, paragraph, word })} ${w.text}${w.em ? ' *' : ''}`,
    ),
  };
}

function allText(book: ParsedBook): string {
  return book.chapters
    .flatMap((c) => c.blocks)
    .map((b) => b.words.map((w) => w.text).join(' '))
    .join('\n');
}

describe.each(['pg46.epub3.images.epub', 'pg1934.epub.noimages.epub'])('%s', (name) => {
  it('keeps its summary and first blocks stable', async () => {
    const book = await parseFixture(name);
    const sampled = book.chapters.filter((c) => c.blocks.length > 0).slice(0, 2);
    expect(sampled).toHaveLength(2);
    expect({
      summary: book.summary,
      chapters: sampled.map((c) => ({
        index: c.index,
        title: c.title,
        blocks: c.blocks.slice(0, 3).map((b, i) => describeBlock(book.summary.id, c.index, i, b)),
      })),
    }).toMatchSnapshot();
  });

  it('contains no licence boilerplate or image placeholders', async () => {
    const text = allText(await parseFixture(name));
    expect(text).not.toMatch(/\*\*\*\s*(START|END) OF/i);
    expect(text).not.toMatch(/Project Gutenberg(™)? License/i);
    expect(text).not.toMatch(/This eBook is for the use of anyone anywhere/i);
    expect(text).not.toMatch(/Illustration:/);
  });
});
