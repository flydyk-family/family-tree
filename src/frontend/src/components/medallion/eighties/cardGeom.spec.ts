import { describe, it, expect } from 'vitest';
import { cardGeom } from './cardGeom';

describe('cardGeom', () => {
  it('uses a wider card for the trunk than a leaf', () => {
    expect(cardGeom('trunk').w).toBeGreaterThan(cardGeom('leaf').w);
  });
  it('centres the image box horizontally on the origin', () => {
    const g = cardGeom('branch');
    expect(g.imgX).toBeCloseTo(-g.imgW / 2);
  });
  it('places the name above and the years below the image box', () => {
    const g = cardGeom('branch');
    expect(g.nameY).toBeLessThan(g.imgY);
    expect(g.yearsY).toBeGreaterThan(g.imgY + g.imgH);
  });
});
