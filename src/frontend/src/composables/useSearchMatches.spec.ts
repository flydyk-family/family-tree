import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSearchMatches, personMatchesQuery } from './useSearchMatches';
import { useFamilyStore } from '../stores/familyStore';
import { useUiStore } from '../stores/uiStore';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonSummary } from '../types/family';

function person(id: string, given: string, surname: string, birthYear: number | null): PersonSummary {
  return {
    id,
    givenName: { ru: given, be: null, en: given },
    surname: { ru: surname, be: null, en: surname },
    maidenName: null,
    sex: 'male',
    birthYear,
    deathYear: null,
    vocation: 'other',
    portrait: null,
    portraitVideo: null,
    parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false,
    isDefaultRoot: false
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  useFamilyStore().people = [
    person('a', 'Anna', 'Oak', 1850),
    person('b', 'Boris', 'Oak', 1880),
    person('c', 'Anton', 'Pine', 1920),
    person('d', 'Nadia', 'Oak', null)
  ];
});

describe('personMatchesQuery', () => {
  it('matches a case-insensitive substring of the given name or surname', () => {
    const p = person('x', 'Anna', 'Oak', 1900);
    expect(personMatchesQuery(p, 'ann', 'en')).toBe(true);
    expect(personMatchesQuery(p, 'OAK', 'en')).toBe(true);
    expect(personMatchesQuery(p, 'zzz', 'en')).toBe(false);
  });

  it('never matches a blank query', () => {
    expect(personMatchesQuery(person('x', 'Anna', 'Oak', 1900), '   ', 'en')).toBe(false);
  });

  it('does not match against the maiden name', () => {
    const p = { ...person('x', 'Anna', 'Oak', 1900), maidenName: { ru: 'Birch', be: null, en: 'Birch' } };
    expect(personMatchesQuery(p, 'birch', 'en')).toBe(false);
  });

  it('matches the full name in either order', () => {
    const p = person('x', 'Anna', 'Oak', 1900);
    expect(personMatchesQuery(p, 'Anna Oak', 'en')).toBe(true);
    expect(personMatchesQuery(p, 'oak anna', 'en')).toBe(true);
    expect(personMatchesQuery(p, 'nna oa', 'en')).toBe(true); // substring across the word boundary
    expect(personMatchesQuery(p, 'anna pine', 'en')).toBe(false);
  });

  it('collapses extra whitespace in the query before matching', () => {
    const p = person('x', 'Anna', 'Oak', 1900);
    expect(personMatchesQuery(p, '  anna   oak  ', 'en')).toBe(true);
  });
});

describe('useSearchMatches', () => {
  it('returns no matches for a blank query', () => {
    const { matches, total, currentIndex, current } = useSearchMatches();
    expect(matches.value).toEqual([]);
    expect(total.value).toBe(0);
    expect(currentIndex.value).toBe(-1);
    expect(current.value).toBeNull();
  });

  it('orders matches youngest first, people without a birth year last', () => {
    useUiStore().setSearch('oak');
    const { matches } = useSearchMatches();
    expect(matches.value.map(p => p.id)).toEqual(['b', 'a', 'd']);
  });

  it('targets the cursor match modulo the total, wrapping around', () => {
    const ui = useUiStore();
    ui.setSearch('oak');
    const { current, currentIndex } = useSearchMatches();
    expect(current.value?.id).toBe('b');
    ui.advanceSearchCursor();
    expect(current.value?.id).toBe('a');
    ui.advanceSearchCursor();
    ui.advanceSearchCursor(); // cursor now 3; 3 % 3 = 0 → wraps to index 0
    expect(currentIndex.value).toBe(0);
    expect(current.value?.id).toBe('b');
  });

  it('matches across the whole graph by given name too', () => {
    useUiStore().setSearch('an');
    const { matches } = useSearchMatches();
    // Anton (1920) is younger than Anna (1850)
    expect(matches.value.map(p => p.id)).toEqual(['c', 'a']);
  });
});
