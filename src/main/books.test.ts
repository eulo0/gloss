import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BookStore, openBookFile } from './books';
import type { ParsedBook } from './epub/parseEpub';
import { buildEpub } from './epub/testing/buildEpub';

let dir: string;
let book: ParsedBook;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'gloss-books-'));
  const file = path.join(dir, 'book.epub');
  await writeFile(
    file,
    await buildEpub({
      title: 'T',
      chapters: [
        { href: 'a.xhtml', body: '<p>One</p>' },
        { href: 'b.xhtml', body: '<p>Two</p>' },
      ],
    }),
  );
  const result = await openBookFile(file);
  if (!result.ok) throw new Error(result.message);
  book = result.book;
});

afterAll(() => rm(dir, { recursive: true, force: true }));

describe('openBookFile', () => {
  it('returns errors as data for unreadable and non-EPUB files', async () => {
    expect(await openBookFile(path.join(dir, 'missing.epub'))).toMatchObject({
      ok: false,
      reason: 'malformed',
    });
    const text = path.join(dir, 'notes.epub');
    await writeFile(text, 'hello');
    expect(await openBookFile(text)).toMatchObject({ ok: false, reason: 'not-epub' });
  });
});

describe('BookStore.getChapter', () => {
  const store = new BookStore();
  beforeAll(() => store.add(book));

  it('returns a chapter of an open book', () => {
    const result = store.getChapter(book.summary.id, 1);
    expect(result).toMatchObject({ ok: true, chapter: { index: 1 } });
  });

  it.each([
    ['a malformed book ID', 'not-an-id', 0],
    ['a non-string book ID', 42, 0],
    ['an unknown book', '0123456789abcdef', 0],
    ['a negative index', null, -1],
    ['an index out of range', null, 2],
    ['a fractional index', null, 0.5],
    ['a string index', null, '0'],
    ['NaN', null, NaN],
  ])('refuses %s', (_label, bookId, index) => {
    expect(store.getChapter(bookId ?? book.summary.id, index)).toMatchObject({
      ok: false,
      reason: 'not-found',
    });
  });
});
