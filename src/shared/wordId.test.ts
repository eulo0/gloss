import { describe, expect, it } from 'vitest';
import { isBookId, parseWordId, wordId } from './wordId';

const book = '0123456789abcdef';

describe('wordId', () => {
  it('round-trips through parseWordId', () => {
    const ref = { book, chapter: 3, paragraph: 0, word: 41 };
    expect(wordId(ref)).toBe('0123456789abcdef:3:0:41');
    expect(parseWordId(wordId(ref))).toEqual(ref);
  });

  it('refuses invalid parts', () => {
    expect(() => wordId({ book: 'http://x', chapter: 0, paragraph: 0, word: 0 })).toThrow();
    expect(() => wordId({ book, chapter: -1, paragraph: 0, word: 0 })).toThrow();
    expect(() => wordId({ book, chapter: 0, paragraph: 1.5, word: 0 })).toThrow();
    expect(() => wordId({ book, chapter: 0, paragraph: 0, word: NaN })).toThrow();
  });
});

describe('parseWordId', () => {
  it.each([
    '',
    book,
    `${book}:1:2`,
    `${book}:1:2:3:4`,
    `${book}:-1:2:3`,
    `${book}:1:2.0:3`,
    `${book}:01:2:3`,
    `${book}:1: 2:3`,
    `${book}:1::3`,
    `${book.toUpperCase()}:1:2:3`,
    `abc:1:2:3`,
    `http://example.com:1:2:3`,
    `${book}:1:2:99999999999999999999`,
  ])('rejects %j', (id) => {
    expect(parseWordId(id)).toBeNull();
  });
});

describe('isBookId', () => {
  it('accepts 16 lowercase hex characters only', () => {
    expect(isBookId(book)).toBe(true);
    expect(isBookId('0123456789abcde')).toBe(false);
    expect(isBookId('0123456789abcdef0')).toBe(false);
    expect(isBookId(42)).toBe(false);
  });

  it('never accepts a colon', () => {
    expect(isBookId('0123456:89abcdef')).toBe(false);
    expect(isBookId('http://www.gutenberg.org/46')).toBe(false);
  });
});
