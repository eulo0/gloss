import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenize';

const NBSP = String.fromCharCode(0xa0);

describe('tokenize', () => {
  it('splits on whitespace and after em dashes', () => {
    expect(tokenize('Yes—no,  maybe')).toEqual(['Yes—', 'no,', 'maybe']);
  });

  it('keeps punctuation attached', () => {
    expect(tokenize('“Is it ever)?” she asked.')).toEqual([
      '“Is',
      'it',
      'ever)?”',
      'she',
      'asked.',
    ]);
  });

  it('treats non-breaking spaces and newlines as whitespace', () => {
    expect(tokenize(`Mr.${NBSP}Darcy\nwalked`)).toEqual(['Mr.', 'Darcy', 'walked']);
  });

  it('returns no words for empty or blank text', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(' \n\t ')).toEqual([]);
  });

  it('keeps a lone em dash as a word', () => {
    expect(tokenize('wait — now')).toEqual(['wait', '—', 'now']);
  });
});
