import { describe, expect, it } from 'vitest';
import { labelPhonemes, sourceSpans, tokenSpans, wordSpans, SAMPLES_PER_FRAME } from './align.mts';

// Phoneme strings below were captured from espeak-ng (en-us) via the phonemizer package, so these
// tests need neither Kokoro nor the network.

describe('tokenSpans', () => {
  it('rounds float frames, clamps to 1 frame and accumulates samples', () => {
    expect(tokenSpans([14.14, 0.2, 1.5, 2.49])).toEqual([
      { start: 0, end: 14 * 600 },
      { start: 14 * 600, end: 15 * 600 },
      { start: 15 * 600, end: 17 * 600 },
      { start: 17 * 600, end: 19 * 600 },
    ]);
  });
});

describe('labelPhonemes', () => {
  it('labels one-group-per-word strings directly', () => {
    const labels = labelPhonemes('mˈæn ɪn', ['mˈæn', 'ɪn']);
    expect(labels).toEqual([0, 0, 0, 0, null, 1, 1]);
  });

  it('splits groups that espeak merged across words', () => {
    // "that a single": espeak joins "that a" into one group "ðˌæɾə".
    const actual = 'ðˌæɾə sˈɪŋɡəl';
    const labels = labelPhonemes(actual, ['ðˈæt', 'ˈeɪ', 'sˈɪŋɡəl']);
    expect(labels.slice(0, 4)).toEqual([0, 0, 0, 0]); // ð ˌ æ ɾ
    expect(labels[4]).toBe(1); // ə ("a")
    expect(labels.slice(6)).toEqual(Array(7).fill(2));
  });

  it('keeps labels monotonic for reduced function words', () => {
    // "in possession of a good": "of a" -> "əvə".
    const labels = labelPhonemes('ɪn pəzˈɛʃən əvə ɡˈʊd', ['ɪn', 'pəzˈɛʃən', 'ʌv', 'ˈeɪ', 'ɡˈʊd']);
    const seen = labels.filter((l): l is number => l !== null);
    expect(seen).toEqual([...seen].sort((x, y) => x - y));
    expect(new Set(seen)).toEqual(new Set([0, 1, 2, 3, 4]));
  });
});

describe('wordSpans', () => {
  it('skips the leading pad and leaves pauses unlabelled', () => {
    // "ab, c": tokens = pad a b , space c pad
    const spans = wordSpans('ab, c', ['ab', 'c'], [4, 1, 2, 3, 1, 2, 5]);
    const f = SAMPLES_PER_FRAME;
    expect(spans).toEqual([
      { start: 4 * f, end: 7 * f },
      { start: 11 * f, end: 13 * f },
    ]);
  });

  it('rejects durations that do not match the phoneme string', () => {
    expect(() => wordSpans('ab', ['ab'], [1, 1, 1])).toThrow(/Expected 4 durations/);
  });
});

describe('sourceSpans', () => {
  it('merges spoken words that came from one source word', () => {
    const map = sourceSpans(
      [0, 1, 1, 1],
      [{ start: 0, end: 10 }, { start: 12, end: 20 }, null, { start: 25, end: 40 }],
    );
    expect(map.get(0)).toEqual({ start: 0, end: 10 });
    expect(map.get(1)).toEqual({ start: 12, end: 40 });
  });
});
