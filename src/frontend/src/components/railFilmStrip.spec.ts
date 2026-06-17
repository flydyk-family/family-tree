import { describe, it, expect } from 'vitest';
import { sprocketPitch, sprocketOffset } from './railFilmStrip';

describe('sprocketPitch', () => {
  it('stays within the clamp range across zoom levels', () => {
    for (const pxPerYear of [4, 8, 16]) {
      for (const k of [0.1, 0.5, 1, 2, 5, 20]) {
        const p = sprocketPitch(pxPerYear, k);
        expect(p).toBeGreaterThanOrEqual(9);
        expect(p).toBeLessThanOrEqual(34);
      }
    }
  });
  it('is deterministic', () => {
    expect(sprocketPitch(8, 1)).toBe(sprocketPitch(8, 1));
  });
});

describe('sprocketOffset', () => {
  it('wraps into [0, pitch)', () => {
    expect(sprocketOffset(-5, 16)).toBeGreaterThanOrEqual(0);
    expect(sprocketOffset(-5, 16)).toBeLessThan(16);
    expect(sprocketOffset(40, 16)).toBeGreaterThanOrEqual(0);
    expect(sprocketOffset(40, 16)).toBeLessThan(16);
  });
});
