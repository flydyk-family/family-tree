<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
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
  /** Google place ID for the chosen locality; null for a dragged pin or typed
   *  coordinates that resolved to no known place. */
  placeId: string | null;
}

const props = defineProps<{ modelValue: PickedPlace }>();
const emit = defineEmits<{ 'update:modelValue': [value: PickedPlace] }>();
const { t } = useI18n({ useScope: 'global' });

const configured = isMapsConfigured();
const canvas = ref<HTMLDivElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const query = ref('');
const results = ref<PlaceResult[]>([]);
const searching = ref(false);
// Distinguishes "searched, found nothing" from "hasn't searched yet" — an empty results
// array alone renders identically to the initial state, leaving the editor unsure whether
// the search ran at all.
const searched = ref(false);
const searchFailed = ref(false);
const loadError = ref(false);
// The marker is anchored on the place's centre, which is exactly where the basemap
// draws the locality label — so the pin hides the very name being confirmed. Echo it
// in our own caption instead of fighting the basemap for that pixel.
const chosenName = ref('');

// Locality-scale fallback for results Google returns without a viewport.
const LOCALITY_ZOOM = 11;

let map: GoogleMapHandle | null = null;
let marker: GoogleMarkerHandle | null = null;
let dragendListener: MapsListenerHandle | null = null;
let mapClickListener: MapsListenerHandle | null = null;
// onBeforeUnmount can win the race against the awaited loadGoogleMaps(), in which
// case it has no handles to release yet. Guard the continuation so it doesn't then
// build an orphaned Map/Marker/listener that nothing is left to tear down.
let unmounted = false;

function emitCoords(
  lat: number | null,
  lng: number | null,
  names?: { ru: string; be: string; en: string },
  placeId?: string | null
): void {
  emit('update:modelValue', {
    lat,
    lng,
    place: names ?? props.modelValue.place,
    mapUrl: buildMapUrl(lat, lng),
    placeId: placeId ?? null
  });
}

// Every user action that sets a place — picking a result, dragging the pin, typing a
// coordinate — supersedes whatever resolution is still in flight. Without this, a slow
// localizedNames lookup from an earlier pick resolves last and emits its own now-stale
// coordinates, silently reverting the newer drag or typed value. Mirrors the
// searchGeneration guard on the debounced search.
let placeGeneration = 0;
function beginPlaceChange(): number {
  return ++placeGeneration;
}

async function fillNames(placeId: string, lat: number, lng: number, generation: number): Promise<void> {
  try {
    const names = await localizedNames(placeId);
    if (generation === placeGeneration) {
      emitCoords(lat, lng, names, placeId);
    }
  } catch {
    // Keep the resolved place ID even if the localized-name lookup failed — the
    // visitor link can still target the exact place.
    if (generation === placeGeneration) {
      emitCoords(lat, lng, undefined, placeId);
    }
  }
}

/** Point-chosen path — dragging the pin, or clicking the map. Reverse-geocode the
 *  coordinates to the settlement they sit in, then `fillNames` fills all three
 *  locales, same as picking a search result. Any failure still emits the bare
 *  coordinates. */
async function onDragEnd(lat: number, lng: number): Promise<void> {
  const generation = beginPlaceChange();
  try {
    const placeId = await reverseGeocode(lat, lng);
    if (generation !== placeGeneration) {
      return;
    }
    if (placeId) {
      await fillNames(placeId, lat, lng, generation);
    } else {
      emitCoords(lat, lng);
    }
  } catch {
    if (generation === placeGeneration) {
      emitCoords(lat, lng);
    }
  }
}

let debounce: ReturnType<typeof setTimeout> | null = null;
let searchGeneration = 0;
// Retires any in-flight search. Its `generation === searchGeneration` check will now fail, so
// a late resolution can't repopulate a list the user already cleared, dismissed, or picked
// from — and because that same check gates the `finally`, the spinner has to be cleared here.
function invalidateSearch(): void {
  searchGeneration++;
  searching.value = false;
  searchFailed.value = false;
  // Also retires the "a search has run" flag. Every caller has just emptied `results`, so
  // leaving it set drops the status block onto its empty-state branch — reporting "no places
  // found" the instant the editor successfully picks one.
  searched.value = false;
}

function onQueryInput(): void {
  if (debounce) {
    clearTimeout(debounce);
  }
  debounce = setTimeout(async () => {
    if (query.value.trim().length < 2) {
      invalidateSearch();
      results.value = [];
      return;
    }
    const generation = ++searchGeneration;
    searching.value = true;
    try {
      const found = await searchPlace(query.value.trim());
      if (generation === searchGeneration) {
        results.value = found;
        searched.value = true;
        searchFailed.value = false;
      }
    } catch {
      // A failed lookup is reported as a failure, never as "no places found" — the editor
      // has to be able to tell a broken proxy from a place that genuinely isn't there.
      if (generation === searchGeneration) {
        results.value = [];
        searched.value = true;
        searchFailed.value = true;
      }
    } finally {
      if (generation === searchGeneration) {
        searching.value = false;
      }
    }
  }, 350);
}

// Escape closes the suggestion list without clearing the query, so a mistaken search can
// be dismissed without abandoning what was typed. Also cancels any in-flight debounce, or
// the list would reappear a moment later.
function dismissResults(): void {
  if (debounce) {
    clearTimeout(debounce);
    debounce = null;
  }
  invalidateSearch();
  results.value = [];
}

function chooseResult(r: PlaceResult): void {
  invalidateSearch();
  results.value = [];
  query.value = r.description;
  chosenName.value = r.description;
  if (map && marker) {
    const pos = { lat: r.lat, lng: r.lng };
    marker.setPosition(pos);
    // Prefer Google's own framing for the place, so a city fills the map instead of
    // the view diving onto its centre point. Falls back to a fixed locality zoom
    // when the response carries no viewport.
    if (r.viewport) {
      map.fitBounds(r.viewport);
    } else {
      map.setCenter(pos);
      map.setZoom(LOCALITY_ZOOM);
    }
  }
  // Choosing destroys the button that had focus, which would otherwise drop keyboard users
  // to <body>. Return them to the search box, matching how ResidencesEditor refocuses after
  // remove/cancel/discard.
  void nextTick(() => { searchInputRef.value?.focus(); });
  void fillNames(r.placeId, r.lat, r.lng, beginPlaceChange());
}

onMounted(async () => {
  if (!configured || !canvas.value) {
    return;
  }
  try {
    const maps = await loadGoogleMaps();
    if (unmounted || !canvas.value) {
      return;
    }
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
    // Click anywhere on the map (a place label included) to move the pin there and
    // resolve the settlement at that point — same path as a pin drag.
    mapClickListener = map.addListener('click', (e) => {
      if (!marker || !e.latLng) {
        return;
      }
      if (e.placeId) {
        e.stop(); // suppress the SDK's default info window for a clicked label
      }
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      marker.setPosition({ lat, lng });
      void onDragEnd(lat, lng);
    });
  } catch {
    loadError.value = true;
  }
});

onBeforeUnmount(() => {
  unmounted = true;
  if (debounce) {
    clearTimeout(debounce);
  }
  if (dragendListener) {
    dragendListener.remove();
    dragendListener = null;
  }
  if (mapClickListener) {
    mapClickListener.remove();
    mapClickListener = null;
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

function syncMapToCoords(lat: number | null, lng: number | null): void {
  if (map && marker && lat != null && lng != null) {
    const pos = { lat, lng };
    map.setCenter(pos);
    marker.setPosition(pos);
  }
}

// Mirrors the server's own bounds (UpdatePersonProfileValidator). This is the keyless
// degradation path, so without it an out-of-range value is emitted, drawn on the map, and
// only rejected after a save round-trip. `min`/`max` on the inputs cover the spinners;
// this covers typed and pasted values, which the attributes alone do not block.
function inRange(v: number, limit: number): boolean {
  return Number.isFinite(v) && v >= -limit && v <= limit;
}

function onManualLat(e: Event): void {
  // Typing a coordinate is a place change too, so it has to retire any in-flight lookup —
  // otherwise a pick's slow localizedNames resolves afterwards and overwrites what was typed.
  beginPlaceChange();
  const v = parseFloat((e.target as HTMLInputElement).value);
  manualLat.value = inRange(v, 90) ? v : null;
  emitCoords(manualLat.value, manualLng.value);
  syncMapToCoords(manualLat.value, manualLng.value);
}
function onManualLng(e: Event): void {
  beginPlaceChange();
  const v = parseFloat((e.target as HTMLInputElement).value);
  manualLng.value = inRange(v, 180) ? v : null;
  emitCoords(manualLat.value, manualLng.value);
  syncMapToCoords(manualLat.value, manualLng.value);
}
</script>

<template>
  <div class="map-picker" data-test="map-picker">
    <template v-if="configured && !loadError">
      <div class="map-picker__search">
        <input
          ref="searchInputRef"
          v-model="query"
          type="text"
          class="map-picker__input"
          data-test="map-search"
          :placeholder="t('members.searchCity')"
          :aria-label="t('members.searchCity')"
          @input="onQueryInput"
          @keydown.esc="dismissResults"
        />
        <p v-if="searching" class="map-picker__status" data-test="map-searching" role="status">{{ t('members.searching') }}</p>
        <ul v-else-if="results.length" class="map-picker__results" data-test="map-results">
          <li v-for="r in results" :key="r.placeId">
            <button type="button" class="map-picker__result" @click="chooseResult(r)">{{ r.description }}</button>
          </li>
        </ul>
        <p v-else-if="searchFailed" class="map-picker__status map-picker__status--error" data-test="map-search-failed" role="alert">{{ t('members.searchFailed') }}</p>
        <p v-else-if="searched" class="map-picker__status" data-test="map-no-results" role="status">{{ t('members.noResults') }}</p>
      </div>
      <div ref="canvas" class="map-picker__canvas" data-test="map-canvas" aria-hidden="true"></div>
      <p v-if="chosenName" class="map-picker__chosen" data-test="map-chosen">{{ chosenName }}</p>
      <p class="map-picker__hint">{{ t('members.mapHint') }}</p>
    </template>
    <p v-else class="map-picker__hint">{{ t('members.mapManualHint') }}</p>

    <!-- Always available so a keyboard-only or screen-reader user can enter exact
         coordinates without depending on mouse pin-drag, even when the map is shown. -->
    <div class="map-picker__manual" data-test="map-manual">
      <div class="map-picker__manual-row">
        <label class="map-picker__manual-field">
          <span>{{ t('members.lat') }}</span>
          <input type="number" step="any" class="map-picker__input" data-test="manual-lat" min="-90" max="90" :value="manualLat ?? ''" @input="onManualLat" />
        </label>
        <label class="map-picker__manual-field">
          <span>{{ t('members.lng') }}</span>
          <input type="number" step="any" class="map-picker__input" data-test="manual-lng" min="-180" max="180" :value="manualLng ?? ''" @input="onManualLng" />
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
.map-picker__chosen { margin: 0; font-size: 13px; font-weight: 600; color: var(--ink); }
.map-picker__status { margin: 4px 0 0; font-size: 12px; color: var(--ink-soft); }
.map-picker__status--error { color: var(--umber); }
.map-picker__manual-row { display: flex; gap: 12px; }
.map-picker__manual-field { display: flex; flex-direction: column; gap: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--gilt-deep); }
</style>
