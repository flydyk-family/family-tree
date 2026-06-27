import { describe, it, expect } from 'vitest';
import { routeFamily, DEFAULT_ROUTE_OPTS } from './familyRouting';

const O = DEFAULT_ROUTE_OPTS;

describe('routeFamily (vertical axis, time = y)', () => {
  const parents = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const children = [{ x: 20, y: 200 }, { x: 80, y: 220 }];
  const r = routeFamily(parents, children, 'y');

  it('drops a stub from each parent to the couple bar', () => {
    expect(r.parentStubs).toHaveLength(2);
    // each stub keeps the parent x and ends at coupleT = max(parentY) + coupleDrop
    expect(r.parentStubs[0].a).toEqual({ x: 0, y: 0 });
    expect(r.parentStubs[0].b).toEqual({ x: 0, y: O.coupleDrop });
    expect(r.parentStubs[1].b).toEqual({ x: 100, y: O.coupleDrop });
  });

  it('joins the two parents with a horizontal couple bar at the marriage point', () => {
    expect(r.coupleBar).toEqual({ a: { x: 0, y: O.coupleDrop }, b: { x: 100, y: O.coupleDrop } });
    expect(r.marriageJunction).toEqual({ x: 50, y: O.coupleDrop });
  });

  it('drops a single trunk from the marriage point to the bus bar', () => {
    const busY = Math.min(200, 220) - O.childRise; // 174
    expect(r.trunk).toEqual({ a: { x: 50, y: O.coupleDrop }, b: { x: 50, y: busY } });
    expect(r.branchJunction).toEqual({ x: 50, y: busY });
  });

  it('spreads a bus bar across the children and the trunk centre', () => {
    const busY = 174;
    // spans min(midS=50, childXs=20,80)=20 .. max(...)=80
    expect(r.busBar).toEqual({ a: { x: 20, y: busY }, b: { x: 80, y: busY } });
  });

  it('drops a stub from the bus bar to each child', () => {
    const busY = 174;
    expect(r.childStubs).toHaveLength(2);
    expect(r.childStubs[0]).toEqual({ a: { x: 20, y: busY }, b: { x: 20, y: 200 } });
    expect(r.childStubs[1]).toEqual({ a: { x: 80, y: busY }, b: { x: 80, y: 220 } });
  });
});

describe('routeFamily edge cases', () => {
  it('omits the couple bar for a single parent but still drops a trunk', () => {
    const r = routeFamily([{ x: 0, y: 0 }], [{ x: 0, y: 200 }], 'y');
    expect(r.coupleBar).toBeNull();
    expect(r.parentStubs).toHaveLength(1);
    expect(r.marriageJunction).toEqual({ x: 0, y: O.coupleDrop });
    expect(r.trunk).not.toBeNull();
  });

  it('renders only the couple bar for a childless union', () => {
    const r = routeFamily([{ x: 0, y: 0 }, { x: 100, y: 0 }], [], 'y');
    expect(r.coupleBar).not.toBeNull();
    expect(r.trunk).toBeNull();
    expect(r.busBar).toBeNull();
    expect(r.childStubs).toHaveLength(0);
    expect(r.branchJunction).toBeNull();
  });

  it('clamps the bus bar so the trunk never inverts when a child predates the couple', () => {
    const r = routeFamily([{ x: 0, y: 100 }, { x: 100, y: 100 }], [{ x: 50, y: 0 }], 'y');
    const coupleY = 100 + O.coupleDrop;
    expect(r.branchJunction!.y).toBe(coupleY); // busT clamped up to coupleT
  });

  it('mirrors onto the horizontal axis (time = x)', () => {
    const r = routeFamily([{ x: 0, y: 0 }, { x: 0, y: 100 }], [{ x: 200, y: 50 }], 'x');
    // couple bar runs along Y (spread) at coupleX = max(parentX)+drop
    expect(r.coupleBar).toEqual({ a: { x: O.coupleDrop, y: 0 }, b: { x: O.coupleDrop, y: 100 } });
    expect(r.marriageJunction).toEqual({ x: O.coupleDrop, y: 50 });
    // trunk runs along X to the bus at busX = childX - rise
    expect(r.trunk!.b).toEqual({ x: 200 - O.childRise, y: 50 });
  });
});
