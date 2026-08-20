import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { searchPlace, reverseGeocode, localizedNames, mapsApiKey, isMapsConfigured } from './googleMaps';

afterEach(() => { vi.restoreAllMocks(); });

describe('searchPlace', () => {
  it('hits the search proxy with the query param and credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);

    await searchPlace('Minsk');

    expect(fetchMock).toHaveBeenCalledWith('/api/geocode/search?q=Minsk', { credentials: 'include' });
  });

  // Failures must reject, never resolve to []: the caller renders an empty array as
  // "no places found", so swallowing an error here reports a broken search as a
  // successful one that found nothing.
  it('rejects on a non-OK response instead of reporting an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(searchPlace('Minsk')).rejects.toThrow('HTTP 403');
  });

  it('rejects when fetch itself throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(searchPlace('Minsk')).rejects.toThrow('network down');
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

  it('returns null when fetch itself throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    expect(await reverseGeocode(53.9, 27.5667)).toBeNull();
  });
});

describe('mapsApiKey / isMapsConfigured', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('reports configured when the browser key is set', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'a-key');

    expect(mapsApiKey()).toBe('a-key');
    expect(isMapsConfigured()).toBe(true);
  });

  it('reports unconfigured when no key is set', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');

    expect(mapsApiKey()).toBe('');
    expect(isMapsConfigured()).toBe(false);
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

// A controllable stand-in for the injected <script>, matching the tag-check pattern
// from the timeout describe block above so document.createElement stays safe for
// every other tag (Vue's own DOM work during module import/mount).
function stubScriptElement(): { onload: (() => void) | null; onerror: (() => void) | null; src: string; async: boolean } {
  const scriptEl = { onload: null, onerror: null, src: '', async: false } as
    { onload: (() => void) | null; onerror: (() => void) | null; src: string; async: boolean };
  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'script') {
      return scriptEl as unknown as HTMLScriptElement;
    }
    return realCreateElement(tag);
  });
  vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node);
  return scriptEl;
}

describe('loadGoogleMaps', () => {
  afterEach(() => {
    delete (window as unknown as { google?: unknown }).google;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('rejects immediately without touching the DOM when no key is configured', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    const appendSpy = vi.spyOn(document.head, 'appendChild');
    const { loadGoogleMaps } = await import('./googleMaps');

    await expect(loadGoogleMaps()).rejects.toThrow('not configured');
    expect(appendSpy).not.toHaveBeenCalled();
  });

  it('resolves immediately without injecting a script if google.maps already exists on window', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const fakeNamespace = { Map: class {}, Marker: class {} } as never;
    (window as unknown as { google: { maps: unknown } }).google = { maps: fakeNamespace };
    const appendSpy = vi.spyOn(document.head, 'appendChild');
    const { loadGoogleMaps } = await import('./googleMaps');

    await expect(loadGoogleMaps()).resolves.toBe(fakeNamespace);
    expect(appendSpy).not.toHaveBeenCalled();
  });

  it('memoizes an in-flight load: a second call reuses the same promise and injects only one script', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const appendSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node);
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
      tag === 'script' ? ({ onload: null, onerror: null, src: '', async: false } as unknown as HTMLScriptElement) : realCreateElement(tag));
    const { loadGoogleMaps } = await import('./googleMaps');

    const first = loadGoogleMaps();
    const second = loadGoogleMaps();

    expect(first).toBe(second);
    expect(appendSpy).toHaveBeenCalledTimes(1);
  });

  it('resolves with the namespace once the script fires onload', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const scriptEl = stubScriptElement();
    const fakeNamespace = { Map: class {}, Marker: class {} } as never;
    const { loadGoogleMaps } = await import('./googleMaps');

    const promise = loadGoogleMaps();
    (window as unknown as { google: { maps: unknown } }).google = { maps: fakeNamespace };
    scriptEl.onload?.();

    await expect(promise).resolves.toBe(fakeNamespace);
  });

  it('rejects if onload fires but window.google.maps is still missing', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const scriptEl = stubScriptElement();
    const { loadGoogleMaps } = await import('./googleMaps');

    const promise = loadGoogleMaps();
    scriptEl.onload?.();

    await expect(promise).rejects.toThrow('namespace missing');
  });

  it('rejects when the script fires onerror', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const scriptEl = stubScriptElement();
    const { loadGoogleMaps } = await import('./googleMaps');

    const promise = loadGoogleMaps();
    scriptEl.onerror?.();

    await expect(promise).rejects.toThrow('Failed to load Google Maps');
  });
});
