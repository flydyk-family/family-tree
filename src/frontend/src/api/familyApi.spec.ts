import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchFamilyGraph } from './familyApi';
import type { FamilyGraph } from '../types/family';

const sample: FamilyGraph = { people: [], unions: [] };

afterEach(() => vi.restoreAllMocks());

describe('fetchFamilyGraph', () => {
  it('requests the graph endpoint and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sample
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchFamilyGraph();

    expect(fetchMock).toHaveBeenCalledWith('/api/family/graph');
    expect(result).toEqual(sample);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchFamilyGraph()).rejects.toThrow('500');
  });
});
