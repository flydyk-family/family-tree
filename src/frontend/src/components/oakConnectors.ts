import type { Seg } from '../layout/familyRouting';

/** Base droop of the cord, in px. */
export const ROPE_SAG = 34;
/** Extra droop added per unit of chord length, so long curves bow as much as
 *  short ones (a fixed sag barely bends a long cord). */
export const ROPE_SAG_FACTOR = 0.16;

/** Cord path: a quadratic whose control point is pushed toward the bottom of the
 *  screen, so the line sags under gravity regardless of layout orientation. Both
 *  themes use this curve (Film strokes it as a rope, Classic as a bark line) so
 *  the connectors read visibly curvy in either. Sag deepens with the chord's
 *  length; `bow` multiplies it (spouse curves pass > 1 to bow deeper than child
 *  curves). */
export function ropePath(seg: Seg, bow = 1): string {
  const { a, b } = seg;
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  const mx = (a.x + b.x) / 2;
  const my = Math.max(a.y, b.y) + (ROPE_SAG + chord * ROPE_SAG_FACTOR) * bow;
  return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
}
