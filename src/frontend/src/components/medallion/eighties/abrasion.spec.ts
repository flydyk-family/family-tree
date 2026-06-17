import { describe, it, expect } from 'vitest';
import { abrasionFor } from './abrasion';

describe('abrasionFor', () => {
  it('is deterministic for a given id', () => {
    expect(abrasionFor('p-42')).toEqual(abrasionFor('p-42'));
  });
  it('differs across ids', () => {
    expect(abrasionFor('p-1')).not.toEqual(abrasionFor('p-2'));
  });
  it('returns a scratch x (null or in [0,1]) and 2–3 dust specks in range', () => {
    const a = abrasionFor('p-7');
    if (a.scratchX !== null) {
      expect(a.scratchX).toBeGreaterThanOrEqual(0);
      expect(a.scratchX).toBeLessThanOrEqual(1);
    }
    expect(a.dust.length).toBeGreaterThanOrEqual(2);
    expect(a.dust.length).toBeLessThanOrEqual(3);
    for (const d of a.dust) {
      expect(d.x).toBeGreaterThanOrEqual(0); expect(d.x).toBeLessThanOrEqual(1);
      expect(d.y).toBeGreaterThanOrEqual(0); expect(d.y).toBeLessThanOrEqual(1);
    }
  });

  it('makes the long scratch optional (null on most cards)', () => {
    const present = Array.from({ length: 200 }, (_, i) => abrasionFor(`p-${i}`))
      .filter(a => a.scratchX !== null).length;
    // ~30% expected; assert it's clearly a minority, not always-on
    expect(present).toBeGreaterThan(20);
    expect(present).toBeLessThan(120);
  });
});
