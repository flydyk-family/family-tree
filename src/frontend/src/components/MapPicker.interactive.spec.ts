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
    mapInstances: [] as Array<{
      el: HTMLElement;
      opts: Record<string, unknown>;
      setCenter: ReturnType<typeof vi.fn>;
      setZoom: ReturnType<typeof vi.fn>;
      fitBounds: ReturnType<typeof vi.fn>;
      addListener: ReturnType<typeof vi.fn>;
      clickHandler: ((e: unknown) => void) | null;
      removeClickListener: ReturnType<typeof vi.fn>;
    }>,
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
    fitBounds = vi.fn();
    addListener: ReturnType<typeof vi.fn>;
    private _record: (typeof mapInstances)[number];

    constructor(el: HTMLElement, opts: Record<string, unknown>) {
      const removeClickListener = vi.fn();
      this.addListener = vi.fn((_event: string, handler: (e: unknown) => void) => {
        this._record.clickHandler = handler;
        return { remove: removeClickListener };
      });
      this._record = {
        el, opts,
        setCenter: this.setCenter, setZoom: this.setZoom, fitBounds: this.fitBounds,
        addListener: this.addListener,
        clickHandler: null,
        removeClickListener
      };
      mapInstances.push(this._record);
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
    props: { modelValue: { lat: null, lng: null, place: { ru: '', be: '', en: '' }, mapUrl: null, placeId: null } },
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

  it('moves the pin to a plain map click and reverse-geocodes that point', async () => {
    mapInstances.length = 0;
    markerInstances.length = 0;
    vi.mocked(reverseGeocode).mockResolvedValueOnce('place-99');
    vi.mocked(localizedNames).mockResolvedValueOnce({ ru: 'Гомель', be: 'Гомель', en: 'Homyel' });
    const w = mountPicker();
    await flushPromises();

    const map = mapInstances[0];
    const marker = markerInstances[0];
    map.clickHandler?.({ latLng: { lat: () => 52.4345, lng: () => 30.9754 }, stop: vi.fn() });
    await flushPromises();

    expect(marker.setPosition).toHaveBeenCalledWith({ lat: 52.4345, lng: 30.9754 });
    expect(reverseGeocode).toHaveBeenCalledWith(52.4345, 30.9754);
    const events = w.emitted('update:modelValue')!;
    const last = events[events.length - 1][0] as { placeId: string | null; place: { en: string } };
    expect(last.placeId).toBe('place-99');
    expect(last.place.en).toBe('Homyel');
  });

  it('suppresses the info window when a place label is clicked, but still resolves the settlement from the point', async () => {
    mapInstances.length = 0;
    markerInstances.length = 0;
    vi.mocked(reverseGeocode).mockClear();
    vi.mocked(reverseGeocode).mockResolvedValueOnce('locality-place');
    vi.mocked(localizedNames).mockResolvedValueOnce({ ru: 'Брэст', be: 'Брэст', en: 'Brest' });
    const w = mountPicker();
    await flushPromises();

    const map = mapInstances[0];
    const stop = vi.fn();
    map.clickHandler?.({ latLng: { lat: () => 52.0976, lng: () => 23.7341 }, placeId: 'ChIJlabel', stop });
    await flushPromises();

    expect(stop).toHaveBeenCalledTimes(1); // default info window suppressed
    expect(reverseGeocode).toHaveBeenCalledWith(52.0976, 23.7341);
    expect(localizedNames).toHaveBeenCalledWith('locality-place');
    const events = w.emitted('update:modelValue')!;
    const last = events[events.length - 1][0] as { placeId: string | null };
    expect(last.placeId).toBe('locality-place');
  });

  it('removes the map click listener on unmount', async () => {
    mapInstances.length = 0;
    markerInstances.length = 0;
    const w = mountPicker();
    await flushPromises();

    const map = mapInstances[0];
    expect(map.removeClickListener).not.toHaveBeenCalled();
    w.unmount();
    expect(map.removeClickListener).toHaveBeenCalledTimes(1);
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

    it('rejects out-of-range manual coordinates instead of emitting them for the server to refuse', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      const w = mountPicker();
      await flushPromises();

      const lat = w.find('[data-test="manual-lat"]');
      const lng = w.find('[data-test="manual-lng"]');
      // The attributes bound the spinners; the handler has to bound typed/pasted values.
      expect(lat.attributes('min')).toBe('-90');
      expect(lat.attributes('max')).toBe('90');
      expect(lng.attributes('min')).toBe('-180');
      expect(lng.attributes('max')).toBe('180');

      await lat.setValue('999');
      await lng.setValue('500');

      const events = w.emitted('update:modelValue');
      const last = events![events!.length - 1][0] as { lat: number | null; lng: number | null };
      expect(last.lat).toBeNull();
      expect(last.lng).toBeNull();
      // Nothing out of range reaches the map either.
      expect(mapInstances[0].setCenter).not.toHaveBeenCalledWith({ lat: 999, lng: 500 });
    });

    it('keeps accepting the exact boundary coordinates the server allows', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      const w = mountPicker();
      await flushPromises();

      await w.find('[data-test="manual-lat"]').setValue('-90');
      await w.find('[data-test="manual-lng"]').setValue('180');

      const events = w.emitted('update:modelValue');
      const last = events![events!.length - 1][0] as { lat: number | null; lng: number | null };
      expect(last.lat).toBe(-90);
      expect(last.lng).toBe(180);
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

      // No viewport on this result, so the fixed locality zoom is the fallback.
      expect(map.setCenter).toHaveBeenCalledWith({ lat: 48.8566, lng: 2.3522 });
      expect(map.setZoom).toHaveBeenCalledWith(11);
      expect(map.fitBounds).not.toHaveBeenCalled();
      expect(marker.setPosition).toHaveBeenCalledWith({ lat: 48.8566, lng: 2.3522 });
      expect(localizedNames).toHaveBeenCalledWith('paris');

      const events = w.emitted('update:modelValue');
      const last = events![events!.length - 1][0] as { place: { ru: string; be: string; en: string }; placeId: string | null };
      expect(last.place).toEqual({ ru: 'Париж', be: 'Парыж', en: 'Paris' });
      expect(last.placeId).toBe('paris');
      // Selecting a result clears the dropdown and fills the search box with its description.
      expect(w.find('[data-test="map-results"]').exists()).toBe(false);
      expect((w.find('[data-test="map-search"]').element as HTMLInputElement).value).toBe('Paris, France');
    });

    it('frames the whole place when the result carries a viewport, instead of zooming to the pin', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      const viewport = { south: 48.8156, west: 2.2242, north: 48.9022, east: 2.4699 };
      vi.mocked(searchPlace).mockResolvedValueOnce([
        { lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris', viewport }
      ]);
      vi.mocked(localizedNames).mockResolvedValueOnce({ ru: 'Париж', be: 'Парыж', en: 'Paris' });

      const w = mountPicker();
      await flushPromises();
      const map = mapInstances[0];

      await w.find('[data-test="map-search"]').setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();
      await w.find('[data-test="map-results"] button').trigger('click');
      await flushPromises();

      expect(map.fitBounds).toHaveBeenCalledWith(viewport);
      // The point-zoom path must not also run — that is what dived onto the pin.
      expect(map.setZoom).not.toHaveBeenCalled();
      // The marker still marks the exact coordinate being saved.
      expect(markerInstances[0].setPosition).toHaveBeenCalledWith({ lat: 48.8566, lng: 2.3522 });
    });

    it('shows a searching indicator while the lookup is in flight, then the results', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      let release!: (v: PlaceResult[]) => void;
      vi.mocked(searchPlace).mockReturnValueOnce(new Promise(r => { release = r; }));

      const w = mountPicker();
      await flushPromises();
      await w.find('[data-test="map-search"]').setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);

      expect(w.find('[data-test="map-searching"]').exists()).toBe(true);
      expect(w.find('[data-test="map-results"]').exists()).toBe(false);

      release([{ lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris' }]);
      await flushPromises();

      expect(w.find('[data-test="map-searching"]').exists()).toBe(false);
      expect(w.find('[data-test="map-results"]').exists()).toBe(true);
    });

    it('does not let a search still in flight repopulate the list after Escape dismisses it', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      let release!: (v: PlaceResult[]) => void;
      vi.mocked(searchPlace).mockReturnValueOnce(new Promise(r => { release = r; }));

      const w = mountPicker();
      await flushPromises();
      await w.find('[data-test="map-search"]').setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);
      expect(w.find('[data-test="map-searching"]').exists()).toBe(true);

      await w.find('[data-test="map-search"]').trigger('keydown.esc');
      // The request is still outstanding; it resolves only now, after the dismissal.
      release([{ lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris' }]);
      await flushPromises();

      expect(w.find('[data-test="map-results"]').exists()).toBe(false);
      expect(w.find('[data-test="map-searching"]').exists()).toBe(false);
    });

    it('does not let a search still in flight repopulate the list after the query is cleared', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      let release!: (v: PlaceResult[]) => void;
      vi.mocked(searchPlace).mockReturnValueOnce(new Promise(r => { release = r; }));

      const w = mountPicker();
      await flushPromises();
      await w.find('[data-test="map-search"]').setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);

      // Shrinking below the 2-char floor takes the early-return path, which must also
      // retire the outstanding request.
      await w.find('[data-test="map-search"]').setValue('P');
      await vi.advanceTimersByTimeAsync(350);
      release([{ lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris' }]);
      await flushPromises();

      expect(w.find('[data-test="map-results"]').exists()).toBe(false);
    });

    it('reports a failed search as a failure, not as "no places found"', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      vi.mocked(searchPlace).mockRejectedValueOnce(new Error('Geocode search failed: HTTP 502'));

      const w = mountPicker();
      await flushPromises();
      await w.find('[data-test="map-search"]').setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();

      expect(w.find('[data-test="map-search-failed"]').exists()).toBe(true);
      // Critically NOT the empty-result message — a broken proxy must not read as
      // "that place doesn't exist".
      expect(w.find('[data-test="map-no-results"]').exists()).toBe(false);
      expect(w.find('[data-test="map-results"]').exists()).toBe(false);
    });

    it('clears a previous failure once a later search succeeds', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      vi.mocked(searchPlace).mockRejectedValueOnce(new Error('boom'));

      const w = mountPicker();
      await flushPromises();
      await w.find('[data-test="map-search"]').setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();
      expect(w.find('[data-test="map-search-failed"]').exists()).toBe(true);

      vi.mocked(searchPlace).mockResolvedValueOnce([
        { lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris' }
      ]);
      await w.find('[data-test="map-search"]').setValue('Paris FR');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();

      expect(w.find('[data-test="map-search-failed"]').exists()).toBe(false);
      expect(w.find('[data-test="map-results"]').exists()).toBe(true);
    });

    it('says so when a search finds nothing, rather than looking un-searched', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      vi.mocked(searchPlace).mockResolvedValueOnce([]);

      const w = mountPicker();
      await flushPromises();
      // Before searching there is no empty-state message — only after one resolves.
      expect(w.find('[data-test="map-no-results"]').exists()).toBe(false);

      await w.find('[data-test="map-search"]').setValue('Zzzzzz');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();

      expect(w.find('[data-test="map-no-results"]').exists()).toBe(true);
      expect(w.find('[data-test="map-results"]').exists()).toBe(false);
    });

    it('dismisses the suggestion list on Escape, keeping the typed query', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      vi.mocked(searchPlace).mockResolvedValueOnce([
        { lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris' }
      ]);

      const w = mountPicker();
      await flushPromises();
      await w.find('[data-test="map-search"]').setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();
      expect(w.find('[data-test="map-results"]').exists()).toBe(true);

      await w.find('[data-test="map-search"]').trigger('keydown.esc');

      expect(w.find('[data-test="map-results"]').exists()).toBe(false);
      // The query survives — Escape dismisses the list, it does not undo the typing.
      expect((w.find('[data-test="map-search"]').element as HTMLInputElement).value).toBe('Paris');
    });

    it('does not flash "no places found" after a result is successfully chosen', async () => {
      // Choosing clears `results`, so the status block falls through to the empty-state
      // branch unless the "a search has run" flag is cleared too — telling the editor
      // nothing was found immediately after they found something.
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      vi.mocked(searchPlace).mockResolvedValueOnce([
        { lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris' }
      ]);
      vi.mocked(localizedNames).mockResolvedValueOnce({ ru: 'Париж', be: 'Парыж', en: 'Paris' });

      const w = mountPicker();
      await flushPromises();
      await w.find('[data-test="map-search"]').setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();
      await w.find('[data-test="map-results"] button').trigger('click');
      await flushPromises();

      expect(w.find('[data-test="map-no-results"]').exists()).toBe(false);
      expect(w.find('[data-test="map-results"]').exists()).toBe(false);
    });

    it('echoes the chosen place name, which the marker covers on the basemap', async () => {
      mapInstances.length = 0;
      markerInstances.length = 0;
      vi.useFakeTimers();
      vi.mocked(searchPlace).mockResolvedValueOnce([
        { lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris' }
      ]);
      vi.mocked(localizedNames).mockResolvedValueOnce({ ru: 'Париж', be: 'Парыж', en: 'Paris' });

      const w = mountPicker();
      await flushPromises();
      expect(w.find('[data-test="map-chosen"]').exists()).toBe(false);

      await w.find('[data-test="map-search"]').setValue('Paris');
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();
      await w.find('[data-test="map-results"] button').trigger('click');
      await flushPromises();

      expect(w.find('[data-test="map-chosen"]').text()).toBe('Paris, France');
    });

    it('still emits coordinates and the place ID when localizedNames fails for a chosen result', async () => {
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
      const last = events![events!.length - 1][0] as { lat: number; lng: number; placeId: string | null };
      expect(last.lat).toBe(48.8566);
      expect(last.lng).toBe(2.3522);
      expect(last.placeId).toBe('paris');
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

      await w.setProps({ modelValue: { lat: 48.8566, lng: 2.3522, place: { ru: '', be: '', en: 'Paris' }, mapUrl: null, placeId: null } });
      await flushPromises();

      expect((w.find('[data-test="manual-lat"]').element as HTMLInputElement).value).toBe('48.8566');
      expect((w.find('[data-test="manual-lng"]').element as HTMLInputElement).value).toBe('2.3522');
    });
  });
  // Both race tests below drive fake timers; restore real ones even if an assertion throws,
  // or every later test in this file inherits them.
  afterEach(() => { vi.useRealTimers(); });

  it('does not let a slow name lookup from a picked result revert a newer pin drag', async () => {
    // chooseResult and onDragEnd both resolve names asynchronously. Without a sequencing
    // guard the pick's late reply emits its own coordinates last, silently undoing the drag.
    mapInstances.length = 0;
    markerInstances.length = 0;
    vi.useFakeTimers();
    vi.mocked(searchPlace).mockResolvedValueOnce([
      { lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris' }
    ]);
    let releasePick!: (v: { ru: string; be: string; en: string }) => void;
    vi.mocked(localizedNames)
      .mockReturnValueOnce(new Promise(r => { releasePick = r; }))   // the pick's lookup, held open
      .mockResolvedValueOnce({ ru: 'Лион', be: 'Ліон', en: 'Lyon' }); // the drag's lookup
    vi.mocked(reverseGeocode).mockResolvedValueOnce('lyon');

    const w = mountPicker();
    await flushPromises();
    await w.find('[data-test="map-search"]').setValue('Paris');
    await vi.advanceTimersByTimeAsync(350);
    await flushPromises();
    await w.find('[data-test="map-results"] button').trigger('click');
    await flushPromises();

    // Drag to a different place while the pick's name lookup is still outstanding. The SDK
    // moves the marker before firing dragend, and the component reads getPosition() — so the
    // move has to go through setPosition, not the record's constructor-time `position`.
    const marker = markerInstances[0];
    // The record types setPosition as a bare Mock, which isn't callable as-is.
    (marker.setPosition as unknown as (pos: { lat: number; lng: number }) => void)({ lat: 45.764, lng: 4.8357 });
    marker.dragendHandler?.();
    await flushPromises();

    // Now the stale pick finally answers.
    releasePick({ ru: 'Париж', be: 'Парыж', en: 'Paris' });
    await flushPromises();
    vi.useRealTimers();

    const events = w.emitted('update:modelValue');
    const last = events![events!.length - 1][0] as { lat: number; lng: number; place: { en: string } };
    expect(last.lat).toBe(45.764);
    expect(last.lng).toBe(4.8357);
    expect(last.place.en).toBe('Lyon');
  });

  it('does not let a slow name lookup revert coordinates typed into the manual inputs', async () => {
    mapInstances.length = 0;
    markerInstances.length = 0;
    vi.useFakeTimers();
    vi.mocked(searchPlace).mockResolvedValueOnce([
      { lat: 48.8566, lng: 2.3522, description: 'Paris, France', placeId: 'paris' }
    ]);
    let releasePick!: (v: { ru: string; be: string; en: string }) => void;
    vi.mocked(localizedNames).mockReturnValueOnce(new Promise(r => { releasePick = r; }));

    const w = mountPicker();
    await flushPromises();
    await w.find('[data-test="map-search"]').setValue('Paris');
    await vi.advanceTimersByTimeAsync(350);
    await flushPromises();
    await w.find('[data-test="map-results"] button').trigger('click');
    await flushPromises();

    await w.find('[data-test="manual-lat"]').setValue('10.5');
    await w.find('[data-test="manual-lng"]').setValue('20.25');
    releasePick({ ru: 'Париж', be: 'Парыж', en: 'Paris' });
    await flushPromises();
    vi.useRealTimers();

    const events = w.emitted('update:modelValue');
    const last = events![events!.length - 1][0] as { lat: number; lng: number };
    expect(last.lat).toBe(10.5);
    expect(last.lng).toBe(20.25);
  });

});
