import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { FamilyGraph, PersonSummary } from '../types/family';

vi.mock('../api/familyApi', () => ({
  fetchFamilyGraph: vi.fn()
}));

import { fetchFamilyGraph } from '../api/familyApi';
import { useFamilyStore } from './familyStore';
import { useSelectionStore } from './selectionStore';
import { usePanelStore } from './panelStore';

function person(id: string, isDefaultRoot = false) {
  return {
    id,
    givenName: { ru: id, be: null, en: id },
    surname: { ru: 'X', be: null, en: 'X' },
    maidenName: null, middleName: null,
    sex: 'male',
    birthYear: 1900, deathYear: null, vocation: 'other', portrait: null, portraitVideo: null,
    parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot
  };
}

function personWithPortrait(id: string, portrait: string | null): PersonSummary {
  return {
    id, givenName: { ru: null, be: null, en: 'A' }, surname: { ru: null, be: null, en: 'B' },
    maidenName: null, middleName: null, sex: 'M', birthYear: 1900, deathYear: null, vocation: '',
    portrait, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false
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

describe('familyStore.applyPersonMedia', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('updates the matching person portrait/thumb in place and leaves others untouched', () => {
    const store = useFamilyStore();
    store.people = [personWithPortrait('p-0001', 'old.jpg'), personWithPortrait('p-0002', 'keep.jpg')];

    store.applyPersonMedia('p-0001', 'uploads/p-0001/new.webp', 'uploads/p-0001/new.thumb.webp');

    expect(store.people[0].portrait).toBe('uploads/p-0001/new.webp');
    expect(store.people[0].portraitThumb).toBe('uploads/p-0001/new.thumb.webp');
    expect(store.people[1].portrait).toBe('keep.jpg');
  });

  it('is a no-op for an unknown id', () => {
    const store = useFamilyStore();
    store.people = [personWithPortrait('p-0001', 'old.jpg')];
    expect(() => store.applyPersonMedia('p-9999', 'x', null)).not.toThrow();
    expect(store.people[0].portrait).toBe('old.jpg');
  });
});

describe('familyStore.applyPersonProfile', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('applyPersonProfile patches the matching summary in place', () => {
    const store = useFamilyStore();
    store.$patch({ people: [{
      id: 'p-1', givenName: { ru: 'A', be: 'A', en: 'A' }, surname: { ru: 'S', be: 'S', en: 'S' },
      maidenName: null, middleName: null, sex: 'unknown', birthYear: 1900, deathYear: null, vocation: 'unknown',
      portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
      marriedIntoFamily: false, isDefaultRoot: false
    }] });

    store.applyPersonProfile('p-1', {
      givenName: { ru: 'Б', be: 'Б', en: 'B' }, surname: { ru: 'S', be: 'S', en: 'S' },
      maidenName: { ru: 'M', be: null, en: null }, middleName: { ru: 'О', be: null, en: null }, sex: 'male', vocation: 'writer',
      birthYear: 1902, deathYear: 1980
    });

    const p = store.personById('p-1')!;
    expect(p.givenName.en).toBe('B');
    expect(p.maidenName).toEqual({ ru: 'M', be: null, en: null });
    expect(p.middleName).toEqual({ ru: 'О', be: null, en: null });
    expect(p.sex).toBe('male');
    expect(p.vocation).toBe('writer');
    expect(p.birthYear).toBe(1902);
    expect(p.deathYear).toBe(1980);
  });

  it('applyPersonProfile is a no-op for an unknown id', () => {
    const store = useFamilyStore();
    expect(() => store.applyPersonProfile('p-x', {
      givenName: { ru: 'A', be: 'A', en: 'A' }, surname: { ru: 'S', be: 'S', en: 'S' },
      maidenName: null, middleName: null, sex: 'male', vocation: 'other', birthYear: 1900, deathYear: null
    })).not.toThrow();
  });
});

describe('ensureFamily', () => {
  it('loads the requested family once', async () => {
    vi.mocked(fetchFamilyGraph).mockResolvedValue({ people: [person('p-1', true)], unions: [] } as FamilyGraph);
    const store = useFamilyStore();

    await store.ensureFamily('kowalski');
    await store.ensureFamily('kowalski');

    expect(fetchFamilyGraph).toHaveBeenCalledTimes(1);
    expect(fetchFamilyGraph).toHaveBeenCalledWith('kowalski');
    expect(store.familyId).toBe('kowalski');
  });

  it('resets people, selection and person panels when the family changes', async () => {
    vi.mocked(fetchFamilyGraph).mockResolvedValue({ people: [person('p-1', true)], unions: [] } as FamilyGraph);
    const store = useFamilyStore();
    const selection = useSelectionStore();
    const panels = usePanelStore();
    await store.ensureFamily(null);
    selection.cache['p-1'] = {} as never;
    panels.openPerson('p-1');

    const pending = store.ensureFamily('kowalski');

    expect(store.people).toEqual([]);
    expect(selection.cache).toEqual({});
    expect(panels.personPanels).toEqual([]);
    await pending;
  });

  it('does not reset on the very first load (keeps a deep-linked panel)', async () => {
    vi.mocked(fetchFamilyGraph).mockResolvedValue({ people: [person('p-1', true)], unions: [] } as FamilyGraph);
    const panels = usePanelStore();
    panels.openPerson('p-1');

    await useFamilyStore().ensureFamily('kowalski');

    expect(panels.personPanels).toHaveLength(1);
  });

  it('discards a stale response that resolves after a newer switch', async () => {
    let resolveFirst!: (graph: FamilyGraph) => void;
    vi.mocked(fetchFamilyGraph)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ people: [person('p-k', true)], unions: [] } as FamilyGraph);
    const store = useFamilyStore();

    const first = store.ensureFamily(null);
    await store.ensureFamily('kowalski');
    resolveFirst({ people: [person('p-old', true)], unions: [] } as FamilyGraph);
    await first;

    expect(store.people.map(p => p.id)).toEqual(['p-k']);
  });

  it('still resets on a switch after a failed load', async () => {
    vi.mocked(fetchFamilyGraph)
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({ people: [person('p-1', true)], unions: [] } as FamilyGraph);
    const store = useFamilyStore();
    const panels = usePanelStore();
    await store.ensureFamily('nowak');
    panels.openPerson('p-3');

    await store.ensureFamily(null);

    expect(panels.personPanels).toEqual([]);
  });
});
