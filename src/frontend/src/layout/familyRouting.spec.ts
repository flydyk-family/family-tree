import { describe, it, expect } from 'vitest';
import { routeFamily, DEFAULT_ROUTE_OPTS } from './familyRouting';

const O = DEFAULT_ROUTE_OPTS;

describe('routeFamily (vertical axis, time = y)', () => {
  const parents = [{ x: 0, y: 0 }, { x: 100, y: 40 }];
  const children = [{ x: 20, y: 200 }, { x: 80, y: 240 }];
  const r = routeFamily(parents, children, 'y');

  it('places the hub at the couple centre, biased from the latest parent toward the earliest child', () => {
    // hub x = mean parent x = 50; hub y = latestParentY(40) + (earliestChildY(200)-40)*hubBias
    const expectedY = 40 + (200 - 40) * O.hubBias;
    expect(r.hub).toEqual({ x: 50, y: expectedY });
  });

  it('draws one spouse curve from each parent to the hub', () => {
    expect(r.spouseCurves).toHaveLength(2);
    expect(r.spouseCurves[0]).toEqual({ a: { x: 0, y: 0 }, b: r.hub });
    expect(r.spouseCurves[1]).toEqual({ a: { x: 100, y: 40 }, b: r.hub });
  });

  it('draws one child curve from the hub to each child', () => {
    expect(r.childCurves).toHaveLength(2);
    expect(r.childCurves[0]).toEqual({ a: r.hub, b: { x: 20, y: 200 } });
    expect(r.childCurves[1]).toEqual({ a: r.hub, b: { x: 80, y: 240 } });
  });
});

describe('routeFamily edge cases', () => {
  it('handles a single parent: one spouse curve, hub centred on that parent', () => {
    const r = routeFamily([{ x: 10, y: 0 }], [{ x: 10, y: 200 }], 'y');
    expect(r.hub!.x).toBe(10);
    expect(r.spouseCurves).toHaveLength(1);
    expect(r.childCurves).toHaveLength(1);
  });

  it('childless union: hub sits just past the parents, no child curves', () => {
    const r = routeFamily([{ x: 0, y: 0 }, { x: 100, y: 0 }], [], 'y');
    expect(r.hub).toEqual({ x: 50, y: 0 + O.coupleDrop });
    expect(r.spouseCurves).toHaveLength(2);
    expect(r.childCurves).toHaveLength(0);
  });

  it('no present parents: hub sits just before the children', () => {
    const r = routeFamily([], [{ x: 0, y: 200 }, { x: 40, y: 260 }], 'y');
    expect(r.hub).toEqual({ x: 20, y: 200 - O.childRise });
    expect(r.spouseCurves).toHaveLength(0);
    expect(r.childCurves).toHaveLength(2);
  });

  it('clamps the hub to the latest parent when a child predates it (malformed data)', () => {
    const r = routeFamily([{ x: 0, y: 100 }, { x: 100, y: 100 }], [{ x: 50, y: 0 }], 'y');
    expect(r.hub!.y).toBe(100); // never above the latest parent
  });

  it('returns an empty route when nothing is present', () => {
    const r = routeFamily([], [], 'y');
    expect(r.hub).toBeNull();
    expect(r.spouseCurves).toHaveLength(0);
    expect(r.childCurves).toHaveLength(0);
  });

  it('mirrors onto the horizontal axis (time = x)', () => {
    // parents at the same x (=time), spread on y; child later in x
    const r = routeFamily([{ x: 0, y: 0 }, { x: 0, y: 100 }], [{ x: 200, y: 50 }], 'x');
    // hub spread (y) = mean parent y = 50; hub time (x) = 0 + (200-0)*hubBias
    expect(r.hub).toEqual({ x: 200 * O.hubBias, y: 50 });
  });
});
