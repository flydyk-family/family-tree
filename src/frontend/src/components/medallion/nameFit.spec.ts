import { describe, it, expect } from 'vitest';
import { nameFontSize } from './nameFit';

const MAX = 164; // ~0.82 * 200 (trunk)

describe('nameFontSize', () => {
  it('caps short names at the maximum size', () => {
    expect(nameFontSize('Ян', MAX)).toBeCloseTo(MAX * 0.093, 5);
  });
  it('shrinks long names below the cap', () => {
    expect(nameFontSize('Александр Воронцов-Вельяминов', MAX)).toBeLessThan(MAX * 0.093);
  });
  it('never drops below the floor, even for absurd names', () => {
    expect(nameFontSize('x'.repeat(80), MAX)).toBeCloseTo(MAX * 0.056, 5);
  });
  it('is monotonic: a longer name is never larger', () => {
    expect(nameFontSize('Станислав Ковальский', MAX))
      .toBeLessThanOrEqual(nameFontSize('Ян Лис', MAX));
  });
  it('treats an empty name as length 1 (no divide-by-zero)', () => {
    expect(nameFontSize('', MAX)).toBeCloseTo(MAX * 0.093, 5);
  });
});
