import type { Seg } from '../layout/familyRouting';

export const ROPE_SAG = 22;

/** Cord path: a quadratic whose control point is pushed toward the bottom of the
 *  screen, so the string sags under gravity regardless of layout orientation.
 *  Restored from the pre-rectangular Film connectors — matches the rope look and
 *  pan/zoom performance of the original. */
export function ropePath(seg: Seg, _orientation: 'vertical' | 'horizontal'): string {
  const mx = (seg.a.x + seg.b.x) / 2;
  const my = Math.max(seg.a.y, seg.b.y) + ROPE_SAG;
  return `M ${seg.a.x} ${seg.a.y} Q ${mx} ${my} ${seg.b.x} ${seg.b.y}`;
}

/** Organic cubic branch between two points: tangents leave each endpoint along
 *  the time axis (vertical or horizontal), giving a smooth S-curve. */
export function branchPath(seg: Seg, orientation: 'vertical' | 'horizontal'): string {
  const { a, b } = seg;
  if (orientation === 'horizontal') {
    const midX = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
  }
  const midY = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`;
}
