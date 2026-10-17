import { Parser } from 'htmlparser2';
import type { Block, Word } from '../../shared/book';
import { tokenize } from '../../shared/tokenize';

export interface XhtmlResult {
  blocks: Block[];
  /** True if the file has current Gutenberg boilerplate markup (`.pg-boilerplate`, `#pg-header`…). */
  pgMarkup: boolean;
  /** For each requested anchor ID found: the index of the first block at or after it. */
  anchors: Map<string, number>;
}

/** Elements whose start or end ends the current block of text. */
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'caption',
  'center',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
]);

const EMPHASIS_TAGS = new Set(['i', 'em', 'cite']);

/** Elements skipped with everything inside them. */
const SKIP_TAGS = new Set([
  'audio',
  'head',
  'iframe',
  'img',
  'object',
  'picture',
  'script',
  'style',
  'svg',
  'template',
  'video',
]);

const PG_IDS = new Set(['pg-header', 'pg-footer']);

function classes(attribs: Record<string, string>): string[] {
  return (attribs.class ?? '').split(/\s+/);
}

function isPgBoilerplate(attribs: Record<string, string>): boolean {
  return PG_IDS.has(attribs.id ?? '') || classes(attribs).includes('pg-boilerplate');
}

function isSkipped(name: string, attribs: Record<string, string>): boolean {
  if (SKIP_TAGS.has(name)) return true;
  // Gutenberg's page-number markers, and EPUB 3 page breaks.
  if (classes(attribs).includes('pagenum')) return true;
  if ((attribs['epub:type'] ?? '').split(/\s+/).includes('pagebreak')) return true;
  // No-images Gutenberg files replace each <img> with <span id="img_…">alt text</span>.
  if (isImagePlaceholder(name, attribs)) return true;
  // Illustration captions belong to the (skipped) image, even when placed inside a heading.
  if (classes(attribs).includes('caption')) return true;
  return false;
}

/**
 * A decorative initial ("drop cap") is drawn as an image whose alt text is the missing letter:
 * `<img alt="M"/>R. BENNET` must read "MR. BENNET". No-images files turn it into
 * `<span id="img_…">M</span>`. Only a single capital letter counts, so real alt text stays out.
 */
function dropCapLetter(text: string): string | null {
  const t = text.trim();
  return /^\p{Lu}$/u.test(t) ? t : null;
}

function isImagePlaceholder(name: string, attribs: Record<string, string>): boolean {
  return name === 'span' && (attribs.id ?? '').startsWith('img_');
}

/**
 * Turns one XHTML content document into blocks of words. Each block's whole text is tokenized at
 * once, so markup inside a word (`<i>wo</i>rd`) doesn't split it. A word gets `em` only if all of
 * it is inside i/em/cite; partly emphasised words get none.
 */
export function parseXhtml(html: string, anchorIds: ReadonlySet<string> = new Set()): XhtmlResult {
  const blocks: Block[] = [];
  const anchors = new Map<string, number>();
  const blockStack: string[] = [];
  let pgMarkup = false;
  /** Ebookmaker's "linked image" pages hold one image and a "back" link: no text to read. */
  let imagePage = false;
  let depth = 0;
  /** Depth of the element being skipped, or -1. */
  let skipAt = -1;
  /** Text inside a skipped no-images placeholder, kept in case it is a drop cap. */
  let placeholder: string | null = null;
  let emDepth = 0;
  let text = '';
  /** Emphasised [start, end) ranges of `text`, ascending, adjacent ones merged. */
  let em: [number, number][] = [];

  const flush = () => {
    const words = toWords(text, em);
    text = '';
    em = [];
    if (words.length === 0) return;
    const heading = /^h([1-6])$/.exec(blockStack[blockStack.length - 1] ?? '');
    blocks.push(
      heading
        ? { kind: 'heading', level: Number(heading[1]), words }
        : { kind: 'paragraph', words },
    );
  };

  const append = (data: string) => {
    const start = text.length;
    text += data;
    if (emDepth === 0 || data.length === 0) return;
    const last = em[em.length - 1];
    if (last && last[1] === start) last[1] = text.length;
    else em.push([start, text.length]);
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        depth++;
        // Record anchors after a block start has flushed the text before it, so the anchor's
        // position is the index of the first block at or after it. Anchors inside skipped
        // content (e.g. the licence heading) still count.
        const mark = () => {
          const id = attribs.id;
          if (id && anchorIds.has(id) && !anchors.has(id)) anchors.set(id, blocks.length);
        };
        if (skipAt !== -1) {
          mark();
          return;
        }
        if (isPgBoilerplate(attribs)) pgMarkup = true;
        if (name === 'img' && classes(attribs).includes('x-ebookmaker-wrapper')) imagePage = true;
        const letter = name === 'img' ? dropCapLetter(attribs.alt ?? '') : null;
        if (letter) append(letter);
        if (isPgBoilerplate(attribs) || isSkipped(name, attribs)) {
          skipAt = depth;
          if (isImagePlaceholder(name, attribs)) placeholder = '';
          mark();
          return;
        }
        if (BLOCK_TAGS.has(name)) {
          flush();
          blockStack.push(name);
        } else if (EMPHASIS_TAGS.has(name)) {
          emDepth++;
        } else if (name === 'br') {
          append(' ');
        }
        mark();
      },
      ontext(data) {
        if (skipAt === -1) append(data);
        else if (placeholder !== null) placeholder += data;
      },
      onclosetag(name) {
        if (skipAt !== -1) {
          if (depth === skipAt) {
            skipAt = -1;
            const letter = placeholder === null ? null : dropCapLetter(placeholder);
            if (letter) append(letter);
            placeholder = null;
          }
        } else if (BLOCK_TAGS.has(name)) {
          flush();
          blockStack.pop();
        } else if (EMPHASIS_TAGS.has(name)) {
          emDepth--;
        }
        depth--;
      },
    },
    // HTML mode decodes named entities (&nbsp;); XHTML's self-closing <div/> must still close.
    { recognizeSelfClosing: true },
  );
  parser.end(html);
  flush();
  if (imagePage) {
    for (const id of anchors.keys()) anchors.set(id, 0);
    return { blocks: [], pgMarkup, anchors };
  }
  return { blocks, pgMarkup, anchors };
}

function toWords(text: string, em: [number, number][]): Word[] {
  let cursor = 0;
  return tokenize(text).map((token) => {
    // Tokens are substrings of `text` in order, so their offsets can be found by searching on.
    const start = text.indexOf(token, cursor);
    const end = start + token.length;
    cursor = end;
    return em.some(([s, e]) => s <= start && end <= e)
      ? { text: token, em: true }
      : { text: token };
  });
}
