import { describe, expect, it } from 'vitest';
import { blendLayout, branchFade, generationOrder, nodeProgress, STAGGER_SPAN } from './layoutFlip';
import type { TreeLayout, LayoutNode } from '../layout/treeLayout';
import type { TimeScale } from '../layout/timeScale';
import type { PersonSummary } from '../types/family';

function node(id: string, generation: number, x: number, y: number): LayoutNode {
  return { id, generation, x, y, year: 1900 + generation * 28, role: 'branch', person: { id } as unknown as PersonSummary };
}

function layout(nodes: LayoutNode[], links: TreeLayout['links'] = []): TreeLayout {
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  return { nodes, links, unions: [], scale: { minYear: 1900, maxYear: 2000, pxPerYear: 14 } as unknown as TimeScale, bounds, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}

describe('generationOrder', () => {
  it('lists distinct generations oldest (most negative) first', () => {
    const nodes = [node('a', 1, 0, 0), node('b', -2, 0, 0), node('c', 0, 0, 0), node('d', -2, 0, 0)];
    expect(generationOrder(nodes)).toEqual([-2, 0, 1]);
  });
});

describe('nodeProgress', () => {
  const order = [-2, 0, 2];
  it('is 0 at t=0 and 1 at t=1 for every generation', () => {
    for (const g of order) {
      expect(nodeProgress(g, order, 0)).toBe(0);
      expect(nodeProgress(g, order, 1)).toBeCloseTo(1, 5);
    }
  });
  it('starts the oldest generation before the newest (stagger)', () => {
    const t = STAGGER_SPAN / 2;
    expect(nodeProgress(order[0], order, t)).toBeGreaterThan(0);
    expect(nodeProgress(order[order.length - 1], order, t)).toBe(0);
  });
  it('reaches eased mid-travel for the middle generation at t=0.5', () => {
    // middle gen start = STAGGER_SPAN * 0.5 = 0.075; local = (0.5 - 0.075)/0.85 = 0.5;
    // power2.inOut(0.5) = 0.5 — guards against a regressed start offset or ease.
    expect(nodeProgress(order[1], order, 0.5)).toBeCloseTo(0.5, 5);
  });
  it('handles a single generation without dividing by zero (start offset 0)', () => {
    expect(nodeProgress(0, [0], 0)).toBe(0);
    expect(nodeProgress(0, [0], 1)).toBeCloseTo(1, 5);
    expect(nodeProgress(0, [0], 0.4)).toBeGreaterThan(0); // no stagger delay → already travelling
  });
});

describe('branchFade', () => {
  it('is fully visible at the ends and hidden across the middle', () => {
    expect(branchFade(0)).toBe(1);
    expect(branchFade(1)).toBe(1);
    expect(branchFade(0.5)).toBe(0);
  });
  it('ramps out at the start and back in at the end (FADE = 0.18)', () => {
    expect(branchFade(0.09)).toBeCloseTo(0.5, 5);  // half-way through the fade-out: 1 - 0.09/0.18
    expect(branchFade(0.955)).toBeCloseTo(0.75, 5); // into the fade-in: (0.955 - 0.82)/0.18
  });
});

describe('blendLayout', () => {
  const from = layout([node('a', 0, 0, 0), node('b', 1, 100, 0)], [{ id: 'l', kind: 'descent', source: 'a', target: 'b', x1: 0, y1: 0, x2: 100, y2: 0 }]);
  const to = layout([node('a', 0, 0, 0), node('b', 1, 0, 100)], [{ id: 'l', kind: 'descent', source: 'a', target: 'b', x1: 0, y1: 0, x2: 0, y2: 100 }]);

  it('equals `from` positions at t=0', () => {
    const out = blendLayout(from, to, 0);
    expect(out.nodes.find(n => n.id === 'b')).toMatchObject({ x: 100, y: 0 });
  });
  it('equals `to` positions at t=1', () => {
    const out = blendLayout(from, to, 1);
    expect(out.nodes.find(n => n.id === 'b')).toMatchObject({ x: 0, y: 100 });
  });
  it('moves link endpoints with their blended nodes', () => {
    const out = blendLayout(from, to, 1);
    expect(out.links[0]).toMatchObject({ x2: 0, y2: 100 });
  });
  it('recomputes bounds from the blended nodes', () => {
    const out = blendLayout(from, to, 1);
    expect(out.bounds).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 100 });
  });
  it('leaves a node absent from `from` at its destination (nothing to glide from)', () => {
    const partial = layout([node('a', 0, 0, 0)]);
    const full = layout([node('a', 0, 0, 0), node('b', 1, 50, 70)]);
    const out = blendLayout(partial, full, 0);
    expect(out.nodes.find(n => n.id === 'b')).toMatchObject({ x: 50, y: 70 });
  });
});
