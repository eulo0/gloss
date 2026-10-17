import type { Block, BookError, BookSummary, Chapter } from '../../shared/book';
import { stripMarkerBoilerplate } from './boilerplate';
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
    const perChapter: Block[][] = [];
    let pgMarkup = false;
    for (const item of pkg.spine) {
      // A non-HTML spine item still counts as a chapter, so later indices don't move.
      if (!HTML_TYPES.has(item.mediaType)) {
        perChapter.push([]);
        continue;
      }
      const result = parseXhtml(await pkg.readText(item.path));
      pgMarkup ||= result.pgMarkup;
      perChapter.push(result.blocks);
    }
    const blocks = pgMarkup ? perChapter : stripMarkerBoilerplate(perChapter);

    const chapters: Chapter[] = pkg.spine.map((item, index) => ({
      index,
      title: item.title,
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
