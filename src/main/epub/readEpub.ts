import { createHash } from 'node:crypto';
import { EpubError } from './errors';
import { parseContainer, parseOpf, type ManifestItem } from './opf';
import { parseNav, parseNcx, type TocEntry } from './toc';
import { openZip, type Zip } from './zip';

export interface SpineEntry {
  /** Zip path of the content document. */
  path: string;
  mediaType: string;
}

export interface EpubPackage {
  bookId: string;
  title: string | null;
  author: string | null;
  language: string | null;
  /** Linear spine items in reading order. */
  spine: SpineEntry[];
  /** Top-level TOC entries (nav, else NCX); empty if the book has no usable TOC. */
  toc: TocEntry[];
  /** Reads an entry as UTF-8 text. */
  readText(path: string): Promise<string>;
  close(): void;
}

const CONTAINER = 'META-INF/container.xml';
const utf8 = new TextDecoder('utf-8');

/** First 16 hex characters of the SHA-256 of the file's bytes (brief 01, decision 2). */
export function bookIdOf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

/** Opens an EPUB held in memory: container → OPF → metadata, spine and TOC. */
export async function readEpub(bytes: Buffer): Promise<EpubPackage> {
  const zip = await openZip(bytes);
  try {
    if (!zip.has(CONTAINER)) throw new EpubError('not-epub', `Zip has no ${CONTAINER}`);
    const readText = async (path: string) => utf8.decode(await zip.read(path));

    const opfPath = parseContainer(await readText(CONTAINER));
    if (!zip.has(opfPath)) throw new EpubError('malformed', `OPF not found: ${opfPath}`);
    const pkg = parseOpf(await readText(opfPath), opfPath);

    for (const item of pkg.spine) {
      if (!zip.has(item.path)) throw new EpubError('malformed', `Spine file missing: ${item.path}`);
    }

    return {
      bookId: bookIdOf(bytes),
      title: pkg.title,
      author: pkg.author,
      language: pkg.language,
      spine: pkg.spine.map((item) => ({ path: item.path, mediaType: item.mediaType })),
      toc: await readToc(zip, readText, pkg.nav, pkg.ncx),
      readText,
      close: () => zip.close(),
    };
  } catch (err) {
    zip.close();
    throw err;
  }
}

/** A missing TOC isn't an error: chapters then fall back to one per spine item. */
async function readToc(
  zip: Zip,
  readText: (path: string) => Promise<string>,
  nav: ManifestItem | null,
  ncx: ManifestItem | null,
): Promise<TocEntry[]> {
  if (nav && zip.has(nav.path)) {
    const entries = parseNav(await readText(nav.path), nav.path);
    if (entries.length > 0) return entries;
  }
  if (ncx && zip.has(ncx.path)) return parseNcx(await readText(ncx.path), ncx.path);
  return [];
}
