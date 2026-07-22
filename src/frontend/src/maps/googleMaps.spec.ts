import { describe, it, expect, afterEach, vi } from 'vitest';
import { searchPlace, reverseGeocode, localizedNames } from './googleMaps';

afterEach(() => { vi.restoreAllMocks(); });

describe('searchPlace', () => {
  it('hits the search proxy with the query param and credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);

    await searchPlace('Minsk');

    expect(fetchMock).toHaveBeenCalledWith('/api/geocode/search?q=Minsk', { credentials: 'include' });
  });

  it('returns [] on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    expect(await searchPlace('Minsk')).toEqual([]);
  });
});

describe('reverseGeocode', () => {
  it('hits the reverse proxy with lat/lng params and credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ placeId: 'p1' }) });
    vi.stubGlobal('fetch', fetchMock);

    await reverseGeocode(53.9, 27.5667);

    expect(fetchMock).toHaveBeenCalledWith('/api/geocode/reverse?lat=53.9&lng=27.5667', { credentials: 'include' });
  });

  it('returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    expect(await reverseGeocode(53.9, 27.5667)).toBeNull();
  });
});

describe('localizedNames', () => {
  it('hits the names proxy with the placeId param and credentials', async () => {
    const names = { ru: 'Минск', be: 'Мінск', en: 'Minsk' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => names });
    vi.stubGlobal('fetch', fetchMock);

    const result = await localizedNames('p1');

    expect(fetchMock).toHaveBeenCalledWith('/api/geocode/names?placeId=p1', { credentials: 'include' });
    expect(result).toEqual(names);
  });

  it('throws on a non-OK response (existing behavior, unchanged)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(localizedNames('p1')).rejects.toThrow('404');
  });
});
