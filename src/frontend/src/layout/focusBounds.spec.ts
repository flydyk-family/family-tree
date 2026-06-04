import { describe, it, expect } from 'vitest';
import { initialFocusBounds } from './focusBounds';
import type { LayoutNode } from './treeLayout';

function node(generation: number, x: number, y: number): LayoutNode {
  return {
    id: `g${generation}_${x}_${y}`,
    x,
    y,
    year: 1900 + generation * 25,
    role: 'branch',
    generation
  } as LayoutNode;
}

describe('initialFocusBounds', () => {
  it('frames the two most-recent generations below the newest tier', () => {
    const nodes = [
      node(2, 0, -100), // newest tier — excluded
      node(1, -10, -50),
      node(1, 20, -50),
      node(0, -30, 0),
      node(0, 40, 0),
      node(-1, 5, 60) // older — excluded
    ];

    expect(initialFocusBounds(nodes)).toEqual({ minX: -30, maxX: 40, minY: -50, maxY: 0 });
  });

  it('falls back to all nodes when there are fewer than three generations', () => {
    const nodes = [node(1, 0, -50), node(0, 10, 0)];

    expect(initialFocusBounds(nodes)).toEqual({ minX: 0, maxX: 10, minY: -50, maxY: 0 });
  });

  it('returns zero bounds for an empty node list', () => {
    expect(initialFocusBounds([])).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  });
});
