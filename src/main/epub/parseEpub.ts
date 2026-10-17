import type { Block, BookError, BookSummary, Chapter } from '../../shared/book';
import { stripMarkerBoilerplate } from './boilerplate';
import { splitChapters, type ParsedSpineItem } from './chapters';
import { EpubError } from './errors';
import { readEpub, type EpubPackage } from './readEpub';
import { parseXhtml } from './xhtml';

export interface ParsedBook {
  summary: BookSummary;
  chapters: Chapter[];
}

export type ParseResult = { ok: true; book: ParsedBook } | BookError;

const HTML_TYPES = new Set(['application/xhtml+xml', 'text/html']);

/** Parses an EPUB held in memory. Never throws: failures come back as a `BookError`. */
export async function parseEpub(bytes: Buffer): Promise<ParseResult> {
  let pkg: EpubPackage | null = null;
  try {
    pkg = await readEpub(bytes);
    const items: ParsedSpineItem[] = [];
    let pgMarkup = false;
    for (const item of pkg.spine) {
      if (!HTML_TYPES.has(item.mediaType)) {
        items.push({ path: item.path, blocks: [], anchors: new Map() });
        continue;
      }
      const anchorIds = new Set(
        pkg.toc.flatMap((e) => (e.path === item.path && e.fragment ? [e.fragment] : [])),
      );
      const result = parseXhtml(await pkg.readText(item.path), anchorIds);
      pgMarkup ||= result.pgMarkup;
      items.push({ path: item.path, blocks: result.blocks, anchors: result.anchors });
    }

    const split = splitChapters(items, pkg.toc);
    // Marker stripping empties chapters but never removes them, so chapter indices don't move.
    const perChapter = split.map((c) => c.blocks);
    const blocks: Block[][] = pgMarkup ? perChapter : stripMarkerBoilerplate(perChapter);
    const chapters: Chapter[] = split.map((c, index) => ({
      index,
      title: c.title,
      blocks: blocks[index],
    }));
    const summary: BookSummary = {
      id: pkg.bookId,
      title: pkg.title ?? 'Untitled',
      author: pkg.author,
      language: pkg.language,
      chapters: chapters.map((c) => ({
        index: c.index,
        title: c.title,
        wordCount: c.blocks.reduce((n, b) => n + b.words.length, 0),
      })),
    };
    return { ok: true, book: { summary, chapters } };
  } catch (err) {
    if (err instanceof EpubError) return { ok: false, reason: err.reason, message: err.message };
    return { ok: false, reason: 'malformed', message: String(err) };
  } finally {
    pkg?.close();
  }
}
