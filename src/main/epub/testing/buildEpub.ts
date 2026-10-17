// Test helper: builds small EPUBs in memory with yazl, so edge cases need no binary fixtures.
import yazl from 'yazl';

export type ZipFiles = Record<string, string | Buffer>;

export function buildZip(files: ZipFiles): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) {
    zip.addBuffer(typeof content === 'string' ? Buffer.from(content, 'utf8') : content, name);
  }
  zip.end();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

export interface ChapterSpec {
  /** Href as written in the OPF (may be percent-encoded). */
  href: string;
  /** Zip path relative to the OPF folder; defaults to the decoded href. */
  file?: string;
  /** Contents of <body>. */
  body: string;
  linear?: boolean;
}

/** A TOC entry: [href relative to the OPF folder, title, nested entries]. */
export type TocSpec = [string, string, TocSpec[]?];

function navList(entries: TocSpec[]): string {
  const li = entries.map(
    ([href, t, kids]) => `<li><a href="${href}">${t}</a>${kids ? navList(kids) : ''}</li>`,
  );
  return `<ol>${li.join('')}</ol>`;
}

function navPoints(entries: TocSpec[]): string {
  return entries
    .map(
      ([href, t, kids]) =>
        `<navPoint><navLabel><text>${t}</text></navLabel><content src="${href}"/>${kids ? navPoints(kids) : ''}</navPoint>`,
    )
    .join('');
}

export interface EpubSpec {
  opfPath?: string;
  title?: string;
  creator?: string;
  language?: string;
  chapters: ChapterSpec[];
  /** EPUB 3 nav entries. */
  nav?: TocSpec[];
  /** EPUB 2 NCX entries. */
  ncx?: TocSpec[];
  /** Extra files, or overrides, by zip path. */
  extra?: ZipFiles;
}

export function xhtml(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Test</title><style>p { color: red }</style></head>
<body>${body}</body>
</html>`;
}

export function containerXml(opfPath: string): string {
  return `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
}

export function epubFiles(spec: EpubSpec): ZipFiles {
  const opfPath = spec.opfPath ?? 'OEBPS/content.opf';
  const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const files: ZipFiles = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': containerXml(opfPath),
  };

  const items = spec.chapters.map(
    (c, i) => `<item id="c${i}" href="${c.href}" media-type="application/xhtml+xml"/>`,
  );
  const refs = spec.chapters.map(
    (c, i) => `<itemref idref="c${i}"${c.linear === false ? ' linear="no"' : ''}/>`,
  );
  for (const c of spec.chapters) {
    files[dir + (c.file ?? decodeURIComponent(c.href.replace(/#.*$/, '')))] = xhtml(c.body);
  }

  if (spec.nav) {
    items.push(
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    );
    files[dir + 'nav.xhtml'] = xhtml(
      `<nav epub:type="landmarks"><ol><li><a href="x.xhtml">Not the TOC</a></li></ol></nav>` +
        `<nav epub:type="toc">${navList(spec.nav)}</nav>`,
    );
  }
  if (spec.ncx) {
    items.push('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');
    const points = navPoints(spec.ncx);
    files[dir + 'toc.ncx'] =
      `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head/><docTitle><text>Doc</text></docTitle><navMap>${points}</navMap></ncx>`;
  }

  const meta = [
    spec.title !== undefined ? `<dc:title>${spec.title}</dc:title>` : '',
    spec.creator !== undefined ? `<dc:creator>${spec.creator}</dc:creator>` : '',
    spec.language !== undefined ? `<dc:language>${spec.language}</dc:language>` : '',
  ].join('');
  files[opfPath] = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">http://www.gutenberg.org/0</dc:identifier>${meta}
  </metadata>
  <manifest>${items.join('')}</manifest>
  <spine${spec.ncx ? ' toc="ncx"' : ''}>${refs.join('')}</spine>
</package>`;

  return { ...files, ...spec.extra };
}

export function buildEpub(spec: EpubSpec): Promise<Buffer> {
  return buildZip(epubFiles(spec));
}
