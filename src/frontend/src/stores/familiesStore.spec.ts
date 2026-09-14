import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useFamiliesStore } from './familiesStore';

const two = [
  { id: 'wisniewski', name: { ru: 'Вишневские', be: null, en: 'Wisniewski' }, isDefault: true },
  { id: 'kowalski', name: { ru: 'Ковальские', be: null, en: 'Kowalski' }, isDefault: false }
];

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => vi.unstubAllGlobals());

const stub = (body: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));

describe('familiesStore', () => {
  it('loads the registry and knows the default family', async () => {
    stub(two);
    const store = useFamiliesStore();

    await store.load();

    expect(store.defaultFamilyId).toBe('wisniewski');
    expect(store.hasMultiple).toBe(true);
    expect(store.isKnown('kowalski')).toBe(true);
    expect(store.isKnown('nowak')).toBe(false);
  });

  it('finds a registered family by id', async () => {
    stub(two);
    const store = useFamiliesStore();
    await store.load();

    expect(store.familyById('kowalski')?.name.en).toBe('Kowalski');
    expect(store.familyById('nowak')).toBeUndefined();
  });

  it('maps the default family to the unprefixed routes', async () => {
    stub(two);
    const store = useFamiliesStore();
    await store.load();

    expect(store.routeFamily('wisniewski')).toBeNull();
    expect(store.routeFamily('kowalski')).toBe('kowalski');
  });

  it('is not switchable with one family', async () => {
    stub([two[0]]);
    const store = useFamiliesStore();
    await store.load();

    expect(store.hasMultiple).toBe(false);
  });

  it('loads only once', async () => {
    stub(two);
    const store = useFamiliesStore();

    await store.load();
    await store.load();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to an empty registry on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const store = useFamiliesStore();

    await store.load();

    expect(store.families).toEqual([]);
    expect(store.hasMultiple).toBe(false);
  });
});
