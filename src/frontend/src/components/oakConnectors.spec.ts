import { describe, it, expect } from 'vitest';
import { ropePath, ROPE_SAG, ROPE_SAG_FACTOR } from './oakConnectors';
import type { Seg } from '../layout/familyRouting';

const seg = (a: [number, number], b: [number, number]): Seg => ({ a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } });

describe('ropePath', () => {
  it('is a quadratic whose control point sags below both endpoints, deepening with length', () => {
    const d = ropePath(seg([0, 0], [100, 200]));
    expect(d.startsWith('M 0 0 Q ')).toBe(true);
    const ctrlY = Number(d.match(/Q\s[\d.-]+\s([\d.-]+)/)![1]);
    const chord = Math.hypot(100, 200);
    expect(ctrlY).toBeCloseTo(200 + ROPE_SAG + chord * ROPE_SAG_FACTOR, 4);
  });

  it('sags more on a longer cord than a shorter one', () => {
    const ctrl = (d: string) => Number(d.match(/Q\s[\d.-]+\s([\d.-]+)/)![1]);
    const shortY = ctrl(ropePath(seg([0, 50], [40, 50])));
    const longY = ctrl(ropePath(seg([0, 50], [400, 50])));
    expect(longY).toBeGreaterThan(shortY); // both at base y=50, longer cord droops further
  });

  it('bows deeper when given a bow factor > 1', () => {
    const ctrl = (d: string) => Number(d.match(/Q\s[\d.-]+\s([\d.-]+)/)![1]);
    const base = ctrl(ropePath(seg([0, 0], [100, 200])));
    const deep = ctrl(ropePath(seg([0, 0], [100, 200]), 1.7));
    expect(deep).toBeGreaterThan(base);
  });
});
