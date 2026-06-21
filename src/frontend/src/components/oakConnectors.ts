import type { LayoutLink } from '../layout/treeLayout';

export const ROPE_SAG = 22;

/** Cord path: a quadratic whose control point is pushed toward the bottom of the
 *  screen, so the string sags under gravity regardless of layout orientation. */
export function ropePath(link: LayoutLink, _orientation: 'vertical' | 'horizontal'): string {
  const mx = (link.x1 + link.x2) / 2;
  const my = Math.max(link.y1, link.y2) + ROPE_SAG;
  return `M ${link.x1} ${link.y1} Q ${mx} ${my} ${link.x2} ${link.y2}`;
}