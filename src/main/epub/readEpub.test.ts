import { describe, expect, it } from 'vitest';
import { EpubError } from './errors';
import { readEpub } from './readEpub';
import { buildEpub, buildZip, containerXml, epubFiles, xhtml } from './testing/buildEpub';
import { openZip } from './zip';

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof EpubError) return err.reason;
    throw err;
  }
  throw new Error('expected an EpubError');
}

const p = (text: string) => `<p>${text}</p>`;

describe('readEpub', () => {
  it('reads metadata and the linear spine', async () => {
    const book = await readEpub(
      await buildEpub({
        title: ' A   Christmas\nCarol ',
        creator: 'Charles Dickens',
        language: 'en',
        chapters: [
          { href: 'cover.xhtml', body: '', linear: false },
          { href: 'one.xhtml', body: p('One') },
          { href: 'two.xhtml', body: p('Two') },
        ],
      }),
    );
    expect(book.title).toBe('A Christmas Carol');
    expect(book.author).toBe('Charles Dickens');
    expect(book.language).toBe('en');
    expect(book.spine.map((s) => s.path)).toEqual(['OEBPS/one.xhtml', 'OEBPS/two.xhtml']);
    expect(book.bookId).toMatch(/^[0-9a-f]{16}$/);
    book.close();
  });

  it('gives the same book ID for the same bytes and a new one for different bytes', async () => {
    const bytes = await buildEpub({ chapters: [{ href: 'a.xhtml', body: p('A') }] });
    const other = await buildEpub({ chapters: [{ href: 'a.xhtml', body: p('B') }] });
    const [a, b, c] = await Promise.all([readEpub(bytes), readEpub(bytes), readEpub(other)]);
    expect(a.bookId).toBe(b.bookId);
    expect(a.bookId).not.toBe(c.bookId);
  });

  it('resolves hrefs against an OPF in a subfolder', async () => {
    const book = await readEpub(
      await buildEpub({
        opfPath: 'deep/er/package.opf',
        chapters: [{ href: 'text/ch1.xhtml', body: p('Hi') }],
      }),
    );
    expect(book.spine[0].path).toBe('deep/er/text/ch1.xhtml');
    expect(await book.readText(book.spine[0].path)).toContain('<p>Hi</p>');
  });

  it('decodes percent-encoded hrefs', async () => {
    const book = await readEpub(
      await buildEpub({ chapters: [{ href: 'chapter%20one.xhtml', body: p('Hi') }] }),
    );
    expect(book.spine[0].path).toBe('OEBPS/chapter one.xhtml');
  });

  it('reads top-level EPUB 3 nav entries with their fragments, ignoring other navs', async () => {
    const book = await readEpub(
      await buildEpub({
        chapters: [
          { href: 'a.xhtml', body: p('A') },
          { href: 'b%20c.xhtml', body: p('B') },
        ],
        nav: [
          ['a.xhtml#start', 'Stave One', [['a.xhtml#sub', 'Nested']]],
          ['b%20c.xhtml#x%20y', 'Stave Two'],
          ['b%20c.xhtml', 'Whole file'],
        ],
      }),
    );
    expect(book.toc).toEqual([
      { path: 'OEBPS/a.xhtml', fragment: 'start', title: 'Stave One' },
      { path: 'OEBPS/b c.xhtml', fragment: 'x y', title: 'Stave Two' },
      { path: 'OEBPS/b c.xhtml', fragment: null, title: 'Whole file' },
    ]);
  });

  it('falls back to top-level EPUB 2 NCX entries', async () => {
    const book = await readEpub(
      await buildEpub({
        chapters: [{ href: 'a.xhtml', body: p('A') }],
        ncx: [['a.xhtml#x', 'Part', [['a.xhtml#y', 'Nested']]]],
      }),
    );
    expect(book.toc).toEqual([{ path: 'OEBPS/a.xhtml', fragment: 'x', title: 'Part' }]);
  });

  it('refuses a non-zip as not-epub', async () => {
    expect(await reason(readEpub(Buffer.from('just some text, not a zip')))).toBe('not-epub');
  });

  it('refuses a plain zip without container.xml as not-epub', async () => {
    expect(await reason(readEpub(await buildZip({ 'notes.txt': 'hello' })))).toBe('not-epub');
  });

  it('refuses an OPF pointing at a missing file as malformed', async () => {
    const files = epubFiles({ chapters: [{ href: 'gone.xhtml', body: p('x') }] });
    delete files['OEBPS/gone.xhtml'];
    expect(await reason(readEpub(await buildZip(files)))).toBe('malformed');
  });

  it('refuses a container pointing at a missing OPF as malformed', async () => {
    const zip = await buildZip({
      'META-INF/container.xml': containerXml('OEBPS/nope.opf'),
      'OEBPS/a.xhtml': xhtml(p('x')),
    });
    expect(await reason(readEpub(zip))).toBe('malformed');
  });

  it('refuses a container without a rootfile as malformed', async () => {
    const zip = await buildZip({ 'META-INF/container.xml': '<container><rootfiles/></container>' });
    expect(await reason(readEpub(zip))).toBe('malformed');
  });

  it('refuses a spine with only non-linear items or unknown idrefs as malformed', async () => {
    const nonLinear = await buildEpub({ chapters: [{ href: 'a.xhtml', body: '', linear: false }] });
    expect(await reason(readEpub(nonLinear))).toBe('malformed');

    const files = epubFiles({ chapters: [{ href: 'a.xhtml', body: p('x') }] });
    files['OEBPS/content.opf'] = String(files['OEBPS/content.opf']).replace(
      'idref="c0"',
      'idref="missing"',
    );
    expect(await reason(readEpub(await buildZip(files)))).toBe('malformed');
  });

  it('ignores a TOC file that is missing', async () => {
    const files = epubFiles({
      chapters: [{ href: 'a.xhtml', body: p('A') }],
      ncx: [['a.xhtml', 'A']],
    });
    delete files['OEBPS/toc.ncx'];
    const book = await readEpub(await buildZip(files));
    expect(book.toc).toEqual([]);
  });
});

describe('openZip limits', () => {
  it('refuses an entry that inflates past the limit', async () => {
    const zip = await openZip(await buildZip({ 'big.txt': 'x'.repeat(10_000) }), 1_000);
    expect(await reason(zip.read('big.txt'))).toBe('too-large');
  });

  it('refuses a file over 200 MB before reading it', async () => {
    const huge = Buffer.alloc(200 * 1024 * 1024 + 1);
    expect(await reason(openZip(huge))).toBe('too-large');
  });
});
