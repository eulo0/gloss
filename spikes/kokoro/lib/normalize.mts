/**
 * Per-source-word text normalisation for the Kokoro spike.
 *
 * kokoro-js normalises the whole string with regexes, which loses the link between source words and
 * spoken words. Here each source word is normalised on its own, so every spoken word keeps the ID
 * of the source word it came from (decision 5). The rules are a subset of kokoro-js's own
 * normaliser (Apache-2.0), enough to cover the spike's test passages. Not production code.
 */

export interface SourceWord {
  id: number;
  /** Text exactly as it appears in the source, including attached punctuation. */
  text: string;
}

export interface SpokenWord {
  sourceId: number;
  /** One whitespace-free word as it will be fed to the phonemizer, without punctuation. */
  text: string;
}

export interface NormalizedSourceWord {
  sourceId: number;
  /** Leading punctuation kept for prosody (quotes, brackets). */
  lead: string;
  /** Spoken words; empty when the source word is pure punctuation. */
  words: string[];
  /** Trailing punctuation kept for prosody and sentence splitting. */
  trail: string;
}

const LEAD = /^[("“'‘«[]+/;
const TRAIL = /[)"”'’»\].,;:!?…—]+$/;

const TITLES: Record<string, string> = {
  'mr.': 'Mister',
  'mrs.': 'Missus',
  'ms.': 'Miss',
  'dr.': 'Doctor',
  'st.': 'Saint',
  'prof.': 'Professor',
};

/** Splits source text into words. Em dashes become trailing punctuation of the word before. */
export function tokenizeSource(text: string): SourceWord[] {
  return text
    .replace(/—/g, '— ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((text, id) => ({ id, text }));
}

function year(digits: string, plural: string): string {
  const n = Number(digits);
  if (n < 1100 || n % 1000 < 10) return digits + plural;
  const hi = digits.slice(0, 2);
  const lo = Number(digits.slice(2));
  if (lo === 0) return `${hi} hundred${plural}`;
  if (lo < 10) return `${hi} oh ${lo}${plural}`;
  return `${hi} ${lo}${plural}`;
}

function money(symbol: string, whole: string, frac: string | undefined): string {
  const unit = symbol === '$' ? 'dollar' : 'pound';
  const units = `${whole} ${unit}${whole === '1' ? '' : 's'}`;
  if (frac === undefined) return units;
  const cents = Number(frac.padEnd(2, '0'));
  const sub = symbol === '$' ? (cents === 1 ? 'cent' : 'cents') : cents === 1 ? 'penny' : 'pence';
  return `${units} and ${cents} ${sub}`;
}

/** Turns the core of a word (punctuation stripped) into spoken text. */
function speak(core: string): string {
  const title = TITLES[core.toLowerCase()];
  if (title) return title;

  // Thousands separators first, as kokoro-js does, so "$1,200" isn't read "dollar one, two hundred".
  core = core.replace(/(?<=\d),(?=\d{3}\b)/g, '');

  let m = /^([$£])(\d+)(?:\.(\d{1,2}))?$/.exec(core);
  if (m) return money(m[1], m[2], m[3]);

  // Letter abbreviations: "p.m." -> "p-m", "U.S.A." -> "U-S-A".
  if (/^(?:[A-Za-z]\.){2,}$/.test(core)) return core.slice(0, -1).replace(/\./g, '-');

  m = /^(\d{4})(s?)$/.exec(core);
  if (m) return year(m[1], m[2]);

  m = /^(\d{1,2}):(\d\d)$/.exec(core);
  if (m) {
    const min = Number(m[2]);
    return min === 0 ? `${m[1]} o'clock` : min < 10 ? `${m[1]} oh ${min}` : `${m[1]} ${min}`;
  }

  m = /^(\d+)-(\d+)$/.exec(core);
  if (m) return `${m[1]} to ${m[2]}`;

  m = /^(\d*)\.(\d+)$/.exec(core);
  if (m) return `${m[1] || 'zero'} point ${m[2].split('').join(' ')}`;

  if (core === '&') return 'and';

  return core.replace(/[‘’]/g, "'");
}

/** Normalises one source word into spoken words, keeping the punctuation around it. */
export function normalizeWord(word: SourceWord): NormalizedSourceWord {
  let core = word.text;
  const lead = LEAD.exec(core)?.[0] ?? '';
  core = core.slice(lead.length);

  // Abbreviations own their final period ("Mr.", "p.m."), so check them before stripping.
  const abbrev = /^((?:[A-Za-z]\.){2,}|(?:mr|mrs|ms|dr|st|prof)\.)(.*)$/i.exec(core);
  let trail: string;
  if (abbrev && (abbrev[2] === '' || TRAIL.test(abbrev[2]))) {
    core = abbrev[1];
    trail = abbrev[2];
  } else {
    trail = TRAIL.exec(core)?.[0] ?? '';
    core = core.slice(0, core.length - trail.length);
  }

  const spoken = core.length > 0 ? speak(core) : '';
  return {
    sourceId: word.id,
    lead: lead.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'"),
    words: spoken.split(/\s+/).filter((w) => w.length > 0),
    trail: trail.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'"),
  };
}

/** Text to feed the phonemizer for a run of normalised words. */
export function spokenText(words: NormalizedSourceWord[]): string {
  return words.map((w) => w.lead + w.words.join(' ') + w.trail).join(' ');
}

/** Flattens normalised words into spoken words, each tagged with its source word ID. */
export function spokenWords(words: NormalizedSourceWord[]): SpokenWord[] {
  return words.flatMap((w) => w.words.map((text) => ({ sourceId: w.sourceId, text })));
}

/**
 * Splits normalised words into sentences, so each fits Kokoro's 510-token window. A sentence ends
 * at a word whose trailing punctuation contains . ! ? or …
 */
export function splitSentences(words: NormalizedSourceWord[]): NormalizedSourceWord[][] {
  const out: NormalizedSourceWord[][] = [];
  let cur: NormalizedSourceWord[] = [];
  for (const w of words) {
    cur.push(w);
    if (/[.!?…]/.test(w.trail)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
}
