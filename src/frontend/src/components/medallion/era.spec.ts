import { describe, it, expect } from 'vitest';
import { cardEra, filmVariant } from './era';

describe('cardEra', () => {
  it('classifies pre-1900 births as cabinet', () => {
    expect(cardEra(1899)).toBe('cabinet');
    expect(cardEra(1820)).toBe('cabinet');
  });
  it('classifies 1900–1944 births as gelatin', () => {
    expect(cardEra(1900)).toBe('gelatin');
    expect(cardEra(1944)).toBe('gelatin');
  });
  it('classifies 1945+ births as film', () => {
    expect(cardEra(1945)).toBe('film');
    expect(cardEra(2010)).toBe('film');
  });
  it('falls back to film for an unknown birth year', () => {
    expect(cardEra(null)).toBe('film');
  });
});

describe('filmVariant', () => {
  it('gives 1990+ births the edge-print frame', () => {
    expect(filmVariant(1990)).toBe('edgeprint');
    expect(filmVariant(2018)).toBe('edgeprint');
  });
  it('keeps pre-1990 film-era births on the holed frame', () => {
    expect(filmVariant(1989)).toBe('holed');
    expect(filmVariant(1945)).toBe('holed');
  });
  it('defaults to the holed frame for an unknown birth year', () => {
    expect(filmVariant(null)).toBe('holed');
  });
});
