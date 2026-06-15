import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../api/familyApi', () => ({ fetchPerson: vi.fn() }));
import { fetchPerson } from '../api/familyApi';
import { useSelectionStore } from './selectionStore';
import type { PersonDetail } from '../types/family';

const detail = { id: 'p-0016', vocation: 'teacher' } as unknown as PersonDetail;
const other = { id: 'p-0042', vocation: 'farmer' } as unknown as PersonDetail;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchPerson).mockReset();
});

describe('selectionStore', () => {
  it('opens a person: fetches and stores the detail', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail);
    const store = useSelectionStore();

    await store.open('p-0016');

    expect(fetchPerson).toHaveBeenCalledWith('p-0016');
    expect(store.detail).toEqual(detail);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('records an error when the fetch fails', async () => {
    vi.mocked(fetchPerson).mockRejectedValue(new Error('boom'));
    const store = useSelectionStore();

    await store.open('p-0016');

    expect(store.error).toBe('boom');
    expect(store.detail).toBeNull();
  });

  it('close clears the selection', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail);
    const store = useSelectionStore();
    await store.open('p-0016');

    store.close();

    expect(store.selectedId).toBeNull();
    expect(store.detail).toBeNull();
  });

  it('does not refetch when opening the already-selected person', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail);
    const store = useSelectionStore();
    await store.open('p-0016');
    await store.open('p-0016');

    expect(fetchPerson).toHaveBeenCalledTimes(1);
  });

  it('serves a previously-viewed person from cache without refetching', async () => {
    vi.mocked(fetchPerson).mockImplementation(id =>
      Promise.resolve(id === 'p-0016' ? detail : other));
    const store = useSelectionStore();

    await store.open('p-0016');
    await store.open('p-0042');
    await store.open('p-0016'); // back to the first person — already cached

    expect(fetchPerson).toHaveBeenCalledTimes(2);
    expect(store.detail).toEqual(detail);
  });

  it('skips the loading state on a cache hit', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail);
    const store = useSelectionStore();
    await store.open('p-0016');
    store.close();

    const promise = store.open('p-0016'); // cache hit — resolves without a fetch
    expect(store.loading).toBe(false);
    expect(store.detail).toEqual(detail);
    await promise;
    expect(fetchPerson).toHaveBeenCalledTimes(1);
  });
});
