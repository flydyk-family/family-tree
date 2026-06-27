import type { Seg } from '../layout/familyRouting';

/** Base droop of the rope cord, in px. */
export const ROPE_SAG = 34;
/** Extra droop added per unit of chord length, so long curves bow as much as
 *  short ones (a fixed sag barely bends a long cord). */
export const ROPE_SAG_FACTOR = 0.16;
/** Cubic tangent reach as a fraction of the time span. 0.5 is a gentle S;
 *  higher values hold the tangent longer for a more pronounced swoop. */
export const BRANCH_BOW = 0.62;

/** Cord path: a quadratic whose control point is pushed toward the bottom of the
 *  screen, so the string sags under gravity regardless of layout orientation.
 *  Sag deepens with the cord's length for a consistently curvy droop. */
export function ropePath(seg: Seg, _orientation: 'vertical' | 'horizontal'): string {
  const { a, b } = seg;
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  const mx = (a.x + b.x) / 2;
  const my = Math.max(a.y, b.y) + ROPE_SAG + chord * ROPE_SAG_FACTOR;
  return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
}

/** Organic cubic branch between two points: tangents leave each endpoint along
 *  the time axis (vertical or horizontal) and reach `BRANCH_BOW` of the way
 *  across, giving a pronounced S-curve. */
export function branchPath(seg: Seg, orientation: 'vertical' | 'horizontal'): string {
  const { a, b } = seg;
  if (orientation === 'horizontal') {
    const c1 = a.x + (b.x - a.x) * BRANCH_BOW;
    const c2 = b.x - (b.x - a.x) * BRANCH_BOW;
    return `M ${a.x} ${a.y} C ${c1} ${a.y}, ${c2} ${b.y}, ${b.x} ${b.y}`;
  }
  const c1 = a.y + (b.y - a.y) * BRANCH_BOW;
  const c2 = b.y - (b.y - a.y) * BRANCH_BOW;
  return `M ${a.x} ${a.y} C ${a.x} ${c1}, ${b.x} ${c2}, ${b.x} ${b.y}`;
}
