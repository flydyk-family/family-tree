/** Curved-hub family-connector geometry. Each union converges its present
 *  spouses' curves at a single joint (the "hub"), from which one curve fans out
 *  to each present child. Works in abstract (time T, spread S) coordinates so one
 *  routine serves both orientations:
 *   - axis 'y' (vertical): T = y (down = later), S = x.
 *   - axis 'x' (horizontal): T = x (right = later), S = y.
 *  Coordinates are read from live node positions, so the result survives
 *  orientation projection and the orientation-morph. */

export interface Pt { x: number; y: number; }
export interface Seg { a: Pt; b: Pt; }
export type Axis = 'y' | 'x';

export interface RouteOpts {
  /** Fraction from the parents toward the children where the joint sits (0..1). */
  hubBias: number;
  /** T offset past the parents when the union has children but the joint would
   *  otherwise collapse onto a parent (childless unions also use this). */
  coupleDrop: number;
  /** T offset before the children when the union has no present parents. */
  childRise: number;
}

export const DEFAULT_ROUTE_OPTS: RouteOpts = { hubBias: 0.4, coupleDrop: 30, childRise: 30 };

export interface FamilyRoute {
  /** The single joint where spouse curves meet and child curves depart. */
  hub: Pt | null;
  /** One curve per present spouse, from the spouse to the hub. */
  spouseCurves: Seg[];
  /** One curve per present child, from the hub to the child. */
  childCurves: Seg[];
}

const tOf = (p: Pt, axis: Axis): number => (axis === 'y' ? p.y : p.x);
const sOf = (p: Pt, axis: Axis): number => (axis === 'y' ? p.x : p.y);
const pt = (t: number, s: number, axis: Axis): Pt => (axis === 'y' ? { x: s, y: t } : { x: t, y: s });
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Build the curved-hub route for one union from its present parents and children. */
export function routeFamily(
  parents: Pt[],
  children: Pt[],
  axis: Axis,
  opts: RouteOpts = DEFAULT_ROUTE_OPTS
): FamilyRoute {
  const route: FamilyRoute = { hub: null, spouseCurves: [], childCurves: [] };
  if (parents.length === 0 && children.length === 0) {
    return route;
  }

  // Spread centre of the joint: the couple's midpoint (or the children's, if no
  // parents are present).
  const hubS = parents.length
    ? mean(parents.map(p => sOf(p, axis)))
    : mean(children.map(c => sOf(c, axis)));

  // Time position of the joint: between the parents and the children.
  let hubT: number;
  if (parents.length > 0 && children.length > 0) {
    const latestParentT = Math.max(...parents.map(p => tOf(p, axis)));
    const earliestChildT = Math.min(...children.map(c => tOf(c, axis)));
    const span = earliestChildT - latestParentT;
    // Bias toward the parents; never place the joint above the latest parent
    // (guards against a child born before a parent in malformed data).
    hubT = latestParentT + (span > 0 ? span * opts.hubBias : 0);
  } else if (parents.length > 0) {
    hubT = Math.max(...parents.map(p => tOf(p, axis))) + opts.coupleDrop;
  } else {
    hubT = Math.min(...children.map(c => tOf(c, axis))) - opts.childRise;
  }

  const hub = pt(hubT, hubS, axis);
  route.hub = hub;
  for (const p of parents) {
    route.spouseCurves.push({ a: p, b: hub });
  }
  for (const c of children) {
    route.childCurves.push({ a: hub, b: c });
  }
  return route;
}
