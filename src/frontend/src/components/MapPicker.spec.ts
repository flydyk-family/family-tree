import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import MapPicker from './MapPicker.vue';

vi.mock('../maps/googleMaps', () => ({
  isMapsConfigured: () => false,
  loadGoogleMaps: vi.fn(),
  searchPlace: vi.fn(),
  localizedNames: vi.fn(),
  reverseGeocode: vi.fn()
}));

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false });

function mountPicker() {
  return mount(MapPicker, {
    props: { modelValue: { lat: null, lng: null, place: { ru: '', be: '', en: '' }, mapUrl: null } },
    global: { plugins: [i18n] }
  });
}

describe('MapPicker (keyless fallback)', () => {
  it('shows manual coordinate inputs when Maps is not configured', () => {
    const w = mountPicker();
    expect(w.find('[data-test="map-manual"]').exists()).toBe(true);
    expect(w.find('[data-test="map-canvas"]').exists()).toBe(false);
  });

  it('emits coords + mapUrl when latitude and longitude are typed', async () => {
    const w = mountPicker();
    await w.find('[data-test="manual-lat"]').setValue('50.0614');
    await w.find('[data-test="manual-lng"]').setValue('19.9372');
    const events = w.emitted('update:modelValue');
    expect(events).toBeTruthy();
    const last = events![events!.length - 1][0] as { lat: number; lng: number; mapUrl: string };
    expect(last.lat).toBe(50.0614);
    expect(last.lng).toBe(19.9372);
    expect(last.mapUrl).toContain('query=50.0614%2C19.9372');
  });
});
