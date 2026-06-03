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
    birthYear, deathYear: null, vocation: 'other', portrait: null,
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
