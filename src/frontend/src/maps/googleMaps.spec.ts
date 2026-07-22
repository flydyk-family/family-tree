import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// Deliberate, narrow exception to this module's "thin wrapper, untested by design"
// rationale for searchPlace/reverseGeocode/localizedNames above: the 10-second load
// timeout is pure, local timer logic that's fully testable without any real network
// or SDK. Scope stays to just this one behavior.
describe('loadGoogleMaps timeout', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    vi.useFakeTimers();
    // Give document.createElement('script') a plain settable object so appendChild
    // never triggers a real network load — onload/onerror are simply never invoked.
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'script') {
        return { onload: null, onerror: null, src: '', async: false } as unknown as HTMLScriptElement;
      }
      return realCreateElement(tag);
    });
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('rejects if the script never fires onload or onerror within 10s', async () => {
    const { loadGoogleMaps } = await import('./googleMaps');
    const promise = loadGoogleMaps();
    const assertion = expect(promise).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;
  });
});
