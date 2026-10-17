import type { Block } from '../../shared/book';
import type { TocEntry } from './toc';

export interface ParsedSpineItem {
  path: string;
  blocks: Block[];
  /** Anchor ID → index of the first block at or after it (from parseXhtml). */
  anchors: Map<string, number>;
}

export interface ChapterBlocks {
  title: string | null;
  blocks: Block[];
}

/**
 * Splits the book into chapters at its top-level TOC entries. The spine's blocks are read as one
 * stream; each entry starts a chapter at its anchor (or at the start of its file), which may be
 * in the middle of a file or leave a chapter spanning several files. Text before the first entry
 * becomes an untitled chapter if there is any. Entries that point outside the linear spine or at
 * a missing anchor are ignored; several entries at the same place keep the first one. Titles come
 * from the TOC label (see `chapterTitle`).
 * Without any usable entry, each spine item is one untitled chapter.
 */
export function splitChapters(items: ParsedSpineItem[], toc: TocEntry[]): ChapterBlocks[] {
  const offsets = new Map<string, number>();
  const flat: Block[] = [];
  for (const item of items) {
    if (!offsets.has(item.path)) offsets.set(item.path, flat.length);
    for (const block of item.blocks) flat.push(block);
  }
  const anchorsByPath = new Map(items.map((i) => [i.path, i.anchors]));

  const starts = new Map<number, string>();
  for (const entry of toc) {
    const offset = offsets.get(entry.path);
    if (offset === undefined) continue;
    const local = entry.fragment === null ? 0 : anchorsByPath.get(entry.path)?.get(entry.fragment);
    if (local === undefined) continue;
    const start = offset + local;
    if (!starts.has(start)) starts.set(start, entry.title);
  }

  if (starts.size === 0) return items.map((i) => ({ title: null, blocks: i.blocks }));

  const sorted = [...starts.entries()].sort((a, b) => a[0] - b[0]);
  const chapters: ChapterBlocks[] = [];
  if (sorted[0][0] > 0) chapters.push({ title: null, blocks: flat.slice(0, sorted[0][0]) });
  sorted.forEach(([start, tocTitle], k) => {
    const end = k + 1 < sorted.length ? sorted[k + 1][0] : flat.length;
    const blocks = flat.slice(start, end);
    chapters.push({ title: shorten(chapterTitle(tocTitle, blocks)), blocks });
  });
  return chapters;
}

/** Longest title kept whole; longer ones are cut at a word and end with "…". */
export const MAX_TITLE_LENGTH = 80;

/**
 * The TOC label, unless it is the heading the chapter opens with, or that heading after a whole
 * sentence. Gutenberg TOC labels often start with an illustration caption ("Piling up the fire.
 * CHAPTER XI.") that the parsed heading no longer has; then the heading is the title. A label
 * that adds words the heading lacks ("Stave One" for "One") is kept. Case and spacing are ignored.
 */
function chapterTitle(tocTitle: string, blocks: Block[]): string {
  const first = blocks[0];
  if (first?.kind !== 'heading') return tocTitle;
  const heading = first.words.map((w) => w.text).join(' ');
  const label = tocTitle.replace(/\s+/g, ' ').trim().toLowerCase();
  const target = heading.toLowerCase();
  if (label === target) return heading;
  if (!label.endsWith(` ${target}`)) return tocTitle;
  const before = label.slice(0, label.length - target.length).trimEnd();
  return /[.!?]["'”’)]*$/.test(before) ? heading : tocTitle;
}

/**
 * Some "chapters" open with a long note, e.g. Carol's list of other Gutenberg editions, whose
 * whole text would become the title.
 */
function shorten(title: string): string {
  if (title.length <= MAX_TITLE_LENGTH) return title;
  const cut = title.slice(0, MAX_TITLE_LENGTH);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}
