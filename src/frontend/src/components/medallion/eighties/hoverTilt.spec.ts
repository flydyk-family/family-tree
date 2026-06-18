import { describe, it, expect } from 'vitest';
import { hoverTilt } from './hoverTilt';

describe('hoverTilt', () => {
  it('is deterministic for a given id', () => {
    expect(hoverTilt('p-42')).toEqual(hoverTilt('p-42'));
  });
  it('differs across ids', () => {
    expect(hoverTilt('p-1')).not.toEqual(hoverTilt('p-2'));
  });
  it('keeps the magnitude a gentle 2–4°', () => {
    for (let i = 0; i < 200; i++) {
      const a = Math.abs(hoverTilt(`p-${i}`).angleDeg);
      expect(a).toBeGreaterThanOrEqual(2);
      expect(a).toBeLessThanOrEqual(4);
    }
  });
  it('tilts both directions across the population', () => {
    const angles = Array.from({ length: 200 }, (_, i) => hoverTilt(`p-${i}`).angleDeg);
    expect(angles.some(a => a < 0)).toBe(true);
    expect(angles.some(a => a > 0)).toBe(true);
  });
});
