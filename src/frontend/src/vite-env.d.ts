/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

interface ImportMetaEnv {
  /** Google OAuth client ID for GIS sign-in. Public by nature; build-time via Pages env. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Google Maps browser API key — **Maps JavaScript API only**. Geocoding is proxied
   *  server-side under its own key, so this one must never carry Geocoding scope. Public by
   *  nature, referrer-restricted; absent ⇒ the residence picker falls back to manual lat/lng. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
