import { Parser } from 'htmlparser2';
import { dirOf, resolveHref } from './paths';

export interface TocEntry {
  /** Zip path of the target file, fragment removed. */
  path: string;
  title: string;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Reads the `toc` nav of an EPUB 3 navigation document, in document order. */
export function parseNav(html: string, navPath: string): TocEntry[] {
  const baseDir = dirOf(navPath);
  const entries: TocEntry[] = [];
  let navDepth = 0;
  let inToc = false;
  let tocSeen = false;
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
        } else if (inToc && name === 'a') {
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
        } else if (name === 'a' && href !== null) {
          const target = resolveHref(baseDir, href);
          const title = collapse(text);
          if (target && title) entries.push({ path: target, title });
          href = null;
        }
      },
    },
    { recognizeSelfClosing: true },
  );
  parser.end(html);
  return entries;
}

/** Reads the navMap of an EPUB 2 NCX, in document order. */
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
        } else if (tag === 'content' && attribs.src) {
          const target = resolveHref(baseDir, attribs.src);
          const title = labels[labels.length - 1];
          if (target && title) entries.push({ path: target, title });
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

/** Maps each file to the title of the first TOC entry that points into it. */
export function titlesByPath(entries: TocEntry[]): Map<string, string> {
  const titles = new Map<string, string>();
  for (const e of entries) if (!titles.has(e.path)) titles.set(e.path, e.title);
  return titles;
}
