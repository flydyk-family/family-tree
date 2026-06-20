import type { LayoutLink } from '../layout/treeLayout';

export const ROPE_SAG = 22;

/** Cord path: a quadratic whose control point is pushed toward the bottom of the
 *  screen, so the string sags under gravity regardless of layout orientation. */
export function ropePath(link: LayoutLink, _orientation: 'vertical' | 'horizontal'): string {
  const mx = (link.x1 + link.x2) / 2;
  const my = Math.max(link.y1, link.y2) + ROPE_SAG;
  return `M ${link.x1} ${link.y1} Q ${mx} ${my} ${link.x2} ${link.y2}`;
}

/** One pin per distinct medallion connection point: parent-side deduped by
 *  `source`, child-side by `target` (so a multi-child parent shows one pin).
 *  Each point includes the node id it belongs to (`nodeId`) and `fadeGen` —
 *  the generation of the cord(s) the pin anchors (= target/child generation).
 *  For a parent shared by multiple children, `fadeGen` is the MIN child
 *  generation so the pin appears with the EARLIEST cord, never before any. */
export function pinPoints(
  links: LayoutLink[],
  genOf: (nodeId: string) => number,
): Array<{ x: number; y: number; key: string; nodeId: string; fadeGen: number }> {
  const seen = new Map<string, { x: number; y: number; key: string; nodeId: string; fadeGen: number }>();
  for (const l of links) {
    const childGen = genOf(l.target);
    const parentKey = `s:${l.source}`;
    if (!seen.has(parentKey)) {
      seen.set(parentKey, { x: l.x1, y: l.y1, key: parentKey, nodeId: l.source, fadeGen: childGen });
    } else {
      const existing = seen.get(parentKey)!;
      existing.fadeGen = Math.min(existing.fadeGen, childGen);
    }
    const childKey = `t:${l.target}`;
    if (!seen.has(childKey)) {
      seen.set(childKey, { x: l.x2, y: l.y2, key: childKey, nodeId: l.target, fadeGen: childGen });
    }
  }
  return [...seen.values()];
}