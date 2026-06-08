import type { TreeLayout, LayoutNode, LayoutLink } from './treeLayout';
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

export function projectLayout(layout: TreeLayout, orientation: Orientation): TreeLayout {
  if (orientation === 'vertical') {
    return layout;
  }
  const nodes = layout.nodes.map(node => projectNode(node, layout.scale));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const links: LayoutLink[] = layout.links.map(link => {
    const s = byId.get(link.source);
    const t = byId.get(link.target);
    return {
      ...link,
      x1: s?.x ?? link.x1, y1: s?.y ?? link.y1,
      x2: t?.x ?? link.x2, y2: t?.y ?? link.y2
    };
  });
  const xs = nodes.map(node => node.x);
  const ys = nodes.map(node => node.y);
  const bounds = {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys)
  };
  return {
    ...layout,
    nodes,
    links,
    bounds,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY
  };
}
