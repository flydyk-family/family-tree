import type { TreeLayout, LayoutNode } from '../layout/treeLayout';

// Fraction of the timeline spent staggering generation starts; the remainder
// (TRAVEL) is each node's own glide. Tunable on the owner's live review, like
// the ceremony's CEREMONY_TIME_SCALE.
export const STAGGER_SPAN = 0.15;
export const TRAVEL = 1 - STAGGER_SPAN; // 0.85
const FADE = 0.18; // cross-fade-out (start) / -in (end) fraction for branches + axis

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// power2.inOut — matches the layoutSwitch token's ease, applied per node so the
// global driver can stay linear (no double-easing).
function easeInOut2(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Distinct generations, oldest (most negative) -> newest. (focus = 0, ancestors
// negative, descendants positive.)
export function generationOrder(nodes: LayoutNode[]): number[] {
  return [...new Set(nodes.map(n => n.generation))].sort((a, b) => a - b);
}

// Eased progress for a node at global linear time t. Each generation begins a
// little after the previous (the ripple); each node then eases over its
// TRAVEL-long window. 0 at t=0, 1 at t=1 for every generation.
export function nodeProgress(generation: number, order: number[], t: number): number {
  const g = order.length;
  const index = order.indexOf(generation);
  const start = g <= 1 ? 0 : STAGGER_SPAN * (index / (g - 1));
  const local = Math.min(1, Math.max(0, (t - start) / TRAVEL));
  return easeInOut2(local);
}

// Cross-fade envelope for branches/unions and the year axis: visible (1) at both
// ends, ~0 across the middle so the geometry can swap under cover.
export function branchFade(t: number): number {
  if (t <= 0 || t >= 1) return 1;
  if (t < FADE) return 1 - t / FADE;
  if (t > 1 - FADE) return (t - (1 - FADE)) / FADE;
  return 0;
}

// Blend two same-topology projections (vertical/horizontal of the same base) at
// global time t. Node positions lerp by their per-generation-staggered progress;
// link endpoints follow their blended nodes; bounds recomputed from them.
export function blendLayout(from: TreeLayout, to: TreeLayout, t: number): TreeLayout {
  const order = generationOrder(to.nodes);
  const fromById = new Map(from.nodes.map(n => [n.id, n]));
  const nodes: LayoutNode[] = to.nodes.map(toNode => {
    const fromNode = fromById.get(toNode.id) ?? toNode;
    const p = nodeProgress(toNode.generation, order, t);
    return { ...toNode, x: lerp(fromNode.x, toNode.x, p), y: lerp(fromNode.y, toNode.y, p) };
  });
  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  return { ...to, nodes, bounds, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}
