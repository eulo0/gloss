import { Parser } from 'htmlparser2';
import { dirOf, fragmentOf, resolveHref } from './paths';

/** A top-level table-of-contents entry. Each one starts a chapter (see chapters.ts). */
export interface TocEntry {
  /** Zip path of the target file, fragment removed. */
  path: string;
  /** Element ID the entry points at, or null for the start of the file. */
  fragment: string | null;
  title: string;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function entry(baseDir: string, href: string, title: string): TocEntry | null {
  const path = resolveHref(baseDir, href);
  return path && title ? { path, fragment: fragmentOf(href), title } : null;
}

/**
 * Reads the top level of the `toc` nav of an EPUB 3 navigation document, in document order.
 * Nested entries (subtitles, illustrations, sections) stay inside their parent's chapter.
 */
export function parseNav(html: string, navPath: string): TocEntry[] {
  const baseDir = dirOf(navPath);
  const entries: TocEntry[] = [];
  let navDepth = 0;
  let inToc = false;
  let tocSeen = false;
  let listDepth = 0;
  let href: string | null = null;
  let text = '';

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (name === 'nav') {
          navDepth++;
          const types = (attribs['epub:type'] ?? '').split(/\s+/);
          if (!tocSeen && navDepth === 1 && types.includes('toc')) {
            inToc = true;
            tocSeen = true;
          }
        } else if (!inToc) {
          return;
        } else if (name === 'ol' || name === 'ul') {
          listDepth++;
        } else if (name === 'a' && listDepth === 1) {
          href = attribs.href ?? null;
          text = '';
        }
      },
      ontext(data) {
        if (href !== null) text += data;
      },
      onclosetag(name) {
        if (name === 'nav') {
          navDepth--;
          if (navDepth === 0) inToc = false;
        } else if (!inToc) {
          return;
        } else if (name === 'ol' || name === 'ul') {
          listDepth--;
        } else if (name === 'a' && href !== null) {
          const e = entry(baseDir, href, collapse(text));
          if (e) entries.push(e);
          href = null;
        }
      },
    },
    { recognizeSelfClosing: true },
  );
  parser.end(html);
  return entries;
}

/** Reads the top-level navPoints of an EPUB 2 NCX, in document order. */
export function parseNcx(xml: string, ncxPath: string): TocEntry[] {
  const baseDir = dirOf(ncxPath);
  const entries: TocEntry[] = [];
  // Each navPoint's label comes before its <content>; nested navPoints follow.
  const labels: string[] = [];
  let inNavMap = false;
  let inText = false;
  let text = '';

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const tag = name.toLowerCase();
        if (tag === 'navmap') inNavMap = true;
        else if (!inNavMap) return;
        else if (tag === 'navpoint') labels.push('');
        else if (tag === 'text') {
          inText = true;
          text = '';
        } else if (tag === 'content' && attribs.src && labels.length === 1) {
          const e = entry(baseDir, attribs.src, labels[0]);
          if (e) entries.push(e);
        }
      },
      ontext(data) {
        if (inText) text += data;
      },
      onclosetag(name) {
        const tag = name.toLowerCase();
        if (tag === 'navmap') inNavMap = false;
        else if (tag === 'navpoint') labels.pop();
        else if (tag === 'text' && inText) {
          inText = false;
          if (labels.length > 0 && labels[labels.length - 1] === '') {
            labels[labels.length - 1] = collapse(text);
          }
        }
      },
    },
    { xmlMode: true },
  );
  parser.end(xml);
  return entries;
}
