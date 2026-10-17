import { describe, expect, it } from 'vitest';
import type { Chapter } from '../../shared/book';
import { parseEpub, type ParsedBook } from './parseEpub';
import { buildEpub, buildZip } from './testing/buildEpub';

async function parse(bytes: Buffer): Promise<ParsedBook> {
  const result = await parseEpub(bytes);
  if (!result.ok) throw new Error(`${result.reason}: ${result.message}`);
  return result.book;
}

const texts = (c: Chapter) => c.blocks.map((b) => b.words.map((w) => w.text).join(' '));

describe('parseEpub', () => {
  it('builds chapters and a summary with word counts', async () => {
    const book = await parse(
      await buildEpub({
        title: 'Carol',
        creator: 'Dickens',
        language: 'en',
        chapters: [
          { href: 'cover.xhtml', body: '<p>Cover</p>', linear: false },
          { href: 'a.xhtml', body: '<h2>One</h2><p>Marley was dead.</p>' },
          { href: 'b.xhtml', body: '<div class="fig"></div>' },
        ],
        nav: [['a.xhtml', 'Stave One']],
      }),
    );
    expect(book.summary).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{16}$/),
      title: 'Carol',
      author: 'Dickens',
      language: 'en',
      chapters: [
        { index: 0, title: 'Stave One', wordCount: 4 },
        { index: 1, title: null, wordCount: 0 },
      ],
    });
    expect(texts(book.chapters[0])).toEqual(['One', 'Marley was dead.']);
    expect(book.chapters[1].blocks).toEqual([]);
  });

  it('falls back to "Untitled" when the OPF has no title', async () => {
    const book = await parse(
      await buildEpub({ chapters: [{ href: 'a.xhtml', body: '<p>x</p>' }] }),
    );
    expect(book.summary.title).toBe('Untitled');
    expect(book.summary.author).toBeNull();
  });

  it('strips old-style *** START/END OF markers across chapters, keeping chapter indices', async () => {
    const book = await parse(
      await buildEpub({
        chapters: [
          {
            href: 'a.xhtml',
            body:
              '<p>The Project Gutenberg EBook of Carol</p>' +
              '<p>*** START OF THIS PROJECT GUTENBERG EBOOK CAROL ***</p>' +
              '<p>Marley was dead.</p>',
          },
          {
            href: 'b.xhtml',
            body: '<p>God bless us.</p><p>*** END OF THIS PROJECT GUTENBERG EBOOK ***</p>',
          },
          { href: 'c.xhtml', body: '<p>Full license text.</p>' },
        ],
      }),
    );
    expect(book.chapters.map(texts)).toEqual([['Marley was dead.'], ['God bless us.'], []]);
    expect(book.summary.chapters.map((c) => c.wordCount)).toEqual([3, 3, 0]);
  });

  it('ignores *** markers when the book has pg-* markup', async () => {
    const book = await parse(
      await buildEpub({
        chapters: [
          {
            href: 'a.xhtml',
            body:
              '<header id="pg-header"><p>*** START OF THE PROJECT GUTENBERG EBOOK ***</p></header>' +
              '<p>Before *** START OF nothing</p><p>Story.</p>',
          },
        ],
      }),
    );
    expect(texts(book.chapters[0])).toEqual(['Before *** START OF nothing', 'Story.']);
  });

  it('returns errors as data instead of throwing', async () => {
    expect(await parseEpub(Buffer.from('not a zip'))).toMatchObject({
      ok: false,
      reason: 'not-epub',
    });
    expect(await parseEpub(await buildZip({ 'a.txt': 'x' }))).toMatchObject({
      ok: false,
      reason: 'not-epub',
      message: expect.any(String),
    });
  });
});
