import { describe, it, expect } from 'vitest';
import { computeGenerations, generationOptions } from './familyGenerations';
import type { PersonSummary } from '../types/family';

// minimal factory
const p = (id: string, motherId: string | null, fatherId: string | null): PersonSummary => ({
  id, givenName: { ru: null, be: null, en: id }, surname: { ru: null, be: null, en: 'X' },
  maidenName: null, sex: 'male', birthYear: null, deathYear: null, birthPlace: null,
  vocation: 'other', portrait: null, portraitThumb: null, portraitVideo: null,
  parents: { motherId, fatherId }, marriedIntoFamily: false, isDefaultRoot: false,
});

describe('computeGenerations', () => {
  it('assigns founders generation 1', () => {
    const gens = computeGenerations([p('a', null, null)]);
    expect(gens.get('a')).toBe(1);
  });
  it('assigns a child one below its parent', () => {
    const gens = computeGenerations([p('a', null, null), p('b', 'a', null)]);
    expect(gens.get('b')).toBe(2);
  });
  it('uses the deeper parent when parents differ', () => {
    // a(1) -> b(2); c is founder(1); d has parents b and c -> 1 + max(2,1) = 3
    const gens = computeGenerations([
      p('a', null, null), p('b', 'a', null), p('c', null, null), p('d', 'b', 'c'),
    ]);
    expect(gens.get('d')).toBe(3);
  });
  it('is cycle-safe', () => {
    const gens = computeGenerations([p('a', 'b', null), p('b', 'a', null)]);
    expect(gens.get('a')).toBeGreaterThanOrEqual(1);
    expect(gens.get('b')).toBeGreaterThanOrEqual(1);
  });
});

describe('generationOptions', () => {
  it('returns sorted distinct generations', () => {
    const gens = new Map([['a', 1], ['b', 2], ['c', 2], ['d', 3]]);
    expect(generationOptions(gens)).toEqual([1, 2, 3]);
  });
});
