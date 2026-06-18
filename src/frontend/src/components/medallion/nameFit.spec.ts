import { describe, it, expect } from 'vitest';
import { nameFontSize, fitName } from './nameFit';

const MAX = 164; // ~0.82 * 200 (trunk)

describe('nameFontSize', () => {
  it('caps short names at the maximum size', () => {
    expect(nameFontSize('Ян', MAX)).toBeCloseTo(MAX * 0.1116, 5);
  });
  it('shrinks long names below the cap', () => {
    expect(nameFontSize('Александр Воронцов-Вельяминов', MAX)).toBeLessThan(MAX * 0.1116);
  });
  it('never drops below the floor, even for absurd names', () => {
    expect(nameFontSize('x'.repeat(80), MAX)).toBeCloseTo(MAX * 0.0672, 5);
  });
  it('is monotonic: a longer name is never larger', () => {
    expect(nameFontSize('Станислав Ковальский', MAX))
      .toBeLessThanOrEqual(nameFontSize('Ян Лис', MAX));
  });
  it('treats an empty name as length 1 (no divide-by-zero)', () => {
    expect(nameFontSize('', MAX)).toBeCloseTo(MAX * 0.1116, 5);
  });
});

describe('fitName', () => {
  it('keeps a short name on one line at the one-line size', () => {
    const r = fitName('Ян Ліс', MAX);
    expect(r.lines).toEqual(['Ян Ліс']);
    expect(r.fontSize).toBe(nameFontSize('Ян Ліс', MAX));
  });

  it('wraps a long three-part name onto two balanced lines', () => {
    const r = fitName('Аляксандр Іванавіч Кавальскі', MAX);
    expect(r.lines).toHaveLength(2);
    // balanced: the longer line is as short as possible
    expect(r.lines.join(' ')).toBe('Аляксандр Іванавіч Кавальскі');
    const longer = Math.max(...r.lines.map(l => l.length));
    expect(longer).toBeLessThan('Аляксандр Іванавіч Кавальскі'.length);
  });

  it('two-line wrap yields a larger font than squishing onto one line', () => {
    const name = 'Аляксандр Іванавіч Кавальскі';
    expect(fitName(name, MAX).fontSize).toBeGreaterThan(nameFontSize(name, MAX));
  });

  it('never wraps a single unsplittable word', () => {
    const r = fitName('Воронцов-Вельяминовскихбергштейн', MAX);
    expect(r.lines).toHaveLength(1);
  });

  it('reports a line height proportional to the font size', () => {
    const r = fitName('Ян', MAX);
    expect(r.lineHeight).toBeCloseTo(r.fontSize * 1.05, 5);
  });
});
