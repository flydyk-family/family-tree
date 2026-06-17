import { describe, it, expect } from 'vitest';
import { seededRandom } from './seed';

describe('seededRandom', () => {
  it('is deterministic for a given id', () => {
    const a = seededRandom('p-42'); const b = seededRandom('p-42');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('differs across ids', () => {
    expect(seededRandom('p-1')()).not.toEqual(seededRandom('p-2')());
  });
  it('returns values in [0,1)', () => {
    const r = seededRandom('p-7');
    for (let i = 0; i < 50; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});
