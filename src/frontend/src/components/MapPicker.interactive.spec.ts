import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import MapPicker from './MapPicker.vue';
import { buildMapUrl } from '../maps/mapLink';

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
    localizedNames: vi.fn()
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
    expect(w.find('[data-test="map-manual"]').exists()).toBe(false);
    expect(mapInstances.length).toBe(1);
    expect(markerInstances.length).toBe(1);
  });

  it('emits coords + mapUrl when the marker fires dragend', async () => {
    mapInstances.length = 0;
    markerInstances.length = 0;
    const w = mountPicker();
    await flushPromises();

    const marker = markerInstances[0];
    marker.position.lat = 48.8566;
    marker.position.lng = 2.3522;
    const handler = marker.dragendHandler;
    expect(handler).toBeTruthy();
    handler?.();

    const events = w.emitted('update:modelValue');
    expect(events).toBeTruthy();
    const last = events![events!.length - 1][0] as { lat: number; lng: number; mapUrl: string | null };
    expect(last.lat).toBe(48.8566);
    expect(last.lng).toBe(2.3522);
    expect(last.mapUrl).toBe(buildMapUrl(48.8566, 2.3522));
    expect(last.mapUrl).toContain('query=');
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
});
