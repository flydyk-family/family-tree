import { describe, it, expect } from 'vitest';
import { initialFocusBounds, defaultRootFocusBounds, defaultRootFocal } from './focusBounds';
import type { LayoutNode } from './treeLayout';

function node(generation: number, x: number, y: number): LayoutNode {
  const id = `g${generation}_${x}_${y}`;
  return {
    id,
    x,
    y,
    year: 1900 + generation * 25,
    role: 'branch',
    generation,
    person: { id, isDefaultRoot: false, parents: { motherId: null, fatherId: null } }
  } as unknown as LayoutNode;
}

// Node with explicit id + person fields used by the default-root framing.
function person(
  id: string,
  x: number,
  y: number,
  opts: { isDefaultRoot?: boolean; motherId?: string | null; fatherId?: string | null } = {}
): LayoutNode {
  return {
    id,
    x,
    y,
    year: 1900,
    role: 'branch',
    generation: 0,
    person: {
      id,
      isDefaultRoot: opts.isDefaultRoot ?? false,
      parents: { motherId: opts.motherId ?? null, fatherId: opts.fatherId ?? null }
    }
  } as unknown as LayoutNode;
}

describe('initialFocusBounds', () => {
  it('frames the two most-recent generations below the newest tier', () => {
    const nodes = [
      node(2, 0, -100), // newest tier — excluded
      node(1, -10, -50),
      node(1, 20, -50),
      node(0, -30, 0),
      node(0, 40, 0),
      node(-1, 5, 60) // older — excluded
    ];

    expect(initialFocusBounds(nodes)).toEqual({ minX: -30, maxX: 40, minY: -50, maxY: 0 });
  });

  it('falls back to all nodes when there are fewer than three generations', () => {
    const nodes = [node(1, 0, -50), node(0, 10, 0)];

    expect(initialFocusBounds(nodes)).toEqual({ minX: 0, maxX: 10, minY: -50, maxY: 0 });
  });

  it('returns zero bounds for an empty node list', () => {
    expect(initialFocusBounds([])).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  });
});

describe('defaultRootFocusBounds', () => {
  it('frames the default-root person, their children, and the co-parent', () => {
    const nodes = [
      person('root', 0, 0, { isDefaultRoot: true }),
      person('spouse', 40, 0),
      person('kid1', -10, 80, { fatherId: 'root', motherId: 'spouse' }),
      person('kid2', 30, 80, { fatherId: 'root', motherId: 'spouse' }),
      person('stranger', 500, 500) // unrelated — must NOT widen the frame
    ];
    // root(0,0) + spouse(40,0) + kids(-10..30, 80) → x[-10..40], y[0..80]
    expect(defaultRootFocusBounds(nodes)).toEqual({ minX: -10, maxX: 40, minY: 0, maxY: 80 });
  });

  it('extends the frame to grandchildren (gen0+gen1+gen2)', () => {
    const nodes = [
      person('root', 0, 0, { isDefaultRoot: true }),
      person('spouse', 40, 0),
      person('kid', 10, 80, { fatherId: 'root', motherId: 'spouse' }),
      person('kid-spouse', 60, 80),
      person('grandkid1', -20, 160, { fatherId: 'kid', motherId: 'kid-spouse' }),
      person('grandkid2', 90, 160, { fatherId: 'kid', motherId: 'kid-spouse' }),
      person('stranger', 500, 500) // unrelated — must NOT widen the frame
    ];
    // root/spouse(y0) + kid/kid-spouse(y80) + grandkids(-20..90, y160)
    expect(defaultRootFocusBounds(nodes)).toEqual({ minX: -20, maxX: 90, minY: 0, maxY: 160 });
  });

  it('honours an explicit depth of 1 (children only, no grandchildren)', () => {
    const nodes = [
      person('root', 0, 0, { isDefaultRoot: true }),
      person('spouse', 40, 0),
      person('kid', 10, 80, { fatherId: 'root', motherId: 'spouse' }),
      person('grandkid', 200, 160, { fatherId: 'kid' })
    ];
    expect(defaultRootFocusBounds(nodes, 1)).toEqual({ minX: 0, maxX: 40, minY: 0, maxY: 80 });
  });

  it('falls back to the generation-band framing when there is no default root', () => {
    const nodes = [node(1, 0, -50), node(0, 10, 0)];
    expect(defaultRootFocusBounds(nodes)).toEqual(initialFocusBounds(nodes));
  });

  it('falls back when the default root has no placed children (zero-extent family)', () => {
    const nodes = [person('root', 5, 5, { isDefaultRoot: true }), node(0, 10, 0), node(1, 0, -50)];
    expect(defaultRootFocusBounds(nodes)).toEqual(initialFocusBounds(nodes));
  });

  it('returns zero bounds for an empty node list', () => {
    expect(defaultRootFocusBounds([])).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  });

  it('skips nodes that have no parents record without including them in the frame', () => {
    const orphan = {
      id: 'orphan', x: 999, y: 999, year: 1900, role: 'branch', generation: 0,
      person: { id: 'orphan', isDefaultRoot: false, parents: undefined }
    } as unknown as LayoutNode;
    const nodes = [
      person('root', 0, 0, { isDefaultRoot: true }),
      person('kid', 10, 80, { fatherId: 'root' }),
      orphan // parents === undefined → must be skipped, never widening the frame
    ];
    expect(defaultRootFocusBounds(nodes)).toEqual({ minX: 0, maxX: 10, minY: 0, maxY: 80 });
  });
});

describe('defaultRootFocal', () => {
  it('returns the position of the default-root person', () => {
    expect(defaultRootFocal([person('a', 5, 7, { isDefaultRoot: true }), person('b', 1, 2)]))
      .toEqual({ x: 5, y: 7 });
  });

  it('returns null when there is no default root', () => {
    expect(defaultRootFocal([person('a', 5, 7), person('b', 1, 2)])).toBeNull();
  });
});
