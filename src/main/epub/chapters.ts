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
 * a missing anchor are ignored; several entries at the same place keep the first title.
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
  sorted.forEach(([start, title], k) => {
    const end = k + 1 < sorted.length ? sorted[k + 1][0] : flat.length;
    chapters.push({ title, blocks: flat.slice(start, end) });
  });
  return chapters;
}
