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
  it('builds a summary with word counts', async () => {
    const book = await parse(
      await buildEpub({
        title: 'Carol',
        creator: 'Dickens',
        language: 'en',
        chapters: [
          { href: 'cover.xhtml', body: '<p>Cover</p>', linear: false },
          { href: 'a.xhtml', body: '<h2>One</h2><p>Marley was dead.</p>' },
          { href: 'b.xhtml', body: '<h2 id="two">Two</h2>' },
          { href: 'c.xhtml', body: '<div class="fig"></div>' },
        ],
        nav: [
          ['a.xhtml', 'Stave One'],
          ['b.xhtml#two', 'Stave Two'],
          ['c.xhtml', 'Plates'],
        ],
      }),
    );
    expect(book.summary).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{16}$/),
      title: 'Carol',
      author: 'Dickens',
      language: 'en',
      chapters: [
        { index: 0, title: 'Stave One', wordCount: 4 },
        { index: 1, title: 'Stave Two', wordCount: 1 },
        { index: 2, title: 'Plates', wordCount: 0 },
      ],
    });
    expect(texts(book.chapters[0])).toEqual(['One', 'Marley was dead.']);
    expect(book.chapters[2].blocks).toEqual([]);
  });

  it('splits one file into several chapters at TOC anchors', async () => {
    const book = await parse(
      await buildEpub({
        chapters: [
          {
            href: 'big.xhtml',
            body:
              '<p>Title page</p>' +
              '<div class="chapter"><h2 id="c1">CHAPTER I.</h2><p>It is a truth.</p></div>' +
              '<div class="chapter" id="c2"><h2>CHAPTER II.</h2><p>Mr. Bennet <a id="c3"/>was.</p><p>Next.</p></div>',
          },
        ],
        nav: [
          ['big.xhtml#c1', 'Chapter I.', [['big.xhtml#c1', 'A nested entry is ignored']]],
          ['big.xhtml#c2', 'Chapter II.'],
        ],
      }),
    );
    expect(book.chapters.map((c) => [c.title, texts(c)])).toEqual([
      [null, ['Title page']],
      ['Chapter I.', ['CHAPTER I.', 'It is a truth.']],
      ['Chapter II.', ['CHAPTER II.', 'Mr. Bennet was.', 'Next.']],
    ]);
  });

  it('lets a chapter run across files and orders entries by reading position', async () => {
    const book = await parse(
      await buildEpub({
        chapters: [
          { href: 'a.xhtml', body: '<h2 id="one">One</h2><p>a</p>' },
          { href: 'b.xhtml', body: '<p>b</p><h2 id="two">Two</h2><p>c</p>' },
          { href: 'c.xhtml', body: '<p>d</p>' },
        ],
        nav: [
          ['b.xhtml#two', 'Two'],
          ['a.xhtml#one', 'One'],
          ['a.xhtml#missing', 'Missing anchor'],
          ['elsewhere.xhtml', 'Not in the spine'],
          ['a.xhtml', 'Same place as One'],
        ],
      }),
    );
    expect(book.chapters.map((c) => [c.title, texts(c)])).toEqual([
      ['One', ['One', 'a', 'b']],
      ['Two', ['Two', 'c', 'd']],
    ]);
  });

  it('gives an entry inside skipped boilerplate an empty chapter', async () => {
    const book = await parse(
      await buildEpub({
        chapters: [
          { href: 'a.xhtml', body: '<p>Story.</p>' },
          {
            href: 'z.xhtml',
            body: '<footer class="pg-boilerplate" id="pg-footer"><h2 id="lic">LICENSE</h2><p>Terms</p></footer>',
          },
        ],
        nav: [
          ['a.xhtml', 'Story'],
          ['z.xhtml#lic', 'LICENSE'],
        ],
      }),
    );
    expect(book.summary.chapters).toEqual([
      { index: 0, title: 'Story', wordCount: 1 },
      { index: 1, title: 'LICENSE', wordCount: 0 },
    ]);
  });

  it('falls back to one untitled chapter per spine item without a usable TOC', async () => {
    const book = await parse(
      await buildEpub({
        chapters: [
          { href: 'a.xhtml', body: '<p>A</p>' },
          { href: 'b.xhtml', body: '' },
        ],
        nav: [['a.xhtml#nowhere', 'Broken']],
      }),
    );
    expect(book.summary.chapters).toEqual([
      { index: 0, title: null, wordCount: 1 },
      { index: 1, title: null, wordCount: 0 },
    ]);
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
