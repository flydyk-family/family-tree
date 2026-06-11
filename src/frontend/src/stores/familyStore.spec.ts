import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { FamilyGraph } from '../types/family';

vi.mock('../api/familyApi', () => ({
  fetchFamilyGraph: vi.fn()
}));

import { fetchFamilyGraph } from '../api/familyApi';
import { useFamilyStore } from './familyStore';

function person(id: string, isDefaultRoot = false) {
  return {
    id,
    givenName: { ru: id, be: null, en: id },
    surname: { ru: 'X', be: null, en: 'X' },
    maidenName: null,
    sex: 'male',
    birthYear: 1900, deathYear: null, vocation: 'other', portrait: null, portraitVideo: null,
    parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot
  };
}

const graph: FamilyGraph = {
  people: [person('p-1'), person('p-2', true)],
  unions: [{ id: 'u-1', partnerIds: ['p-1', 'p-2'], marriageYear: null, childIds: [] }]
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchFamilyGraph).mockReset();
});

describe('familyStore', () => {
  it('load() populates people/unions and focuses the default-root person', async () => {
    vi.mocked(fetchFamilyGraph).mockResolvedValue(graph);
    const store = useFamilyStore();

    await store.load();

    expect(store.people).toHaveLength(2);
    expect(store.focusId).toBe('p-2');
    expect(store.loading).toBe(false);
  });

  it('personById looks up a person', async () => {
    vi.mocked(fetchFamilyGraph).mockResolvedValue(graph);
    const store = useFamilyStore();
    await store.load();

    expect(store.personById('p-1')?.givenName.ru).toBe('p-1');
    expect(store.personById('missing')).toBeUndefined();
  });

  it('records an error message when loading fails', async () => {
    vi.mocked(fetchFamilyGraph).mockRejectedValue(new Error('boom'));
    const store = useFamilyStore();

    await store.load();

    expect(store.error).toContain('boom');
    expect(store.loading).toBe(false);
  });
});
