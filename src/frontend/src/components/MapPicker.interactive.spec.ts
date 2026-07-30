import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import MapPicker from './MapPicker.vue';
import { buildMapUrl } from '../maps/mapLink';
import { reverseGeocode, localizedNames, searchPlace, loadGoogleMaps, type PlaceResult } from '../maps/googleMaps';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

const { mapInstances, markerInstances } = vi.hoisted(() => {
  return {
    mapInstances: [] as Array<{ el: HTMLElement; opts: Record<string, unknown>; setCenter: ReturnType<typeof vi.fn>; setZoom: ReturnType<typeof vi.fn> }>,
    markerInstances: [] as Array<{
      opts: Record<string, unknown>;
      setPosition: ReturnType<typeof vi.fn>;
      getPosition: ReturnType<typeof vi.fn>;
      setMap: ReturnType<typeof vi.fn>;
      addListener: ReturnType<typeof vi.fn>;
      dragendHandler: (() => void) | null;
      removeListener: ReturnType<typeof vi.fn>;
      position: { lat: number; lng: number };
    }>
  };
});

vi.mock('../maps/googleMaps', async () => {
  const actual = await vi.importActual<typeof import('../maps/googleMaps')>('../maps/googleMaps');

  class FakeMap {
    setCenter = vi.fn();
    setZoom = vi.fn();
    constructor(el: HTMLElement, opts: Record<string, unknown>) {
      mapInstances.push({ el, opts, setCenter: this.setCenter, setZoom: this.setZoom });
    }
  }

  class FakeMarker {
    setPosition = vi.fn((pos: { lat: number; lng: number }) => { this._position = pos; });
    setMap = vi.fn();
    addListener: ReturnType<typeof vi.fn>;
    private _position: { lat: number; lng: number };
    private _record: (typeof markerInstances)[number];

    constructor(opts: Record<string, unknown>) {
      const position = opts.position as { lat: number; lng: number };
      this._position = position;
      const removeListener = vi.fn();
      this.addListener = vi.fn((_event: string, handler: () => void) => {
        this._record.dragendHandler = handler;
        return { remove: removeListener };
      });
      this._record = {
        opts,
        setPosition: this.setPosition,
        getPosition: vi.fn(() => ({ lat: () => this._position.lat, lng: () => this._position.lng })),
        setMap: this.setMap,
        addListener: this.addListener,
        dragendHandler: null,
        removeListener,
        position
      };
      markerInstances.push(this._record);
    }

    getPosition(): { lat: () => number; lng: () => number } {
      return { lat: () => this._position.lat, lng: () => this._position.lng };
    }
  }

  return {
    ...actual,
    isMapsConfigured: () => true,
    loadGoogleMaps: vi.fn().mockResolvedValue({ Map: FakeMap, Marker: FakeMarker }),
    searchPlace: vi.fn(),
    localizedNames: vi.fn(),
    reverseGeocode: vi.fn().mockResolvedValue(null)
  };
});

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false });

function mountPicker() {
  return mount(MapPicker, {
    props: { modelValue: { lat: null, lng: null, place: { ru: '', be: '', en: '' }, mapUrl: null } },
    global: { plugins: [i18n] }
  });
}

describe('MapPicker (interactive Maps SDK)', () => {
  it('renders the map canvas and constructs a Map + Marker after mount', async () => {
    mapInstances.length = 0;
    markerInstances.length = 0;
    const w = mountPicker();
    await flushPromises();

    expect(w.find('[data-test="map-canvas"]').exists()).toBe(true);
    expect(w.find('[data-test="map-manual"]').exists()).toBe(true);
    expect(mapInstances.length).toBe(1);
    expect(markerInstances.length).toBe(1);
  });

  it('emits coords + mapUrl when the marker fires dragend and reverse geocoding finds nothing', async () => {
    mapInstances.length = 0;
    markerInstances.length = 0;
    vi.mocked(reverseGeocode).mockResolvedValueOnce(null);
    const w = mountPicker();
    await flushPromises();

    const marker = markerInstances[0];
    marker.position.lat = 48.8566;
    marker.position.lng = 2.3522;
    const handler = marker.dragendHandler;
    expect(handler).toBeTruthy();
    handler?.();
    await flushPromises();

    expect(reverseGeocode).toHaveBeenCalledWith(48.8566, 2.3522);
    const events = w.emitted('update:modelValue');
    expect(events).toBeTruthy();
    const last = events![events!.length - 1][0] as { lat: number; lng: number; mapUrl: string | null };
    expect(last.lat).toBe(48.8566);
    expect(last.lng).toBe(2.3522);
    expect(last.mapUrl).toBe(buildMapUrl(48.8566, 2.3522));
    expect(last.mapUrl).toContain('query=');
  });

  it('reverse-geocodes the dropped pin and fills all three locale names', async () => {
    mapInstances.length = 0;
    markerInstances.length = 0;
    vi.mocked(reverseGeocode).mockResolvedValueOnce('place-42');
    vi.mocked(localizedNames).mockResolvedValueOnce({ ru: 'Париж', be: 'Парыж', en: 'Paris' });
    const w = mountPicker();
    await flushPromises();

    const marker = markerInstances[0];
    marker.position.lat = 48.8566;
    marker.position.lng = 2.3522;
    marker.dragendHandler?.();
    await flushPromises();

    expect(reverseGeocode).toHaveBeenCalledWith(48.8566, 2.3522);
    expect(localizedNames).toHaveBeenCalledWith('place-42');
    const events = w.emitted('update:modelValue');
    const last = events![events!.length - 1][0] as { lat: number; lng: number; place: { ru: string; be: string; en: string } };
    expect(last.place).toEqual({ ru: 'Париж', be: 'Парыж', en: 'Paris' });
  });

  it('still emits coordinates when reverse geocoding fails', async () => {
    mapInstances.length = 0;
    markerInstances.length = 0;
    vi.mocked(reverseGeocode).mockRejectedValueOnce(new Error('network down'));
    const w = mountPicker();
    await flushPromises();

    const marker = markerInstances[0];
    marker.position.lat = 48.8566;
    marker.position.lng = 2.3522;
    marker.dragendHandler?.();
    await flushPromises();

    const events = w.emitted('update:modelValue');
    const last = events![events!.length - 1][0] as { lat: number; lng: number };
    expect(last.lat).toBe(48.8566);
    expect(last.lng).toBe(2.3522);
  });

  it('releases the marker listener and detaches the marker from the map on unmount', async () => {
    mapInstances.length = 0;
    markerInstances.length = 0;
    const w = mountPicker();
    await flushPromises();

    const marker = markerInstances[0];
    expect(marker.removeListener).not.toHaveBeenCalled();
    expect(marker.setMap).not.toHaveBeenCalled();

    w.unmount();

    expect(marker.removeListener).toHaveBeenCalledTimes(1);
    expect(marker.setMap).toHaveBeenCalledWith(null);
  });

  it('builds no SDK objects at all when unmounted while the Maps script is still loading', async () => {
    // The teardown test above only covers unmounting *after* the map exists.
    // Here unmount wins the race: onBeforeUnmount runs while loadGoogleMaps is
    // still pending, so it has nothing to release — and the awaited continuation
    // must not then construct a Map/Marker/listener against a detached canvas.
    mapInstances.length = 0;
    markerInstances.length = 0;
    const load = deferred<{ Map: unknown; Marker: unknown }>();
    const previous = vi.mocked(loadGoogleMaps).getMockImplementation();
    vi.mocked(loadGoogleMaps).mockReturnValueOnce(load.promise as never);

    const w = mountPicker();
    w.unmount();

    // Resolve only after unmount, reusing the same fakes the other tests use.
    const maps = await (previous!() as Promise<{ Map: unknown; Marker: unknown }>);
    load.resolve(maps);
    await flushPromises();

    expect(mapInstances.length).toBe(0);
    expect(markerInstances.length).toBe(0);
  });

  describe('stale-response race in debounced search', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('applies only the most recent search results when an earlier request resolves last', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();

      const first = deferred<PlaceResult[]>();
      const second = deferred<PlaceResult[]>();
      vi.mocked(searchPlace).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

      const w = mountPicker();
      await flushPromises();

      const searchInput = w.find('[data-test="map-search"]');
      await searchInput.setValue('Par');
      await vi.advanceTimersByTimeAsync(350);
      expect(searchPlace).toHaveBeenCalledTimes(1);

      await searchInput.setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);
      expect(searchPlace).toHaveBeenCalledTimes(2);

      // Resolve out of order: the second (more recent) call settles first.
      second.resolve([{ lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris' }]);
      await flushPromises();
      first.resolve([{ lat: 50.0614, lng: 19.9372, description: 'Kraków stale result', placeId: 'krakow' }]);
      await flushPromises();

      const resultTexts = w.findAll('[data-test="map-results"] button').map(b => b.text());
      expect(resultTexts).toEqual(['Paris, France']);
    });
  });

  describe('manual lat/lng inputs alongside the map', () => {
    it('emits typed coordinates and syncs the map when the manual fields are edited', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      const w = mountPicker();
      await flushPromises();

      const map = mapInstances[0];
      const marker = markerInstances[0];

      await w.find('[data-test="manual-lat"]').setValue('48.8566');
      await w.find('[data-test="manual-lng"]').setValue('2.3522');

      const events = w.emitted('update:modelValue');
      expect(events).toBeTruthy();
      const last = events![events!.length - 1][0] as { lat: number; lng: number };
      expect(last.lat).toBe(48.8566);
      expect(last.lng).toBe(2.3522);

      expect(map.setCenter).toHaveBeenCalledWith({ lat: 48.8566, lng: 2.3522 });
      expect(marker.setPosition).toHaveBeenCalledWith({ lat: 48.8566, lng: 2.3522 });
    });
  });

  describe('choosing a search result', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('centers the map, positions the marker, and fills localized names', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      vi.mocked(searchPlace).mockResolvedValueOnce([
        { lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris' }
      ]);
      vi.mocked(localizedNames).mockResolvedValueOnce({ ru: 'Париж', be: 'Парыж', en: 'Paris' });

      const w = mountPicker();
      await flushPromises();
      const map = mapInstances[0];
      const marker = markerInstances[0];

      await w.find('[data-test="map-search"]').setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();

      const resultButton = w.find('[data-test="map-results"] button');
      expect(resultButton.exists()).toBe(true);
      await resultButton.trigger('click');
      await flushPromises();

      expect(map.setCenter).toHaveBeenCalledWith({ lat: 48.8566, lng: 2.3522 });
      expect(map.setZoom).toHaveBeenCalledWith(11);
      expect(marker.setPosition).toHaveBeenCalledWith({ lat: 48.8566, lng: 2.3522 });
      expect(localizedNames).toHaveBeenCalledWith('paris');

      const events = w.emitted('update:modelValue');
      const last = events![events!.length - 1][0] as { place: { ru: string; be: string; en: string } };
      expect(last.place).toEqual({ ru: 'Париж', be: 'Парыж', en: 'Paris' });
      // Selecting a result clears the dropdown and fills the search box with its description.
      expect(w.find('[data-test="map-results"]').exists()).toBe(false);
      expect((w.find('[data-test="map-search"]').element as HTMLInputElement).value).toBe('Paris, France');
    });

    it('still emits coordinates when localizedNames fails for a chosen result', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      vi.mocked(searchPlace).mockResolvedValueOnce([
        { lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris' }
      ]);
      vi.mocked(localizedNames).mockRejectedValueOnce(new Error('names lookup failed'));

      const w = mountPicker();
      await flushPromises();

      await w.find('[data-test="map-search"]').setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();

      await w.find('[data-test="map-results"] button').trigger('click');
      await flushPromises();

      const events = w.emitted('update:modelValue');
      const last = events![events!.length - 1][0] as { lat: number; lng: number };
      expect(last.lat).toBe(48.8566);
      expect(last.lng).toBe(2.3522);
    });
  });

  describe('search input edge cases', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('clears results when the query is shortened back below 2 characters', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      vi.mocked(searchPlace).mockResolvedValueOnce([
        { lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris' }
      ]);
      const w = mountPicker();
      await flushPromises();

      const searchInput = w.find('[data-test="map-search"]');
      await searchInput.setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();
      expect(w.find('[data-test="map-results"]').exists()).toBe(true);

      await searchInput.setValue('P');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();

      expect(w.find('[data-test="map-results"]').exists()).toBe(false);
    });

    it('clears results without crashing when searchPlace rejects', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      vi.mocked(searchPlace).mockRejectedValueOnce(new Error('network down'));
      const w = mountPicker();
      await flushPromises();

      await w.find('[data-test="map-search"]').setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();

      expect(w.find('[data-test="map-results"]').exists()).toBe(false);
    });

    it('cancels a pending debounced search on unmount', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      const w = mountPicker();
      await flushPromises();

      // searchPlace's call history persists across this file's tests (no global
      // mock-reset configured) — compare against a snapshot, not an absolute zero.
      const callsBeforeUnmount = vi.mocked(searchPlace).mock.calls.length;
      await w.find('[data-test="map-search"]').setValue('Paris');
      w.unmount();
      await vi.advanceTimersByTimeAsync(350);

      expect(vi.mocked(searchPlace).mock.calls.length).toBe(callsBeforeUnmount);
    });
  });

  describe('when loadGoogleMaps fails after mount', () => {
    it('falls back to manual-only entry without a canvas', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.mocked(loadGoogleMaps).mockRejectedValueOnce(new Error('Google Maps script load timed out'));
      const w = mountPicker();
      await flushPromises();

      expect(w.find('[data-test="map-canvas"]').exists()).toBe(false);
      expect(w.find('[data-test="map-manual"]').exists()).toBe(true);
      expect(mapInstances.length).toBe(0);
    });
  });

  describe('prop-driven sync of the manual inputs', () => {
    it('updates the manual lat/lng inputs when modelValue changes externally', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      const w = mountPicker();
      await flushPromises();

      await w.setProps({ modelValue: { lat: 48.8566, lng: 2.3522, place: { ru: '', be: '', en: 'Paris' }, mapUrl: null } });
      await flushPromises();

      expect((w.find('[data-test="manual-lat"]').element as HTMLInputElement).value).toBe('48.8566');
      expect((w.find('[data-test="manual-lng"]').element as HTMLInputElement).value).toBe('2.3522');
    });
  });
});
