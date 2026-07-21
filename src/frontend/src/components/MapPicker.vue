<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { buildMapUrl } from '../maps/mapLink';
import {
  isMapsConfigured, loadGoogleMaps, searchPlace, localizedNames, reverseGeocode,
  type PlaceResult, type GoogleMapHandle, type GoogleMarkerHandle, type MapsListenerHandle
} from '../maps/googleMaps';

export interface PickedPlace {
  lat: number | null;
  lng: number | null;
  place: { ru: string; be: string; en: string };
  mapUrl: string | null;
}

const props = defineProps<{ modelValue: PickedPlace }>();
const emit = defineEmits<{ 'update:modelValue': [value: PickedPlace] }>();
const { t } = useI18n({ useScope: 'global' });

const configured = isMapsConfigured();
const canvas = ref<HTMLDivElement | null>(null);
const query = ref('');
const results = ref<PlaceResult[]>([]);
const searching = ref(false);
const loadError = ref(false);

let map: GoogleMapHandle | null = null;
let marker: GoogleMarkerHandle | null = null;
let dragendListener: MapsListenerHandle | null = null;

function emitCoords(lat: number | null, lng: number | null, names?: { ru: string; be: string; en: string }): void {
  emit('update:modelValue', {
    lat,
    lng,
    place: names ?? props.modelValue.place,
    mapUrl: buildMapUrl(lat, lng)
  });
}

async function fillNames(placeId: string, lat: number, lng: number): Promise<void> {
  try {
    const names = await localizedNames(placeId);
    emitCoords(lat, lng, names);
  } catch {
    emitCoords(lat, lng);
  }
}

/** Drop/drag-pin path: resolve a placeId for the dropped coordinates and reuse
 *  fillNames so all three locales get filled, same as picking a search result.
 *  Any failure (no place at that point, network error) still emits the coordinates. */
async function onDragEnd(lat: number, lng: number): Promise<void> {
  try {
    const placeId = await reverseGeocode(lat, lng);
    if (placeId) {
      await fillNames(placeId, lat, lng);
    } else {
      emitCoords(lat, lng);
    }
  } catch {
    emitCoords(lat, lng);
  }
}

let debounce: ReturnType<typeof setTimeout> | null = null;
function onQueryInput(): void {
  if (debounce) {
    clearTimeout(debounce);
  }
  debounce = setTimeout(async () => {
    if (query.value.trim().length < 2) {
      results.value = [];
      return;
    }
    searching.value = true;
    try {
      results.value = await searchPlace(query.value.trim());
    } catch {
      results.value = [];
    } finally {
      searching.value = false;
    }
  }, 350);
}

function chooseResult(r: PlaceResult): void {
  results.value = [];
  query.value = r.description;
  if (map && marker) {
    const pos = { lat: r.lat, lng: r.lng };
    map.setCenter(pos);
    map.setZoom(11);
    marker.setPosition(pos);
  }
  void fillNames(r.placeId, r.lat, r.lng);
}

onMounted(async () => {
  if (!configured || !canvas.value) {
    return;
  }
  try {
    const maps = await loadGoogleMaps();
    const start = props.modelValue.lat != null && props.modelValue.lng != null
      ? { lat: props.modelValue.lat, lng: props.modelValue.lng }
      : { lat: 53.9, lng: 27.56 }; // Minsk — a sensible regional default
    map = new maps.Map(canvas.value, { center: start, zoom: props.modelValue.lat != null ? 11 : 5, streetViewControl: false, mapTypeControl: false });
    marker = new maps.Marker({ position: start, map, draggable: true });
    dragendListener = marker.addListener('dragend', () => {
      if (!marker) {
        return;
      }
      const p = marker.getPosition();
      void onDragEnd(p.lat(), p.lng());
    });
  } catch {
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  if (debounce) {
    clearTimeout(debounce);
  }
  if (dragendListener) {
    dragendListener.remove();
    dragendListener = null;
  }
  if (marker) {
    marker.setMap(null);
    marker = null;
  }
  map = null;
});

// Manual entry (keyless / load failure). Local refs track the two fields so a
// second keystroke doesn't clobber the first with a stale `props.modelValue`
// value from before the parent has re-rendered the (controlled) v-model.
const manualLat = ref<number | null>(props.modelValue.lat);
const manualLng = ref<number | null>(props.modelValue.lng);

watch(() => props.modelValue, (v) => {
  manualLat.value = v.lat;
  manualLng.value = v.lng;
});

function onManualLat(e: Event): void {
  const v = parseFloat((e.target as HTMLInputElement).value);
  manualLat.value = Number.isFinite(v) ? v : null;
  emitCoords(manualLat.value, manualLng.value);
}
function onManualLng(e: Event): void {
  const v = parseFloat((e.target as HTMLInputElement).value);
  manualLng.value = Number.isFinite(v) ? v : null;
  emitCoords(manualLat.value, manualLng.value);
}
</script>

<template>
  <div class="map-picker" data-test="map-picker">
    <template v-if="configured && !loadError">
      <div class="map-picker__search">
        <input
          v-model="query"
          type="text"
          class="map-picker__input"
          data-test="map-search"
          :placeholder="t('members.searchCity')"
          @input="onQueryInput"
        />
        <ul v-if="results.length" class="map-picker__results" data-test="map-results">
          <li v-for="r in results" :key="r.placeId">
            <button type="button" class="map-picker__result" @click="chooseResult(r)">{{ r.description }}</button>
          </li>
        </ul>
      </div>
      <div ref="canvas" class="map-picker__canvas" data-test="map-canvas"></div>
      <p class="map-picker__hint">{{ t('members.mapHint') }}</p>
    </template>

    <div v-else class="map-picker__manual" data-test="map-manual">
      <p class="map-picker__hint">{{ t('members.mapManualHint') }}</p>
      <div class="map-picker__manual-row">
        <label class="map-picker__manual-field">
          <span>{{ t('members.lat') }}</span>
          <input type="number" step="any" class="map-picker__input" data-test="manual-lat" :value="manualLat ?? ''" @input="onManualLat" />
        </label>
        <label class="map-picker__manual-field">
          <span>{{ t('members.lng') }}</span>
          <input type="number" step="any" class="map-picker__input" data-test="manual-lng" :value="manualLng ?? ''" @input="onManualLng" />
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.map-picker { display: flex; flex-direction: column; gap: 8px; }
.map-picker__search { position: relative; }
.map-picker__input {
  width: 100%; box-sizing: border-box; padding: 8px 10px;
  background: var(--field-bg); border: 1px solid var(--gilt); border-radius: 8px; color: var(--ink);
  font-family: var(--font-body); font-size: 15px;
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 1px; }
}
.map-picker__results {
  position: absolute; z-index: 5; left: 0; right: 0; margin: 2px 0 0; padding: 0; list-style: none;
  background: var(--surface-card); border: 1px solid var(--gilt); border-radius: 8px; overflow: hidden;
}
.map-picker__result {
  display: block; width: 100%; text-align: left; padding: 8px 10px; cursor: pointer;
  background: transparent; border: none; color: var(--ink); font-family: var(--font-body); font-size: 14px;
  &:hover { background: var(--control-hover); }
}
.map-picker__canvas { width: 100%; height: 200px; border-radius: 8px; border: 1px solid var(--gilt); }
.map-picker__hint { margin: 0; font-size: 12px; color: var(--ink-soft); }
.map-picker__manual-row { display: flex; gap: 12px; }
.map-picker__manual-field { display: flex; flex-direction: column; gap: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--gilt-deep); }
</style>
