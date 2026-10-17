import path from 'node:path';

/** Folder of a zip path, '' at the root. */
export function dirOf(zipPath: string): string {
  const dir = path.posix.dirname(zipPath);
  return dir === '.' ? '' : dir;
}

/**
 * Resolves an href found in a file inside the zip to a zip entry path: relative to `baseDir`,
 * percent-decoded, without `#fragment` or `?query`. Returns null for external URLs, empty hrefs
 * and paths that climb out of the zip.
 */
export function resolveHref(baseDir: string, href: string): string | null {
  const bare = href.replace(/[#?].*$/, '').trim();
  if (bare === '' || /^[a-z][a-z0-9+.-]*:/i.test(bare)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    decoded = bare;
  }
  const joined = decoded.startsWith('/')
    ? decoded.slice(1)
    : path.posix.join(baseDir || '.', decoded);
  const normalized = path.posix.normalize(joined);
  if (normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}
