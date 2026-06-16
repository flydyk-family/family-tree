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

  it('emits descent links from parents to children and a union link between partners', () => {
    expect(layout.links.some(l => l.kind === 'descent' && l.source === 'focus' && l.target === 'child')).toBe(true);
    expect(layout.links.some(l => l.kind === 'union' && l.source === 'focus' && l.target === 'spouse')).toBe(true);
  });

  it('throws when the focus is not in the graph', () => {
    expect(() => buildLayout(graph, { focusId: 'nope' })).toThrow();
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
    expect(sib.links.some(l => l.kind === 'descent' && l.source === 'father' && l.target === 'brother')).toBe(true);
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
});
