/**
 * Splits source text into words: on whitespace and after em dashes, with punctuation kept attached
 * ("“Is", "ever)?”"). Ported from the spike's `tokenizeSource` (spikes/kokoro/lib/normalize.mts);
 * slice 3 maps Kokoro's spoken words back to these words, so the two must split identically.
 */
export function tokenize(text: string): string[] {
  return text
    .replace(/—/g, '— ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}
