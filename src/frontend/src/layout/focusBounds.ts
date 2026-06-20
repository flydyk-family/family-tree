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

// Bounds for the initial camera: frame the family around the `isDefaultRoot`
// person — that person, their children, and the children's other parent
// (the root's spouse). This lands the first view on a concrete, meaningful
// family unit at a readable zoom rather than a whole wide generation band.
// Falls back to the generation-band framing when there is no default root (or
// the root has no children, so the family is a single point).
export function defaultRootFocusBounds(nodes: LayoutNode[]): FocusBounds {
  if (nodes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  const root = nodes.find(node => node.person.isDefaultRoot);
  if (!root) {
    return initialFocusBounds(nodes);
  }

  const family = new Map<string, LayoutNode>([[root.id, root]]);
  const coParentIds = new Set<string>();
  for (const node of nodes) {
    const parents = node.person.parents;
    if (parents && (parents.motherId === root.id || parents.fatherId === root.id)) {
      family.set(node.id, node);
      for (const parentId of [parents.motherId, parents.fatherId]) {
        if (parentId && parentId !== root.id) {
          coParentIds.add(parentId);
        }
      }
    }
  }
  for (const node of nodes) {
    if (coParentIds.has(node.id)) {
      family.set(node.id, node);
    }
  }

  const members = [...family.values()];
  const bounds = boundsOf(members);
  // A lone root (no children placed) has zero extent — nothing to frame; fall back.
  if (bounds.maxX === bounds.minX && bounds.maxY === bounds.minY) {
    return initialFocusBounds(nodes);
  }
  return bounds;
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
