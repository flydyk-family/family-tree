import { describe, it, expect } from 'vitest';
import { buildLayout } from './treeLayout';
import { projectLayout } from './projection';
import type { FamilyGraph, PersonSummary } from '../types/family';

function p(id: string, birthYear: number, parents: Partial<PersonSummary['parents']> = {}): PersonSummary {
  return {
    id, givenName: { ru: id, be: null, en: id }, surname: { ru: 'X', be: null, en: 'X' },
    maidenName: null, middleName: null, sex: 'male', birthYear, deathYear: null, vocation: 'other', portrait: null, portraitVideo: null,
    parents: { motherId: parents.motherId ?? null, fatherId: parents.fatherId ?? null },
    marriedIntoFamily: false, isDefaultRoot: false
  };
}

const graph: FamilyGraph = {
  people: [
    p('father', 1830),
    p('focus', 1860, { fatherId: 'father' }),
    p('child', 1890, { fatherId: 'focus' })
  ],
  unions: [{ id: 'u', partnerIds: ['focus'], marriageYear: null, childIds: ['child'] }]
};
const vertical = buildLayout(graph, { focusId: 'focus' });
const n = (l: typeof vertical, id: string) => l.nodes.find(x => x.id === id)!;

describe('projectLayout', () => {
  it('returns the layout unchanged for vertical', () => {
    const out = projectLayout(vertical, 'vertical');
    expect(out).toBe(vertical);
  });

  it('horizontal: time runs along X (older left, newer right)', () => {
    const h = projectLayout(vertical, 'horizontal');
    expect(n(h, 'father').x).toBeLessThan(n(h, 'focus').x);
    expect(n(h, 'child').x).toBeGreaterThan(n(h, 'focus').x);
  });

  it('horizontal: spread (old x) becomes Y', () => {
    const h = projectLayout(vertical, 'horizontal');
    expect(n(h, 'focus').y).toBe(n(vertical, 'focus').x);
  });

  it('recomputes bounds for the projected nodes', () => {
    const h = projectLayout(vertical, 'horizontal');
    const xs = h.nodes.map(nn => nn.x);
    expect(h.bounds.minX).toBe(Math.min(...xs));
    expect(h.bounds.maxX).toBe(Math.max(...xs));
    const ys = h.nodes.map(nn => nn.y);
    expect(h.bounds.minY).toBe(Math.min(...ys));
    expect(h.bounds.maxY).toBe(Math.max(...ys));
  });
});
