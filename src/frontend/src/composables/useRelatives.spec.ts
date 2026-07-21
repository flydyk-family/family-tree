import { describe, it, expect } from 'vitest';
import { deriveRelatives } from './useRelatives';
import type { PersonSummary, Union } from '../types/family';

function p(id: string, extra: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id, givenName: { ru: id, be: id, en: id }, surname: { ru: '', be: '', en: '' },
    maidenName: null, middleName: null, sex: 'unknown', birthYear: null, deathYear: null, vocation: 'unknown',
    portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false, ...extra
  };
}

describe('deriveRelatives', () => {
  const father = p('p-f', { birthYear: 1900 });
  const mother = p('p-m', { birthYear: 1902 });
  const self = p('p-1', { birthYear: 1925, parents: { fatherId: 'p-f', motherId: 'p-m' } });
  const sibling = p('p-2', { birthYear: 1928, parents: { fatherId: 'p-f', motherId: 'p-m' } });
  const halfSibling = p('p-3', { birthYear: 1930, parents: { fatherId: 'p-f', motherId: null } });
  const spouse = p('p-s', { birthYear: 1924 });
  const child = p('p-c', { birthYear: 1950 });
  const people = [father, mother, self, sibling, halfSibling, spouse, child];
  const unions: Union[] = [{ id: 'u-1', partnerIds: ['p-1', 'p-s'], marriageYear: 1948, childIds: ['p-c'] }];

  it('derives parents', () => {
    expect(deriveRelatives('p-1', people, unions).parents.map(x => x.id)).toEqual(['p-f', 'p-m']);
  });

  it('derives siblings including half-siblings (shares >=1 parent), excluding self', () => {
    expect(deriveRelatives('p-1', people, unions).siblings.map(x => x.id)).toEqual(['p-2', 'p-3']);
  });

  it('derives spouses and children from unions', () => {
    const r = deriveRelatives('p-1', people, unions);
    expect(r.spouses.map(x => x.id)).toEqual(['p-s']);
    expect(r.children.map(x => x.id)).toEqual(['p-c']);
  });

  it('returns empty arrays for an unknown person', () => {
    const r = deriveRelatives('p-x', people, unions);
    expect(r).toEqual({ parents: [], siblings: [], spouses: [], children: [] });
  });

  it('does not list self as its own sibling', () => {
    expect(deriveRelatives('p-1', people, unions).siblings.map(x => x.id)).not.toContain('p-1');
  });
});
