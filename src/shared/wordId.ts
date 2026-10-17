// Stable word IDs, `book:chapter:paragraph:word` (decision 5). Build and parse IDs only through
// these helpers; nothing else should concatenate or split ID strings.

export interface WordRef {
  book: string;
  chapter: number;
  paragraph: number;
  word: number;
}

const BOOK_ID = /^[0-9a-f]{16}$/;
const INDEX = /^(0|[1-9]\d*)$/;

/** True for a book ID: 16 lowercase hex characters (so never a `:`). */
export function isBookId(value: unknown): value is string {
  return typeof value === 'string' && BOOK_ID.test(value);
}

function isIndex(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}

export function wordId(ref: WordRef): string {
  if (!isBookId(ref.book)) throw new Error(`Invalid book ID: ${ref.book}`);
  if (!isIndex(ref.chapter) || !isIndex(ref.paragraph) || !isIndex(ref.word)) {
    throw new Error(`Invalid word position: ${ref.chapter}/${ref.paragraph}/${ref.word}`);
  }
  return `${ref.book}:${ref.chapter}:${ref.paragraph}:${ref.word}`;
}

/** Parses a word ID, or returns null if it is malformed. */
export function parseWordId(id: string): WordRef | null {
  const parts = id.split(':');
  if (parts.length !== 4) return null;
  const [book, ...rest] = parts;
  if (!isBookId(book) || !rest.every((p) => INDEX.test(p))) return null;
  const [chapter, paragraph, word] = rest.map(Number);
  if (!isIndex(chapter) || !isIndex(paragraph) || !isIndex(word)) return null;
  return { book, chapter, paragraph, word };
}
