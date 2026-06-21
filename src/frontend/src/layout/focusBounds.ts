import type { LayoutNode } from './treeLayout';

export interface FocusBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface FocusPoint {
  x: number;
  y: number;
}

// Position of the `isDefaultRoot` person in the given (projected) layout, or null
// when there is no default root. Used to keep the root in view as the anchor of a
// single-axis compact fit (the family can spread far to one side of the root).
export function defaultRootFocal(nodes: LayoutNode[]): FocusPoint | null {
  const root = nodes.find(node => node.person.isDefaultRoot);
  return root ? { x: root.x, y: root.y } : null;
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
// person — that person plus `depth` generations of descendants (children,
// grandchildren, …) and each tier's co-parents (spouses who married in). This
// lands the first view on a concrete family unit showing the gen0→gen2 branch
// lines at a readable zoom rather than a whole wide generation band — and is
// tall enough that all three tiers stay visible on a 1080p viewport, not just
// the root couple and their children. Falls back to the generation-band framing
// when there is no default root (or the root has no children, so the family is
// a single point).
export function defaultRootFocusBounds(nodes: LayoutNode[], depth = 2): FocusBounds {
  if (nodes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  const root = nodes.find(node => node.person.isDefaultRoot);
  if (!root) {
    return initialFocusBounds(nodes);
  }

  const byId = new Map(nodes.map(node => [node.id, node]));
  const family = new Map<string, LayoutNode>([[root.id, root]]);
  // `frontier` holds the current generation whose children we expand next; it
  // never includes co-parents, so spouses widen the frame without spawning
  // unrelated descendants.
  let frontier = new Set<string>([root.id]);

  for (let level = 0; level < depth; level++) {
    const children = new Set<string>();
    const coParentIds = new Set<string>();
    for (const node of nodes) {
      const parents = node.person.parents;
      if (!parents) {
        continue;
      }
      const { motherId, fatherId } = parents;
      if ((motherId && frontier.has(motherId)) || (fatherId && frontier.has(fatherId))) {
        family.set(node.id, node);
        children.add(node.id);
        for (const parentId of [motherId, fatherId]) {
          if (parentId && !frontier.has(parentId)) {
            coParentIds.add(parentId);
          }
        }
      }
    }
    for (const parentId of coParentIds) {
      const coParent = byId.get(parentId);
      if (coParent) {
        family.set(coParent.id, coParent);
      }
    }
    if (children.size === 0) {
      break;
    }
    frontier = children;
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
