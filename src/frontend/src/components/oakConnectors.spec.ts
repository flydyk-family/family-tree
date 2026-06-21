import { describe, it, expect } from 'vitest';
import { ropePath, ROPE_SAG } from './oakConnectors';
import type { LayoutLink } from '../layout/treeLayout';

const link = (o: Partial<LayoutLink> = {}): LayoutLink => ({
  id: 'l', kind: 'descent', source: 'p', target: 'c', x1: 0, y1: 0, x2: 100, y2: 200, ...o
});

describe('ropePath', () => {
  it('is a quadratic whose control point sags below both endpoints', () => {
    const d = ropePath(link(), 'vertical');
    expect(d.startsWith('M 0 0 Q ')).toBe(true);
    // control y = max(y1,y2) + sag — below both endpoints (larger y = lower on screen)
    const ctrlY = Number(d.match(/Q\s[\d.-]+\s([\d.-]+)/)![1]);
    expect(ctrlY).toBe(200 + ROPE_SAG);
  });
  it('sags downward even in horizontal orientation', () => {
    const d = ropePath(link({ x1: 0, y1: 50, x2: 200, y2: 50 }), 'horizontal');
    const ctrlY = Number(d.match(/Q\s[\d.-]+\s([\d.-]+)/)![1]);
    expect(ctrlY).toBe(50 + ROPE_SAG);
  });
});