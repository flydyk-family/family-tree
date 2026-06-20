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
  // genOf stub: parent `p` is gen 0, children `c1`/`c2` are gen 1
  const genOf = (id: string) => ({ p: 0, c1: 1, c2: 1 } as Record<string, number>)[id] ?? 0;

  it('yields one pin per parent connection point and one per child', () => {
    const links = [
      link({ id: 'a', source: 'p', target: 'c1', x1: 10, y1: 0, x2: 0, y2: 100 }),
      link({ id: 'b', source: 'p', target: 'c2', x1: 10, y1: 0, x2: 50, y2: 100 }),
    ];
    const pts = pinPoints(links, genOf);
    // one parent pin at (10,0) + two child pins → 3, not 4
    expect(pts).toHaveLength(3);
    expect(pts.filter(p => p.x === 10 && p.y === 0)).toHaveLength(1);
  });

  it('includes nodeId: parent pin gets source id, child pin gets target id', () => {
    const links = [
      link({ id: 'a', source: 'p', target: 'c1', x1: 10, y1: 0, x2: 0, y2: 100 }),
      link({ id: 'b', source: 'p', target: 'c2', x1: 10, y1: 0, x2: 50, y2: 100 }),
    ];
    const pts = pinPoints(links, genOf);
    const parentPin = pts.find(p => p.key === 's:p');
    expect(parentPin).toBeDefined();
    expect(parentPin!.nodeId).toBe('p');
    const childPin = pts.find(p => p.key === 't:c1');
    expect(childPin).toBeDefined();
    expect(childPin!.nodeId).toBe('c1');
  });

  it('fadeGen equals child generation for both parent and child pins', () => {
    const links = [
      link({ id: 'a', source: 'p', target: 'c1', x1: 10, y1: 0, x2: 0, y2: 100 }),
      link({ id: 'b', source: 'p', target: 'c2', x1: 10, y1: 0, x2: 50, y2: 100 }),
    ];
    const pts = pinPoints(links, genOf);
    // parent pin must fade at the child gen (1), not the parent gen (0)
    const parentPin = pts.find(p => p.key === 's:p')!;
    expect(parentPin.fadeGen).toBe(1);
    // child pins fade at their own gen (which equals childGen)
    const c1Pin = pts.find(p => p.key === 't:c1')!;
    expect(c1Pin.fadeGen).toBe(1);
    const c2Pin = pts.find(p => p.key === 't:c2')!;
    expect(c2Pin.fadeGen).toBe(1);
  });

  it('parent fadeGen is MIN child gen when children are at different generations', () => {
    // c1 at gen 1, c2 at gen 2 → parent pin should appear at gen 1 (earliest cord)
    const mixedGenOf = (id: string) => ({ p: 0, c1: 1, c2: 2 } as Record<string, number>)[id] ?? 0;
    const links = [
      link({ id: 'a', source: 'p', target: 'c1', x1: 10, y1: 0, x2: 0, y2: 100 }),
      link({ id: 'b', source: 'p', target: 'c2', x1: 10, y1: 0, x2: 50, y2: 200 }),
    ];
    const pts = pinPoints(links, mixedGenOf);
    const parentPin = pts.find(p => p.key === 's:p')!;
    expect(parentPin.fadeGen).toBe(1);
  });
});