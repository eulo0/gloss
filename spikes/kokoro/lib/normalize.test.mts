import { describe, expect, it } from 'vitest';
import {
  normalizeWord,
  splitSentences,
  spokenText,
  spokenWords,
  tokenizeSource,
} from './normalize.mts';

const norm = (text: string) => tokenizeSource(text).map(normalizeWord);

describe('tokenizeSource', () => {
  it('splits on whitespace and after em dashes', () => {
    expect(tokenizeSource('Yes—no,  maybe').map((w) => w.text)).toEqual(['Yes—', 'no,', 'maybe']);
  });
});

describe('normalizeWord', () => {
  it('expands titles and keeps the source ID', () => {
    expect(norm('Mr. Darcy')).toEqual([
      { sourceId: 0, lead: '', words: ['Mister'], trail: '' },
      { sourceId: 1, lead: '', words: ['Darcy'], trail: '' },
    ]);
  });

  it('expands currency into several spoken words for one source word', () => {
    expect(norm('£3.50,')[0]).toEqual({
      sourceId: 0,
      lead: '',
      words: ['3', 'pounds', 'and', '50', 'pence'],
      trail: ',',
    });
    expect(norm('$1')[0].words).toEqual(['1', 'dollar']);
    expect(norm('$1,200')[0].words).toEqual(['1200', 'dollars']);
  });

  it('handles letter abbreviations, years, times, ranges, decimals and thousands', () => {
    const words = (t: string) => norm(t).flatMap((w) => w.words);
    expect(words('p.m.')).toEqual(['p-m']);
    expect(words('1813')).toEqual(['18', '13']);
    expect(words('1900s')).toEqual(['19', 'hundreds']);
    expect(words('4:05')).toEqual(['4', 'oh', '5']);
    expect(words('10-12')).toEqual(['10', 'to', '12']);
    expect(words('3.14')).toEqual(['3', 'point', '1', '4']);
    expect(words('10,000')).toEqual(['10000']);
  });

  it('keeps hyphenated words whole and separates quotes and punctuation', () => {
    expect(norm('“well-known!”')[0]).toEqual({
      sourceId: 0,
      lead: '"',
      words: ['well-known'],
      trail: '!"',
    });
  });

  it('gives pure punctuation no spoken words', () => {
    expect(norm('—')[0].words).toEqual([]);
  });
});

describe('sentences and spoken text', () => {
  it('splits on sentence punctuation but not inside abbreviations', () => {
    const sentences = splitSentences(norm('Mr. Darcy paid £3.50 at 4 p.m. It rained. Then'));
    expect(sentences.map((s) => spokenText(s))).toEqual([
      'Mister Darcy paid 3 pounds and 50 pence at 4 p-m It rained.',
      'Then',
    ]);
  });

  it('flattens spoken words with their source IDs', () => {
    expect(spokenWords(norm('Mr. £1')).map((w) => [w.sourceId, w.text])).toEqual([
      [0, 'Mister'],
      [1, '1'],
      [1, 'pound'],
    ]);
  });
});
