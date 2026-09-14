import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchFamilies } from './familiesApi';

afterEach(() => vi.unstubAllGlobals());

describe('fetchFamilies', () => {
  it('returns the registry from /api/families', async () => {
    const body = [{ id: 'wisniewski', name: { ru: null, be: null, en: 'Wisniewski' }, isDefault: true }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchFamilies()).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith('/api/families');
  });

  it('throws on a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchFamilies()).rejects.toThrow('500');
  });
});
