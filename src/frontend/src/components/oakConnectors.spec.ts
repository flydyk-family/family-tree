import { describe, it, expect } from 'vitest';
import { ropePath, pinPoints, ROPE_SAG } from './oakConnectors';
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
  it('sags downward even in horizontal orientation (rope between two pins)', () => {
    const d = ropePath(link({ x1: 0, y1: 50, x2: 200, y2: 50 }), 'horizontal');
    const ctrlY = Number(d.match(/Q\s[\d.-]+\s([\d.-]+)/)![1]);
    expect(ctrlY).toBe(50 + ROPE_SAG);
  });
});

describe('pinPoints', () => {
  it('yields one pin per parent connection point and one per child', () => {
    const links = [
      link({ id: 'a', source: 'p', target: 'c1', x1: 10, y1: 0, x2: 0, y2: 100 }),
      link({ id: 'b', source: 'p', target: 'c2', x1: 10, y1: 0, x2: 50, y2: 100 }),
    ];
    const pts = pinPoints(links);
    // one parent pin at (10,0) + two child pins → 3, not 4
    expect(pts).toHaveLength(3);
    expect(pts.filter(p => p.x === 10 && p.y === 0)).toHaveLength(1);
  });

  it('includes nodeId: parent pin gets source id, child pin gets target id', () => {
    const links = [
      link({ id: 'a', source: 'p', target: 'c1', x1: 10, y1: 0, x2: 0, y2: 100 }),
      link({ id: 'b', source: 'p', target: 'c2', x1: 10, y1: 0, x2: 50, y2: 100 }),
    ];
    const pts = pinPoints(links);
    const parentPin = pts.find(p => p.key === 's:p');
    expect(parentPin).toBeDefined();
    expect(parentPin!.nodeId).toBe('p');
    const childPin = pts.find(p => p.key === 't:c1');
    expect(childPin).toBeDefined();
    expect(childPin!.nodeId).toBe('c1');
  });
});