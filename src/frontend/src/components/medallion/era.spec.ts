import { describe, it, expect } from 'vitest';
import { cardEra, filmHoles } from './era';

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

describe('filmHoles', () => {
  it('gives 1990+ births filled holes', () => {
    expect(filmHoles(1990)).toBe('filled');
    expect(filmHoles(2018)).toBe('filled');
  });
  it('keeps pre-1990 film-era births transparent', () => {
    expect(filmHoles(1989)).toBe('transparent');
    expect(filmHoles(1945)).toBe('transparent');
  });
  it('defaults to transparent for an unknown birth year', () => {
    expect(filmHoles(null)).toBe('transparent');
  });
});
