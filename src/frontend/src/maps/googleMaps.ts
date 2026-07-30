/** Google Maps JS loader + geocoding wrappers. The map imagery uses the JS library, loaded
 *  in-browser with the referrer-restricted public key. Geocoding (search / reverse geocode /
 *  localized names) goes through our backend proxy (`/api/geocode/*`), which holds the
 *  server-side key — the Geocoding web service rejects referrer-restricted keys, so it can
 *  never be called directly from the browser. Absent browser key ⇒ SDK not configured. */

/** Google's recommended framing for a place, in degrees. Absent when the API omits it. */
export interface PlaceViewport {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface PlaceResult {
  lat: number;
  lng: number;
  description: string;
  placeId: string;
  viewport?: PlaceViewport | null;
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
  /** Frames a lat/lng box, choosing the zoom that fits it — the SDK accepts this
   *  south/west/north/east literal directly in place of a `LatLngBounds`. */
  fitBounds(bounds: PlaceViewport): void;
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
    // Bounds an otherwise-infinite hang if the network stalls before onload/onerror fire.
    const timeout = setTimeout(() => {
      mapsPromise = null;
      reject(new Error('Google Maps script load timed out'));
    }, 10000);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsApiKey())}`;
    script.async = true;
    script.onload = () => {
      clearTimeout(timeout);
      const ns = mapsGlobal();
      if (ns) {
        resolve(ns);
      } else {
        mapsPromise = null;
        reject(new Error('Google Maps loaded but namespace missing'));
      }
    };
    script.onerror = () => { clearTimeout(timeout); mapsPromise = null; reject(new Error('Failed to load Google Maps')); };
    document.head.appendChild(script);
  });
  return mapsPromise;
}

/** Free-text city search → up to 5 candidates, via our backend proxy. Returns `[]` on any
 *  failure (network error, non-OK response, session expired) rather than throwing. */
export async function searchPlace(query: string): Promise<PlaceResult[]> {
  try {
    const qs = new URLSearchParams({ q: query }).toString();
    const res = await fetch(`/api/geocode/search?${qs}`, { credentials: 'include' });
    if (!res.ok) {
      console.debug(`Geocode search failed: HTTP ${res.status}`);
      return [];
    }
    return (await res.json()) as PlaceResult[];
  } catch {
    return [];
  }
}

/** Resolves the `placeId` of the top result at a coordinate pair (reverse geocoding), via our
 *  backend proxy. Returns `null` when nothing is found there, or on any failure. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const qs = new URLSearchParams({ lat: String(lat), lng: String(lng) }).toString();
    const res = await fetch(`/api/geocode/reverse?${qs}`, { credentials: 'include' });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { placeId: string | null };
    return data.placeId;
  } catch {
    return null;
  }
}

/** The locality/administrative name of a place in each app locale, via our backend proxy. */
export async function localizedNames(placeId: string): Promise<{ ru: string; be: string; en: string }> {
  const qs = new URLSearchParams({ placeId }).toString();
  const res = await fetch(`/api/geocode/names?${qs}`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to load localized names: ${res.status}`);
  }
  return (await res.json()) as { ru: string; be: string; en: string };
}
