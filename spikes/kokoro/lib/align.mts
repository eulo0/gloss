/**
 * Turns Kokoro's per-token durations into per-word times.
 *
 * Kokoro's input is one token per phoneme character, plus a pad token at each end. The timestamped
 * ONNX export returns one duration per token, in frames of 600 samples at 24 kHz (25 ms). The model
 * rounds each duration (minimum 1 frame) before upsampling, so the rounded frames sum to the exact
 * waveform length and the timings can't drift from the audio.
 *
 * espeak joins some words into one phoneme group ("of a" -> "əvə"), so splitting the phoneme string
 * on spaces doesn't give one group per word. Instead, each spoken word is phonemized on its own as
 * a reference, and an edit-distance alignment labels every phoneme character of the real
 * (in-context) phoneme string with the word it belongs to.
 */

export const SAMPLE_RATE = 24_000;
export const SAMPLES_PER_FRAME = 600;

/** Characters that are pauses, not part of any word. Matches kokoro-js's punctuation set. */
const PAUSE = new Set([...';:,.!?¡¿—…"«»“”(){}[] ']);

/**
 * Stress marks (before a vowel) and the length mark (after one) are left out of the alignment, since
 * espeak moves them around in context, and they take the label of the character they modify.
 */
const STRESS = new Set(['ˈ', 'ˌ']);
const LENGTH = 'ː';
const isMark = (ch: string) => STRESS.has(ch) || ch === LENGTH;

const VOWELS = new Set([...'aeiouyæɑɐɒɔəɚɛɜɝɪʊʌᵻɨøœɯɤɵʉɘɞɶʏ']);

/**
 * Edit costs, doubled to stay integral. A vowel swapped for a consonant costs more than a
 * like-for-like swap, so in-context reductions ("t" -> flap "ɾ", "eɪ" -> "ə") align to the right
 * word when costs would otherwise tie.
 */
const INDEL = 2;
function subCost(x: string, y: string): number {
  if (x === y) return 0;
  return VOWELS.has(x) === VOWELS.has(y) ? 2 : 3;
}

export interface Span {
  start: number;
  end: number;
}

/** Sample span of each token, from the model's raw float durations. */
export function tokenSpans(durations: readonly number[]): Span[] {
  const spans: Span[] = [];
  let t = 0;
  for (const d of durations) {
    const frames = Math.max(1, Math.round(d));
    spans.push({ start: t, end: t + frames * SAMPLES_PER_FRAME });
    t += frames * SAMPLES_PER_FRAME;
  }
  return spans;
}

/**
 * Labels each character of `actual` with the index of the reference word it belongs to, or null
 * for pauses (spaces, punctuation). `refs[i]` is the phonemization of spoken word i on its own.
 */
export function labelPhonemes(actual: string, refs: readonly string[]): (number | null)[] {
  const a: number[] = []; // indices into `actual` that need a label
  for (let i = 0; i < actual.length; i++) {
    if (!PAUSE.has(actual[i]) && !isMark(actual[i])) a.push(i);
  }

  const r: string[] = [];
  const rLabel: number[] = [];
  refs.forEach((ref, w) => {
    for (const ch of ref) {
      if (PAUSE.has(ch) || isMark(ch)) continue;
      r.push(ch);
      rLabel.push(w);
    }
  });

  // Levenshtein DP: dp[i][j] = cost of aligning a[0..i) with r[0..j).
  const n = a.length;
  const m = r.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 0; i <= n; i++) dp[i][0] = i * INDEL;
  for (let j = 0; j <= m; j++) dp[0][j] = j * INDEL;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = dp[i - 1][j - 1] + subCost(actual[a[i - 1]], r[j - 1]);
      dp[i][j] = Math.min(sub, dp[i - 1][j] + INDEL, dp[i][j - 1] + INDEL);
    }
  }

  // Backtrace, preferring diagonal moves. Inserted characters get no label yet.
  const labels: (number | null)[] = new Array(actual.length).fill(null);
  const pending: number[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const sub = dp[i - 1][j - 1] + subCost(actual[a[i - 1]], r[j - 1]);
      if (dp[i][j] === sub) {
        labels[a[i - 1]] = rLabel[j - 1];
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + INDEL) {
      pending.push(a[i - 1]);
      i--;
    } else {
      j--;
    }
  }

  // An inserted character takes the label of the nearest labelled character in its own
  // space-separated group (previous first), else the previous labelled character overall.
  for (const idx of pending.reverse()) {
    labels[idx] = nearestLabel(actual, labels, idx);
  }

  for (let k = 0; k < actual.length; k++) {
    if (STRESS.has(actual[k])) labels[k] = neighbourLabel(actual, labels, k, +1);
    else if (actual[k] === LENGTH) labels[k] = neighbourLabel(actual, labels, k, -1);
  }
  return labels;
}

/** Label of the nearest non-mark character in direction `dir`, staying inside the space group. */
function neighbourLabel(
  actual: string,
  labels: (number | null)[],
  idx: number,
  dir: 1 | -1,
): number | null {
  for (let k = idx + dir; k >= 0 && k < actual.length && !PAUSE.has(actual[k]); k += dir) {
    if (!isMark(actual[k])) return labels[k];
  }
  return null;
}

function nearestLabel(actual: string, labels: (number | null)[], idx: number): number | null {
  for (let k = idx - 1; k >= 0 && actual[k] !== ' '; k--) if (labels[k] !== null) return labels[k];
  for (let k = idx + 1; k < actual.length && actual[k] !== ' '; k++) {
    if (labels[k] !== null) return labels[k];
  }
  for (let k = idx - 1; k >= 0; k--) if (labels[k] !== null) return labels[k];
  return null;
}

/**
 * Sample span of each spoken word. Token 0 is the leading pad, so phoneme character k is token
 * k + 1. A word with no aligned characters gets null.
 */
export function wordSpans(
  phonemes: string,
  refs: readonly string[],
  durations: readonly number[],
): (Span | null)[] {
  if (durations.length !== phonemes.length + 2) {
    throw new Error(
      `Expected ${phonemes.length + 2} durations (one per phoneme + 2 pads), got ${durations.length}`,
    );
  }
  const tokens = tokenSpans(durations);
  const labels = labelPhonemes(phonemes, refs);
  const spans: (Span | null)[] = refs.map(() => null);
  labels.forEach((w, k) => {
    if (w === null) return;
    const t = tokens[k + 1];
    const s = spans[w];
    spans[w] = s ? { start: Math.min(s.start, t.start), end: Math.max(s.end, t.end) } : { ...t };
  });
  return spans;
}

/** Merges spoken-word spans into one span per source word (e.g. "£3.50" -> 6 spoken words). */
export function sourceSpans(
  sourceIds: readonly number[],
  spans: readonly (Span | null)[],
): Map<number, Span> {
  const out = new Map<number, Span>();
  sourceIds.forEach((id, k) => {
    const s = spans[k];
    if (!s) return;
    const prev = out.get(id);
    out.set(
      id,
      prev ? { start: Math.min(prev.start, s.start), end: Math.max(prev.end, s.end) } : s,
    );
  });
  return out;
}
