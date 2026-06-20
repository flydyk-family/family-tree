/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

interface ImportMetaEnv {
  /** Google OAuth client ID for GIS sign-in. Public by nature; build-time via Pages env. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
