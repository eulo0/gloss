import { readFile, stat } from 'node:fs/promises';
import type { GetChapterResult } from '../shared/book';
import { isBookId } from '../shared/wordId';
import { parseEpub, type ParsedBook, type ParseResult } from './epub/parseEpub';
import { MAX_FILE_BYTES } from './epub/zip';

/** Reads and parses an EPUB from disk, refusing files over the size limit before reading them. */
export async function openBookFile(filePath: string): Promise<ParseResult> {
  try {
    const { size } = await stat(filePath);
    if (size > MAX_FILE_BYTES) {
      return { ok: false, reason: 'too-large', message: `File is ${size} bytes` };
    }
    return await parseEpub(await readFile(filePath));
  } catch (err) {
    return { ok: false, reason: 'malformed', message: `Cannot read file: ${String(err)}` };
  }
}

/** Books parsed this session, by book ID. In memory until SQLite arrives (slice 6). */
export class BookStore {
  private readonly books = new Map<string, ParsedBook>();

  add(book: ParsedBook): void {
    this.books.set(book.summary.id, book);
  }

  /** Arguments come straight from the renderer, so they are validated here. */
  getChapter(bookId: unknown, index: unknown): GetChapterResult {
    if (!isBookId(bookId)) {
      return { ok: false, reason: 'not-found', message: 'Invalid book ID' };
    }
    const book = this.books.get(bookId);
    if (!book) return { ok: false, reason: 'not-found', message: `Book ${bookId} is not open` };
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      return { ok: false, reason: 'not-found', message: 'Chapter index must be an integer' };
    }
    const chapter = book.chapters[index];
    if (index < 0 || !chapter) {
      return { ok: false, reason: 'not-found', message: `No chapter ${index} in ${bookId}` };
    }
    return { ok: true, chapter };
  }
}
