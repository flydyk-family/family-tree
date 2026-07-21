/** Google Maps JS loader + geocoding wrappers. The map imagery uses the JS library; place
 *  search and localized names use the Geocoding REST endpoint so we can request ru/be/en
 *  names per call. Key is public-by-nature and referrer-restricted; absent ⇒ not configured. */

export interface PlaceResult {
  lat: number;
  lng: number;
  description: string;
  placeId: string;
}

export interface LatLngLiteral { lat: number; lng: number }

/** A subscription handle returned by `addListener`, mirroring the SDK's `MapsEventListener`. */
export interface MapsListenerHandle {
  remove(): void;
}

/** Minimal structural types for the bits of the Maps SDK we use — avoids an ambient
 *  `google` global and keeps the rest of the app fully typed. */
export interface GoogleMarkerHandle {
  setPosition(pos: LatLngLiteral): void;
  getPosition(): { lat(): number; lng(): number };
  setMap(map: GoogleMapHandle | null): void;
  addListener(event: string, handler: () => void): MapsListenerHandle;
}
export interface GoogleMapHandle {
  setCenter(pos: LatLngLiteral): void;
  setZoom(zoom: number): void;
}
export interface MapsNamespace {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMapHandle;
  Marker: new (opts: Record<string, unknown>) => GoogleMarkerHandle;
}

export function mapsApiKey(): string {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
}

export function isMapsConfigured(): boolean {
  return mapsApiKey().length > 0;
}

let mapsPromise: Promise<MapsNamespace> | null = null;

function mapsGlobal(): MapsNamespace | undefined {
  return (window as unknown as { google?: { maps?: MapsNamespace } }).google?.maps;
}

/** Injects the Maps JS script once and resolves the `google.maps` namespace. */
export function loadGoogleMaps(): Promise<MapsNamespace> {
  if (!isMapsConfigured()) {
    return Promise.reject(new Error('Google Maps API key not configured'));
  }
  if (mapsPromise) {
    return mapsPromise;
  }
  mapsPromise = new Promise((resolve, reject) => {
    const existing = mapsGlobal();
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsApiKey())}`;
    script.async = true;
    script.onload = () => {
      const ns = mapsGlobal();
      if (ns) {
        resolve(ns);
      } else {
        mapsPromise = null;
        reject(new Error('Google Maps loaded but namespace missing'));
      }
    };
    script.onerror = () => { mapsPromise = null; reject(new Error('Failed to load Google Maps')); };
    document.head.appendChild(script);
  });
  return mapsPromise;
}

interface GeocodeResponse {
  status: string;
  results: Array<{
    place_id: string;
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
    address_components: Array<{ long_name: string; types: string[] }>;
  }>;
}

async function geocode(params: Record<string, string>): Promise<GeocodeResponse> {
  const qs = new URLSearchParams({ ...params, key: mapsApiKey() }).toString();
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`);
  if (!res.ok) {
    throw new Error(`Geocoding failed: ${res.status}`);
  }
  return (await res.json()) as GeocodeResponse;
}

/** Free-text city search → up to 5 candidates. */
export async function searchPlace(query: string): Promise<PlaceResult[]> {
  const data = await geocode({ address: query, language: 'en' });
  if (data.status !== 'OK') {
    return [];
  }
  return data.results.slice(0, 5).map(r => ({
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    description: r.formatted_address,
    placeId: r.place_id
  }));
}

/** Resolves the `placeId` of the top result at a coordinate pair (reverse geocoding),
 *  or `null` when nothing is found there. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const data = await geocode({ latlng: `${lat},${lng}`, language: 'en' });
  if (data.status !== 'OK') {
    return null;
  }
  return data.results[0]?.place_id ?? null;
}

/** The locality/administrative name of a place in each app locale. Falls back to the
 *  formatted address when no locality component is present. */
export async function localizedNames(placeId: string): Promise<{ ru: string; be: string; en: string }> {
  async function nameIn(language: string): Promise<string> {
    const data = await geocode({ place_id: placeId, language });
    const top = data.results[0];
    if (!top) {
      return '';
    }
    const locality = top.address_components.find(c => c.types.includes('locality'))
      ?? top.address_components.find(c => c.types.includes('administrative_area_level_2'));
    return locality?.long_name ?? top.formatted_address;
  }
  const [ru, be, en] = await Promise.all([nameIn('ru'), nameIn('be'), nameIn('en')]);
  return { ru, be, en };
}
