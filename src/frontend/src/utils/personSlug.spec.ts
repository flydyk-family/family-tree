import { describe, it, expect } from 'vitest';
import { personSlug, extractPersonId } from './personSlug';
import type { PersonSummary } from '../types/family';

function makePerson(overrides: Partial<PersonSummary>): PersonSummary {
  return {
    id: 'p-0001',
    givenName: { ru: null, be: null, en: 'Jan' },
    surname: { ru: null, be: null, en: 'Nowak' },
    maidenName: null,
    sex: 'male',
    birthYear: 1900,
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

describe('personSlug', () => {
  it('builds <given>-<surname>-<birthYear>-<id> from the English name', () => {
    const slug = personSlug(makePerson({
      id: 'p-0003',
      givenName: { ru: 'Франциск', be: null, en: 'Franciszek' },
      surname: { ru: 'Ковальский', be: null, en: 'Kowalski' },
      birthYear: 1788
    }));
    expect(slug).toBe('franciszek-kowalski-1788-p-0003');
  });

  it('folds Latin diacritics and strokes to ASCII', () => {
    const slug = personSlug(makePerson({
      id: 'p-0007',
      givenName: { ru: null, be: null, en: 'Łukasz' },
      surname: { ru: null, be: null, en: 'Żółć' },
      birthYear: 1950
    }));
    expect(slug).toBe('lukasz-zolc-1950-p-0007');
  });

  it('omits the birth year when it is unknown', () => {
    const slug = personSlug(makePerson({
      id: 'p-0042',
      givenName: { ru: null, be: null, en: 'Jan' },
      surname: { ru: null, be: null, en: 'Nowak' },
      birthYear: null
    }));
    expect(slug).toBe('jan-nowak-p-0042');
  });

  it('transliterates the Russian name when English is missing', () => {
    const slug = personSlug(makePerson({
      id: 'p-0009',
      givenName: { ru: 'Иван', be: null, en: null },
      surname: { ru: 'Петров', be: null, en: null },
      birthYear: 1850
    }));
    expect(slug).toBe('ivan-petrov-1850-p-0009');
  });

  it('collapses to just the id when no name locale is available', () => {
    const slug = personSlug(makePerson({
      id: 'p-0005',
      givenName: { ru: null, be: null, en: null },
      surname: { ru: null, be: null, en: null },
      birthYear: null
    }));
    expect(slug).toBe('p-0005');
  });
});

describe('extractPersonId', () => {
  it('pulls the trailing id out of a full slug', () => {
    expect(extractPersonId('franciszek-kowalski-1788-p-0003')).toBe('p-0003');
  });

  it('resolves a legacy bare-id link', () => {
    expect(extractPersonId('p-0003')).toBe('p-0003');
  });

  it('resolves regardless of the decorative name part', () => {
    expect(extractPersonId('anything-at-all-p-0042')).toBe('p-0042');
  });

  it('returns null when there is no id', () => {
    expect(extractPersonId('franciszek-kowalski')).toBeNull();
    expect(extractPersonId('')).toBeNull();
    expect(extractPersonId(null)).toBeNull();
  });
});
