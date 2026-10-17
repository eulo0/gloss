import type { Block } from '../../shared/book';

const START = /\*{3}\s*START OF\b/i;
const END = /\*{3}\s*END OF\b/i;

const textOf = (block: Block) => block.words.map((w) => w.text).join(' ');

/**
 * Fallback for older Gutenberg files without `pg-*` markup: keeps only the blocks between the
 * `*** START OF …` and `*** END OF …` markers (both excluded), searched across the whole book.
 * Chapters themselves are kept, even if they end up empty, so chapter indices don't move.
 */
export function stripMarkerBoilerplate(chapters: Block[][]): Block[][] {
  const flat = chapters.flat();
  const start = flat.findIndex((block) => START.test(textOf(block)));
  let end = flat.findIndex((block, i) => i > start && END.test(textOf(block)));
  if (start === -1 && end === -1) return chapters;
  if (end === -1) end = flat.length;

  let i = 0;
  return chapters.map((blocks) =>
    blocks.filter(() => {
      const index = i++;
      return index > start && index < end;
    }),
  );
}
