/** Orthogonal family-connector geometry. Works in abstract (time T, spread S)
 *  coordinates so one routine serves both orientations:
 *   - axis 'y' (vertical): T = y (down = later), S = x.
 *   - axis 'x' (horizontal): T = x (right = later), S = y.
 *  Coordinates are read from live node positions, so the result survives
 *  orientation projection and the orientation-morph. */

export interface Pt { x: number; y: number; }
export interface Seg { a: Pt; b: Pt; }
export type Axis = 'y' | 'x';

export interface RouteOpts {
  /** T offset from the latest parent to the couple bar. */
  coupleDrop: number;
  /** T offset before the earliest child to the sibling bus bar. */
  childRise: number;
}

export const DEFAULT_ROUTE_OPTS: RouteOpts = { coupleDrop: 26, childRise: 26 };

export interface FamilyRoute {
  parentStubs: Seg[];
  coupleBar: Seg | null;
  trunk: Seg | null;
  busBar: Seg | null;
  childStubs: Seg[];
  marriageJunction: Pt | null;
  branchJunction: Pt | null;
}

const tOf = (p: Pt, axis: Axis): number => (axis === 'y' ? p.y : p.x);
const sOf = (p: Pt, axis: Axis): number => (axis === 'y' ? p.x : p.y);
const pt = (t: number, s: number, axis: Axis): Pt => (axis === 'y' ? { x: s, y: t } : { x: t, y: s });
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Build the orthogonal route for one union from its present parents and children. */
export function routeFamily(
  parents: Pt[],
  children: Pt[],
  axis: Axis,
  opts: RouteOpts = DEFAULT_ROUTE_OPTS
): FamilyRoute {
  const route: FamilyRoute = {
    parentStubs: [], coupleBar: null, trunk: null, busBar: null,
    childStubs: [], marriageJunction: null, branchJunction: null
  };
  if (parents.length === 0 && children.length === 0) {
    return route;
  }

  // Couple / marriage point. With parents present it sits just past the latest
  // parent along T; with none (both partners absent) it anchors on the children.
  let coupleT: number;
  let midS: number;
  if (parents.length > 0) {
    const parentS = parents.map(p => sOf(p, axis));
    coupleT = Math.max(...parents.map(p => tOf(p, axis))) + opts.coupleDrop;
    midS = mean(parentS);
    for (const p of parents) {
      route.parentStubs.push({ a: p, b: pt(coupleT, sOf(p, axis), axis) });
    }
    if (parents.length >= 2) {
      route.coupleBar = { a: pt(coupleT, Math.min(...parentS), axis), b: pt(coupleT, Math.max(...parentS), axis) };
    }
    route.marriageJunction = pt(coupleT, midS, axis);
  } else {
    coupleT = Math.min(...children.map(c => tOf(c, axis))) - opts.childRise;
    midS = mean(children.map(c => sOf(c, axis)));
  }

  if (children.length === 0) {
    return route;
  }

  const childT = children.map(c => tOf(c, axis));
  const childS = children.map(c => sOf(c, axis));
  // Bus sits just before the earliest child, but never above the couple bar.
  const busT = Math.max(coupleT, Math.min(...childT) - opts.childRise);

  if (parents.length > 0) {
    route.trunk = { a: pt(coupleT, midS, axis), b: pt(busT, midS, axis) };
  }
  route.branchJunction = pt(busT, midS, axis);

  // Bus spans the children and the trunk centre so the trunk always meets it.
  route.busBar = {
    a: pt(busT, Math.min(midS, ...childS), axis),
    b: pt(busT, Math.max(midS, ...childS), axis)
  };
  for (const c of children) {
    route.childStubs.push({ a: pt(busT, sOf(c, axis), axis), b: c });
  }
  return route;
}
