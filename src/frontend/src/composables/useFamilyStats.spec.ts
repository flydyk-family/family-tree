import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useFamilyStats } from './useFamilyStats';
import type { PersonSummary } from '../types/family';

function person(overrides: Partial<PersonSummary>): PersonSummary {
  return {
    id: 'p1',
    givenName: { ru: 'Имя', be: null, en: null },
    surname: { ru: 'Фамилия', be: null, en: null },
    maidenName: null,
    sex: 'male',
    birthYear: null,
    deathYear: null,
    vocation: 'other',
    portrait: null,
    portraitVideo: null,
    parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false,
    isDefaultRoot: false,
    ...overrides
  };
}

describe('useFamilyStats', () => {
  it('computes all stats over the roster', () => {
    const people = [
      person({ id: 'a', birthYear: 1762, deathYear: 1820, portrait: 'a.jpg' }),
      person({ id: 'b', birthYear: 1965 }),
      person({ id: 'c', birthYear: null, deathYear: 2001 }),
      person({ id: 'd', birthYear: 1991, portrait: 'd.jpg' })
    ];

    const stats = useFamilyStats(() => people);

    expect(stats.members.value).toBe(4);
    expect(stats.earliestBirthYear.value).toBe(1762);
    expect(stats.withPortraits.value).toBe(2);
    // "living" = no recorded death year
    expect(stats.living.value).toBe(2);
  });

  it('returns null earliest year when no one has a birth year', () => {
    const stats = useFamilyStats(() => [person({ birthYear: null })]);
    expect(stats.earliestBirthYear.value).toBeNull();
  });

  it('handles an empty roster', () => {
    const stats = useFamilyStats(() => []);
    expect(stats.members.value).toBe(0);
    expect(stats.earliestBirthYear.value).toBeNull();
    expect(stats.withPortraits.value).toBe(0);
    expect(stats.living.value).toBe(0);
  });

  it('is reactive to roster changes via a ref source', () => {
    const people = ref<PersonSummary[]>([]);
    const stats = useFamilyStats(people);

    expect(stats.members.value).toBe(0);

    people.value = [person({ id: 'a', birthYear: 1900 }), person({ id: 'b' })];

    expect(stats.members.value).toBe(2);
    expect(stats.earliestBirthYear.value).toBe(1900);
  });
});
