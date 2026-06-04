import type { LayoutNode } from './treeLayout';

export interface FocusBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface FocusBoundsOptions {
  generations?: number;
  excludeNewest?: number;
}

function boundsOf(nodes: LayoutNode[]): FocusBounds {
  if (nodes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  const xs = nodes.map(node => node.x);
  const ys = nodes.map(node => node.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

// Bounds for the initial camera: frame the `generations` most-recent generations
// after dropping the `excludeNewest` newest tier(s). If the tree has fewer than
// `excludeNewest + generations` distinct generations it is too shallow to drop a
// tier, so frame everything instead.
export function initialFocusBounds(nodes: LayoutNode[], options: FocusBoundsOptions = {}): FocusBounds {
  if (nodes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  const generations = options.generations ?? 2;
  const excludeNewest = options.excludeNewest ?? 1;

  const distinct = [...new Set(nodes.map(node => node.generation))].sort((a, b) => b - a);
  if (distinct.length < excludeNewest + generations) {
    return boundsOf(nodes);
  }

  const window = new Set(distinct.slice(excludeNewest, excludeNewest + generations));
  return boundsOf(nodes.filter(node => window.has(node.generation)));
}
