import { describe, it, expect } from 'vitest';
import { ropePath, branchPath, ROPE_SAG } from './oakConnectors';
import type { Seg } from '../layout/familyRouting';

const seg = (a: [number, number], b: [number, number]): Seg => ({ a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } });

describe('ropePath', () => {
  it('is a quadratic whose control point sags below both endpoints', () => {
    const d = ropePath(seg([0, 0], [100, 200]), 'vertical');
    expect(d.startsWith('M 0 0 Q ')).toBe(true);
    const ctrlY = Number(d.match(/Q\s[\d.-]+\s([\d.-]+)/)![1]);
    expect(ctrlY).toBe(200 + ROPE_SAG); // control y = max(y1,y2) + sag
  });

  it('sags downward even when both endpoints share a y', () => {
    const d = ropePath(seg([0, 50], [200, 50]), 'horizontal');
    const ctrlY = Number(d.match(/Q\s[\d.-]+\s([\d.-]+)/)![1]);
    expect(ctrlY).toBe(50 + ROPE_SAG);
  });
});

describe('branchPath', () => {
  it('is a cubic with vertical tangents in the vertical orientation', () => {
    const d = branchPath(seg([0, 0], [100, 200]), 'vertical');
    // control points share the endpoints' x and sit at the mid y
    expect(d).toBe('M 0 0 C 0 100, 100 100, 100 200');
  });

  it('is a cubic with horizontal tangents in the horizontal orientation', () => {
    const d = branchPath(seg([0, 0], [200, 100]), 'horizontal');
    expect(d).toBe('M 0 0 C 100 0, 100 100, 200 100');
  });
});
