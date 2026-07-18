import { describe, it, expect } from 'vitest';
import { seedDraft, isOverridden, buildProfilePayload, type ProfileDraft } from './profileDraft';
import type { PersonProfile } from '../api/profileApi';
import type { PersonDetail } from '../types/family';

function detail(over: Partial<PersonDetail> = {}): PersonDetail {
  return {
    id: 'p-1',
    givenName: { ru: 'Анна', be: 'Ганна', en: 'Anna' },
    surname: { ru: 'Тест', be: 'Тэст', en: 'Test' },
    maidenName: null, middleName: null,
    sex: 'female',
    birth: { year: 1901, month: null, day: null, approx: false, place: null },
    death: { year: 1980, month: null, day: null, approx: false, place: null },
    vocation: 'teacher', summary: null, biography: null,
    portrait: null, portraitVideo: null, gallery: [], links: [], residences: [],
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false,
    ...over
  } as PersonDetail;
}

const emptyBase: PersonProfile = {
  givenName: null, surname: null, maidenName: null, middleName: null, sex: null, birthYear: null, birthMonth: null, birthDay: null, deathYear: null, deathMonth: null, deathDay: null, vocation: null
};

function clone(d: ProfileDraft): ProfileDraft {
  return JSON.parse(JSON.stringify(d));
}

describe('seedDraft', () => {
  it('seeds effective values, empty string for missing name locales', () => {
    const d = seedDraft(detail({ maidenName: null }));
    expect(d.givenName).toEqual({ ru: 'Анна', be: 'Ганна', en: 'Anna' });
    expect(d.maidenName).toEqual({ ru: '', be: '', en: '' });
    expect(d.sex).toBe('female');
    expect(d.birthYear).toBe(1901);
    expect(d.deathYear).toBe(1980);
    expect(d.vocation).toBe('teacher');
  });

  it('seeds month and day from the effective detail', () => {
    const d = seedDraft(detail({
      birth: { year: 1901, month: 5, day: 3, approx: false, place: null },
      death: { year: 1980, month: 6, day: 12, approx: false, place: null }
    }));
    expect(d.birthMonth).toBe(5);
    expect(d.birthDay).toBe(3);
    expect(d.deathMonth).toBe(6);
    expect(d.deathDay).toBe(12);
  });

  it('returns an independent object each call', () => {
    const a = seedDraft(detail());
    const b = seedDraft(detail());
    a.givenName.ru = 'changed';
    expect(b.givenName.ru).toBe('Анна');
  });
});

describe('isOverridden', () => {
  it('is true when a scalar override is present', () => {
    expect(isOverridden({ ...emptyBase, birthYear: 1901 }, 'birthYear')).toBe(true);
    expect(isOverridden(emptyBase, 'birthYear')).toBe(false);
  });
  it('is true when any name locale is overridden', () => {
    expect(isOverridden({ ...emptyBase, surname: { ru: null, be: null, en: 'X' } }, 'surname')).toBe(true);
    expect(isOverridden({ ...emptyBase, surname: { ru: null, be: null, en: null } }, 'surname')).toBe(false);
  });
});

describe('buildProfilePayload', () => {
  it('untouched non-overridden fields stay null (inherit seed)', () => {
    const d = seedDraft(detail());
    const payload = buildProfilePayload(emptyBase, d, clone(d), new Set());
    expect(payload).toEqual(emptyBase);
  });

  it('a changed month becomes an override; untouched date fields stay null', () => {
    const d = seedDraft(detail());
    const orig = clone(d);
    d.birthMonth = 7;
    const payload = buildProfilePayload(emptyBase, d, orig, new Set());
    expect(payload.birthMonth).toBe(7);
    expect(payload.birthDay).toBeNull();
    expect(payload.deathMonth).toBeNull();
  });

  it('preserves an existing override the user did not touch', () => {
    const base: PersonProfile = { ...emptyBase, vocation: 'writer' };
    const d = seedDraft(detail({ vocation: 'writer' }));
    const payload = buildProfilePayload(base, d, clone(d), new Set());
    expect(payload.vocation).toBe('writer');
  });

  it('a changed scalar becomes an override', () => {
    const d = seedDraft(detail());
    const orig = clone(d);
    d.birthYear = 1902;
    const payload = buildProfilePayload(emptyBase, d, orig, new Set());
    expect(payload.birthYear).toBe(1902);
  });

  it('clearing a year sends null (inherit seed)', () => {
    const base: PersonProfile = { ...emptyBase, deathYear: 1980 };
    const d = seedDraft(detail());
    const orig = clone(d);
    d.deathYear = null;
    const payload = buildProfilePayload(base, d, orig, new Set());
    expect(payload.deathYear).toBeNull();
  });

  it('a reverted field sends null even if a value is shown', () => {
    const base: PersonProfile = { ...emptyBase, sex: 'female' };
    const d = seedDraft(detail());
    const payload = buildProfilePayload(base, d, clone(d), new Set(['sex']));
    expect(payload.sex).toBeNull();
  });

  it('a reverted name field sends null', () => {
    const base: PersonProfile = { ...emptyBase, surname: { ru: 'Овр', be: null, en: null } };
    const d = seedDraft(detail({ surname: { ru: 'Овр', be: 'Тэст', en: 'Test' } }));
    const payload = buildProfilePayload(base, d, clone(d), new Set(['surname']));
    expect(payload.surname).toBeNull();
  });

  it('editing one name locale overrides only that locale, preserving others', () => {
    const base: PersonProfile = { ...emptyBase, surname: { ru: 'Овр', be: null, en: null } };
    const d = seedDraft(detail({ surname: { ru: 'Овр', be: 'Тэст', en: 'Test' } }));
    const orig = clone(d);
    d.surname.en = 'Edited';
    const payload = buildProfilePayload(base, d, orig, new Set());
    // ru override preserved, en newly overridden, be untouched → stays null (inherit seed)
    expect(payload.surname).toEqual({ ru: 'Овр', be: null, en: 'Edited' });
  });

  it('blanking every name locale collapses to null (inherit seed), not a provided-blank object', () => {
    const base: PersonProfile = { ...emptyBase, maidenName: { ru: 'Новак', be: null, en: null } };
    const d = seedDraft(detail({ maidenName: { ru: 'Новак', be: null, en: null } }));
    const orig = clone(d);
    d.maidenName.ru = '';
    const payload = buildProfilePayload(base, d, orig, new Set());
    expect(payload.maidenName).toBeNull();
  });
});
