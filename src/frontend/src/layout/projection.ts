import type { TreeLayout, LayoutNode } from './treeLayout';
import type { Orientation } from '../stores/uiStore';

// The canonical layout from buildLayout is vertical: x = spread, y = time (yForYear).
// For horizontal we transpose: x = time along the axis (older→left), y = spread.
function projectNode(node: LayoutNode, scale: TreeLayout['scale']): LayoutNode {
  return {
    ...node,
    x: (node.year - scale.minYear) * scale.pxPerYear,
    y: node.x
  };
}

// Projects the canonical (vertical) layout to the requested orientation.
// Precondition: layout.nodes is non-empty (bounds use Math.min/max).
// Horizontal X uses (year - scale.minYear), so the origin matches horizontalTicks
// in timeScale.ts — nodes and axis ticks stay aligned (scale.minYear includes padYears).
export function projectLayout(layout: TreeLayout, orientation: Orientation): TreeLayout {
  if (orientation === 'vertical') {
    return layout;
  }
  const nodes = layout.nodes.map(node => projectNode(node, layout.scale));
  const xs = nodes.map(node => node.x);
  const ys = nodes.map(node => node.y);
  const bounds = {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys)
  };
  return {
    ...layout,
    nodes,
    bounds,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY
  };
}
