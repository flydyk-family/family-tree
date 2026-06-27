import { describe, it, expect } from 'vitest';
import { buildLayout } from './treeLayout';
import type { FamilyGraph, PersonSummary } from '../types/family';

function p(id: string, birthYear: number, parents: Partial<PersonSummary['parents']> = {}): PersonSummary {
  return {
    id,
    givenName: { ru: id, be: null, en: id },
    surname: { ru: 'X', be: null, en: 'X' },
    maidenName: null,
    sex: 'male',
    birthYear, deathYear: null, vocation: 'other', portrait: null, portraitVideo: null,
    parents: { motherId: parents.motherId ?? null, fatherId: parents.fatherId ?? null },
    marriedIntoFamily: false, isDefaultRoot: false
  };
}

// great-grandfather -> grandfather -> father -> FOCUS -> child ; focus has a spouse
const graph: FamilyGraph = {
  people: [
    p('ggf', 1770),
    p('gf', 1800, { fatherId: 'ggf' }),
    p('father', 1830, { fatherId: 'gf' }),
    p('focus', 1860, { fatherId: 'father' }),
    p('spouse', 1862),
    p('child', 1890, { fatherId: 'focus', motherId: 'spouse' })
  ],
  unions: [
    { id: 'u-f', partnerIds: ['focus', 'spouse'], marriageYear: 1885, childIds: ['child'] }
  ]
};

const layout = buildLayout(graph, { focusId: 'focus', ancestorTrunkDepth: 1, descendantTrunkDepth: 1 });
const node = (id: string) => layout.nodes.find(n => n.id === id)!;

describe('buildLayout', () => {
  it('places the focus at x=0', () => {
    expect(node('focus').x).toBe(0);
    expect(node('focus').generation).toBe(0);
  });

  it('puts ancestors lower (larger y, older) and descendants higher (smaller y)', () => {
    expect(node('father').y).toBeGreaterThan(node('focus').y);
    expect(node('child').y).toBeLessThan(node('focus').y);
    expect(node('father').generation).toBe(-1);
    expect(node('child').generation).toBe(1);
  });

  it('marks a childless terminal node as a leaf', () => {
    expect(node('child').role).toBe('leaf');
  });

  it('marks ancestors beyond the ancestor trunk depth as roots', () => {
    // ancestorTrunkDepth = 1, so gf (gen -2) and ggf (gen -3) are roots
    expect(node('gf').role).toBe('root');
    expect(node('ggf').role).toBe('root');
    expect(node('father').role).toBe('trunk');
  });

  it('attaches a married-in spouse beside the focus', () => {
    expect(node('spouse').x).toBeGreaterThan(node('focus').x);
    expect(node('spouse').generation).toBe(0);
  });

  it('throws when the focus is not in the graph', () => {
    expect(() => buildLayout(graph, { focusId: 'nope' })).toThrow();
  });

  it('emits an ID-only union with present parents, children and the descent generation', () => {
    const u = layout.unions.find(x => x.id === 'u-f')!;
    expect(u.parentIds.sort()).toEqual(['focus', 'spouse']);
    expect(u.childIds).toEqual(['child']);
    // child is one generation below the focus (gen 0) → descent generation 1
    expect(u.generation).toBe(1);
  });

  it('omits unions whose nodes are all absent from the layout', () => {
    expect(layout.unions.every(x => x.parentIds.length > 0 || x.childIds.length > 0)).toBe(true);
  });

  it('skips dangling parent references instead of crashing', () => {
    // focus references a father whose full record is not in the people set
    const partial: FamilyGraph = {
      people: [p('focus', 1860, { fatherId: 'missing-ancestor' })],
      unions: []
    };

    const result = buildLayout(partial, { focusId: 'focus' });

    expect(result.nodes.map(n => n.id)).toEqual(['focus']);
    expect(result.nodes.find(n => n.id === 'missing-ancestor')).toBeUndefined();
  });

  it('includes the focus siblings beside the focus and links them to the parent', () => {
    const sibGraph: FamilyGraph = {
      people: [
        p('father', 1930),
        p('focus', 1960, { fatherId: 'father' }),
        p('brother', 1958, { fatherId: 'father' })
      ],
      unions: [{ id: 'u', partnerIds: ['father'], marriageYear: null, childIds: ['focus', 'brother'] }]
    };

    const sib = buildLayout(sibGraph, { focusId: 'focus' });
    const brother = sib.nodes.find(n => n.id === 'brother');

    expect(brother).toBeDefined();
    expect(brother!.generation).toBe(0);
    expect(brother!.x).not.toBe(sib.nodes.find(n => n.id === 'focus')!.x);
    expect(sib.unions.some(u => u.parentIds.includes('father') && u.childIds.includes('brother'))).toBe(true);
  });

  it('can disable sibling inclusion', () => {
    const sibGraph: FamilyGraph = {
      people: [
        p('father', 1930),
        p('focus', 1960, { fatherId: 'father' }),
        p('brother', 1958, { fatherId: 'father' })
      ],
      unions: [{ id: 'u', partnerIds: ['father'], marriageYear: null, childIds: ['focus', 'brother'] }]
    };

    const sib = buildLayout(sibGraph, { focusId: 'focus', includeSiblings: false });

    expect(sib.nodes.find(n => n.id === 'brother')).toBeUndefined();
  });
});

// gf -> {father, uncle}; father -> focus; uncle -> cousin. The cousin is the
// child of the focus's uncle (a sibling of an *ancestor*), so the focus-scoped
// layout excludes it, while the full-tree layout must include it.
const cousinGraph: FamilyGraph = {
  people: [
    p('gf', 1900),
    p('father', 1930, { fatherId: 'gf' }),
    p('uncle', 1932, { fatherId: 'gf' }),
    p('focus', 1960, { fatherId: 'father' }),
    p('cousin', 1962, { fatherId: 'uncle' })
  ],
  unions: [
    { id: 'u-gf', partnerIds: ['gf'], marriageYear: null, childIds: ['father', 'uncle'] },
    { id: 'u-fa', partnerIds: ['father'], marriageYear: null, childIds: ['focus'] },
    { id: 'u-un', partnerIds: ['uncle'], marriageYear: null, childIds: ['cousin'] }
  ]
};

describe('buildLayout — full-tree mode', () => {
  it('excludes uncle/cousin branches in the default focus-scoped mode', () => {
    const scoped = buildLayout(cousinGraph, { focusId: 'focus' });
    const ids = scoped.nodes.map(n => n.id);
    expect(ids).not.toContain('cousin');
    expect(ids).not.toContain('uncle');
  });

  it('renders the whole connected tree regardless of focus', () => {
    const full = buildLayout(cousinGraph, { focusId: 'focus', fullTree: true });
    const ids = full.nodes.map(n => n.id).sort();
    expect(ids).toEqual(['cousin', 'father', 'focus', 'gf', 'uncle']);
  });

  it('keeps the focus centered at x=0 and at generation 0', () => {
    const full = buildLayout(cousinGraph, { focusId: 'focus', fullTree: true });
    const n = (id: string) => full.nodes.find(x => x.id === id)!;
    expect(n('focus').x).toBe(0);
    expect(n('focus').generation).toBe(0);
    expect(n('uncle').generation).toBe(-1);
    expect(n('cousin').generation).toBe(0);
    expect(n('gf').generation).toBe(-2);
  });

  it('re-centers on a different focus without dropping any nodes', () => {
    const full = buildLayout(cousinGraph, { focusId: 'cousin', fullTree: true });
    expect(full.nodes.map(n => n.id).sort()).toEqual(['cousin', 'father', 'focus', 'gf', 'uncle']);
    expect(full.nodes.find(n => n.id === 'cousin')!.x).toBe(0);
    expect(full.nodes.find(n => n.id === 'focus')!.generation).toBe(0);
  });

  // Two founding lines (ggf, ggf2) merge at `father`; the focus has a married-in
  // spouse, a child, and deep ancestors — exercising the spouse tier walk, the
  // multi-root forest pass, spouse attachment, deep-ancestor roots and links.
  const mergedGraph: FamilyGraph = {
    people: [
      p('ggf', 1900),
      p('ggf2', 1902),
      p('gf', 1925, { fatherId: 'ggf' }),
      p('gm', 1927, { fatherId: 'ggf2' }),
      p('father', 1950, { fatherId: 'gf', motherId: 'gm' }),
      p('focus', 1975, { fatherId: 'father' }),
      { ...p('spouse', 1977), marriedIntoFamily: true },
      p('child', 2000, { fatherId: 'focus', motherId: 'spouse' })
    ],
    unions: [
      { id: 'u-ggf', partnerIds: ['ggf'], marriageYear: null, childIds: ['gf'] },
      { id: 'u-ggf2', partnerIds: ['ggf2'], marriageYear: null, childIds: ['gm'] },
      { id: 'u-gf', partnerIds: ['gf', 'gm'], marriageYear: 1948, childIds: ['father'] },
      { id: 'u-fa', partnerIds: ['father'], marriageYear: null, childIds: ['focus'] },
      { id: 'u-fo', partnerIds: ['focus', 'spouse'], marriageYear: 1998, childIds: ['child'] }
    ]
  };

  it('places a married-in spouse beside the focus at the same generation', () => {
    const full = buildLayout(mergedGraph, { focusId: 'focus', fullTree: true });
    const spouse = full.nodes.find(n => n.id === 'spouse')!;
    expect(spouse).toBeDefined();
    expect(spouse.generation).toBe(0);
    expect(spouse.x).not.toBe(full.nodes.find(n => n.id === 'focus')!.x);
  });

  it('renders both founding lines, with deep ancestors as roots and a leaf child', () => {
    const full = buildLayout(mergedGraph, { focusId: 'focus', fullTree: true });
    const n = (id: string) => full.nodes.find(x => x.id === id)!;
    expect(full.nodes).toHaveLength(8);
    expect(n('ggf').generation).toBe(-3);
    expect(n('ggf').role).toBe('root');
    expect(n('ggf2').role).toBe('root');
    expect(n('child').role).toBe('leaf');
    expect(n('child').generation).toBe(1);
  });

  it('emits a union with the two married partners and descent links', () => {
    const full = buildLayout(mergedGraph, { focusId: 'focus', fullTree: true });
    expect(full.unions.some(u => u.id === 'u-gf' && u.parentIds.length === 2)).toBe(true);
    expect(full.unions.some(u => u.parentIds.includes('focus') && u.childIds.includes('child'))).toBe(true);
  });

  it('classifies a deep non-terminal descendant (beyond the trunk depth) as a branch', () => {
    const deepGraph: FamilyGraph = {
      people: [
        p('focus', 1900),
        p('c1', 1925, { fatherId: 'focus' }),
        p('c2', 1950, { fatherId: 'c1' }),
        p('c3', 1975, { fatherId: 'c2' }),
        p('c4', 2000, { fatherId: 'c3' })
      ],
      unions: [
        { id: 'u1', partnerIds: ['focus'], marriageYear: null, childIds: ['c1'] },
        { id: 'u2', partnerIds: ['c1'], marriageYear: null, childIds: ['c2'] },
        { id: 'u3', partnerIds: ['c2'], marriageYear: null, childIds: ['c3'] },
        { id: 'u4', partnerIds: ['c3'], marriageYear: null, childIds: ['c4'] }
      ]
    };
    const full = buildLayout(deepGraph, { focusId: 'focus', fullTree: true });
    const n = (id: string) => full.nodes.find(x => x.id === id)!;
    expect(n('c2').role).toBe('trunk'); // generation 2 = within trunk depth
    expect(n('c3').role).toBe('branch'); // generation 3, has a child → branch
    expect(n('c4').role).toBe('leaf'); // generation 4, childless → leaf
  });
});

// Raw card half-extents per role (mirrors geometry.ts: w 200/186/158, h ≈ w·1.21) —
// the actual visual box, with NO margin. Two cards overlap when these boxes
// intersect on both axes. The engine's CARD_HALF_WIDTH/HEIGHT are intentionally a
// little larger (margin-inclusive, e.g. trunk 108 vs 100 here), so it enforces a
// slightly wider clearance than this test demands — passing here means truly clear.
const HALF_W: Record<string, number> = { trunk: 100, branch: 93, root: 93, leaf: 79 };
const HALF_H: Record<string, number> = { trunk: 121, branch: 113, root: 113, leaf: 96 };

describe('buildLayout — full-tree spacing & adjacency', () => {
  // Two sibling lines under a founder; each sibling marries a married-in spouse
  // who also belongs to a *different* couple, plus a parent born only a few years
  // before a child to force a cross-generation vertical collision.
  const graph: FamilyGraph = {
    people: [
      p('gp', 1900),
      p('a', 1925, { fatherId: 'gp' }),
      p('b', 1928, { fatherId: 'gp' }),
      { ...p('sa', 1924), marriedIntoFamily: true },
      { ...p('sb', 1927), marriedIntoFamily: true },
      p('ca', 1948, { fatherId: 'a', motherId: 'sa' }),
      p('cb', 1950, { fatherId: 'b', motherId: 'sb' }),
      // child born close to its parent → same-x, near-y collision across generations
      p('gca', 1968, { fatherId: 'ca' })
    ],
    unions: [
      // Single-partner union (gp's spouse is unrecorded) — a supported shape; the
      // engine lays out the lone bloodline partner and hangs the children under them.
      { id: 'u-gp', partnerIds: ['gp'], marriageYear: null, childIds: ['a', 'b'] },
      { id: 'u-a', partnerIds: ['a', 'sa'], marriageYear: 1947, childIds: ['ca'] },
      { id: 'u-b', partnerIds: ['b', 'sb'], marriageYear: 1949, childIds: ['cb'] },
      { id: 'u-ca', partnerIds: ['ca'], marriageYear: null, childIds: ['gca'] }
    ]
  };
  const full = buildLayout(graph, { focusId: 'a', fullTree: true });
  const n = (id: string) => full.nodes.find(x => x.id === id)!;

  it('leaves no two cards overlapping in 2D', () => {
    const ns = full.nodes;
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const dx = Math.abs(ns[i].x - ns[j].x);
        const dy = Math.abs(ns[i].y - ns[j].y);
        const overlap = dx < HALF_W[ns[i].role] + HALF_W[ns[j].role] && dy < HALF_H[ns[i].role] + HALF_H[ns[j].role];
        expect(overlap, `${ns[i].id} overlaps ${ns[j].id} (dx=${dx}, dy=${dy})`).toBe(false);
      }
    }
  });

  it('keeps siblings contiguous — only a sibling spouse may sit between them', () => {
    const a = n('a'), b = n('b');
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    const allowed = new Set(['a', 'b', 'sa', 'sb']); // the siblings and their spouses
    const between = full.nodes.filter(node =>
      node.generation === a.generation && node.x > lo && node.x < hi && !allowed.has(node.id));
    expect(between.map(node => node.id)).toEqual([]);
  });

  it('keeps each couple adjacent — no unrelated card between partners', () => {
    for (const [pa, pb] of [['a', 'sa'], ['b', 'sb']] as const) {
      const na = n(pa), nb = n(pb);
      const lo = Math.min(na.x, nb.x), hi = Math.max(na.x, nb.x);
      const between = full.nodes.filter(node =>
        node.id !== pa && node.id !== pb && node.generation === na.generation && node.x > lo && node.x < hi);
      expect(between.map(node => node.id), `between ${pa} and ${pb}`).toEqual([]);
    }
  });

  it('still places a node the bloodline walk cannot reach (a spouse of a married-in spouse)', () => {
    // focus 'fo' is the only founder; 'sp' is married into the family; 'ex' is
    // 'sp's other married-in partner, connected to the tree *only* through 'sp',
    // so the founder/descendant walk never reaches it — it must still get a slot.
    const g: FamilyGraph = {
      people: [
        p('fo', 1960),
        { ...p('sp', 1962), marriedIntoFamily: true },
        { ...p('ex', 1958), marriedIntoFamily: true }
      ],
      unions: [
        { id: 'u-fo', partnerIds: ['fo', 'sp'], marriageYear: 1985, childIds: [] },
        { id: 'u-ex', partnerIds: ['sp', 'ex'], marriageYear: 1980, childIds: [] }
      ]
    };
    const out = buildLayout(g, { focusId: 'fo', fullTree: true });
    const ex = out.nodes.find(node => node.id === 'ex');
    expect(ex).toBeDefined();
    expect(Number.isFinite(ex!.x)).toBe(true);
  });

  it('tolerates a malformed graph (a child listed under two parents and twice) without crashing or dropping nodes', () => {
    // 'b' is listed as a child of both 'fo' (its grandparent's union) and 'a',
    // and appears twice under 'fo' — exercising the duplicate-child dedup and the
    // already-placed guard. Every node must still get exactly one finite position.
    const g: FamilyGraph = {
      people: [
        p('fo', 1900),
        p('a', 1925, { fatherId: 'fo' }),
        p('b', 1950, { fatherId: 'a' })
      ],
      unions: [
        { id: 'u-fo', partnerIds: ['fo'], marriageYear: null, childIds: ['a', 'b'] },
        { id: 'u-fo2', partnerIds: ['fo'], marriageYear: null, childIds: ['b'] },
        { id: 'u-a', partnerIds: ['a'], marriageYear: null, childIds: ['b'] }
      ]
    };
    const out = buildLayout(g, { focusId: 'fo', fullTree: true });
    expect(out.nodes.map(node => node.id).sort()).toEqual(['a', 'b', 'fo']);
    expect(out.nodes.every(node => Number.isFinite(node.x))).toBe(true);
  });
});
