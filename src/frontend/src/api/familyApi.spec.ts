import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchFamilyGraph, fetchPerson } from './familyApi';
import type { FamilyGraph, PersonDetail } from '../types/family';

const sample: FamilyGraph = { people: [], unions: [] };

afterEach(() => { vi.restoreAllMocks(); });

const detail = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: null, en: 'Tadeusz' }
} as unknown as PersonDetail;

describe('fetchPerson', () => {
  it('requests the person endpoint and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => detail });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchPerson(null, 'p-0016');

    expect(fetchMock).toHaveBeenCalledWith('/api/people/p-0016');
    expect(result).toEqual(detail);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(fetchPerson(null, 'missing')).rejects.toThrow('404');
  });
});

describe('fetchFamilyGraph', () => {
  it('requests the graph endpoint and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sample
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchFamilyGraph(null);

    expect(fetchMock).toHaveBeenCalledWith('/api/family/graph');
    expect(result).toEqual(sample);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchFamilyGraph(null)).rejects.toThrow('500');
  });

  it('uses the alias graph route for the default family', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ people: [], unions: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchFamilyGraph(null);

    expect(fetchMock).toHaveBeenCalledWith('/api/family/graph');
  });

  it('uses the family-scoped routes for another family', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ people: [], unions: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchFamilyGraph('kowalski');
    await fetchPerson('kowalski', 'p-0001');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/families/kowalski/graph');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/families/kowalski/people/p-0001');
  });
});
