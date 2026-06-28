import { describe, it, expect } from 'vitest';
import { ropePath, branchPath, ROPE_SAG, ROPE_SAG_FACTOR, BRANCH_BOW } from './oakConnectors';
import type { Seg } from '../layout/familyRouting';

const seg = (a: [number, number], b: [number, number]): Seg => ({ a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } });

describe('ropePath', () => {
  it('is a quadratic whose control point sags below both endpoints, deepening with length', () => {
    const d = ropePath(seg([0, 0], [100, 200]), 'vertical');
    expect(d.startsWith('M 0 0 Q ')).toBe(true);
    const ctrlY = Number(d.match(/Q\s[\d.-]+\s([\d.-]+)/)![1]);
    const chord = Math.hypot(100, 200);
    expect(ctrlY).toBeCloseTo(200 + ROPE_SAG + chord * ROPE_SAG_FACTOR, 4);
  });

  it('sags more on a longer cord than a shorter one', () => {
    const ctrl = (d: string) => Number(d.match(/Q\s[\d.-]+\s([\d.-]+)/)![1]);
    const shortY = ctrl(ropePath(seg([0, 50], [40, 50]), 'horizontal'));
    const longY = ctrl(ropePath(seg([0, 50], [400, 50]), 'horizontal'));
    expect(longY).toBeGreaterThan(shortY); // both at base y=50, longer cord droops further
  });

  it('bows deeper when given a bow factor > 1', () => {
    const ctrl = (d: string) => Number(d.match(/Q\s[\d.-]+\s([\d.-]+)/)![1]);
    const base = ctrl(ropePath(seg([0, 0], [100, 200]), 'vertical'));
    const deep = ctrl(ropePath(seg([0, 0], [100, 200]), 'vertical', 1.7));
    expect(deep).toBeGreaterThan(base);
  });
});

describe('branchPath', () => {
  it('is a cubic whose vertical tangents reach BRANCH_BOW across the span', () => {
    const d = branchPath(seg([0, 0], [100, 200]), 'vertical');
    const c1 = 0 + 200 * BRANCH_BOW;
    const c2 = 200 - 200 * BRANCH_BOW;
    expect(d).toBe(`M 0 0 C 0 ${c1}, 100 ${c2}, 100 200`);
  });

  it('is a cubic with horizontal tangents in the horizontal orientation', () => {
    const d = branchPath(seg([0, 0], [200, 100]), 'horizontal');
    const c1 = 0 + 200 * BRANCH_BOW;
    const c2 = 200 - 200 * BRANCH_BOW;
    expect(d).toBe(`M 0 0 C ${c1} 0, ${c2} 100, 200 100`);
  });
});
