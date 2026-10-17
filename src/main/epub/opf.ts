import { Parser } from 'htmlparser2';
import { EpubError } from './errors';
import { dirOf, resolveHref } from './paths';

export interface ManifestItem {
  id: string;
  /** Zip entry path, resolved against the OPF's folder. */
  path: string;
  mediaType: string;
  properties: string[];
}

export interface Package {
  title: string | null;
  author: string | null;
  language: string | null;
  manifest: Map<string, ManifestItem>;
  /** Linear spine items in reading order (`linear="no"` dropped). */
  spine: ManifestItem[];
  /** EPUB 3 nav document, if any. */
  nav: ManifestItem | null;
  /** EPUB 2 NCX, if any. */
  ncx: ManifestItem | null;
}

/** Local name of a possibly prefixed XML name: `dc:title` → `title`. */
function local(name: string): string {
  const i = name.indexOf(':');
  return (i === -1 ? name : name.slice(i + 1)).toLowerCase();
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Reads `META-INF/container.xml` and returns the zip path of the OPF. */
export function parseContainer(xml: string): string {
  let fullPath: string | null = null;
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (fullPath === null && local(name) === 'rootfile' && attribs['full-path']) {
          fullPath = attribs['full-path'];
        }
      },
    },
    { xmlMode: true },
  );
  parser.end(xml);
  const resolved = fullPath === null ? null : resolveHref('', fullPath);
  if (!resolved) throw new EpubError('malformed', 'container.xml names no rootfile');
  return resolved;
}

export function parseOpf(xml: string, opfPath: string): Package {
  const baseDir = dirOf(opfPath);
  const manifest = new Map<string, ManifestItem>();
  const spineRefs: string[] = [];
  let tocId: string | null = null;
  const meta: Record<'title' | 'creator' | 'language', string[]> = {
    title: [],
    creator: [],
    language: [],
  };
  let inMetadata = false;
  let capture: keyof typeof meta | null = null;
  let text = '';

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const tag = local(name);
        if (tag === 'metadata') inMetadata = true;
        else if (inMetadata && (tag === 'title' || tag === 'creator' || tag === 'language')) {
          capture = tag;
          text = '';
        } else if (tag === 'item' && attribs.id && attribs.href) {
          const itemPath = resolveHref(baseDir, attribs.href);
          if (itemPath) {
            manifest.set(attribs.id, {
              id: attribs.id,
              path: itemPath,
              mediaType: attribs['media-type'] ?? '',
              properties: (attribs.properties ?? '').split(/\s+/).filter(Boolean),
            });
          }
        } else if (tag === 'spine') {
          tocId = attribs.toc ?? null;
        } else if (tag === 'itemref' && attribs.idref && attribs.linear !== 'no') {
          spineRefs.push(attribs.idref);
        }
      },
      ontext(data) {
        if (capture) text += data;
      },
      onclosetag(name) {
        const tag = local(name);
        if (tag === 'metadata') inMetadata = false;
        else if (capture && tag === capture) {
          const value = collapse(text);
          if (value) meta[capture].push(value);
          capture = null;
        }
      },
    },
    { xmlMode: true },
  );
  parser.end(xml);

  const spine = spineRefs.map((idref) => {
    const item = manifest.get(idref);
    if (!item) throw new EpubError('malformed', `Spine references unknown item "${idref}"`);
    return item;
  });
  if (spine.length === 0) throw new EpubError('malformed', 'OPF has no linear spine items');

  const items = [...manifest.values()];
  const nav = items.find((i) => i.properties.includes('nav')) ?? null;
  const ncx =
    (tocId !== null ? manifest.get(tocId) : undefined) ??
    items.find((i) => i.mediaType === 'application/x-dtbncx+xml') ??
    null;

  return {
    title: meta.title[0] ?? null,
    author: meta.creator[0] ?? null,
    language: meta.language[0] ?? null,
    manifest,
    spine,
    nav,
    ncx,
  };
}
