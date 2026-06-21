// The single home for the Google Identity Services integration. Everything else
// (store, components, tests) depends on these functions, never on window.google,
// so the third-party global is mockable and contained.

const GIS_SRC = 'https://accounts.google.com/gsi/client';

export interface CredentialResponse {
  credential: string;
}

// All GIS module state lives here so the data model is visible in one place
// before any function references it.
let scriptPromise: Promise<void> | null = null;
let rejectScript: ((reason?: unknown) => void) | null = null;
let loadedHl: string | null = null;
let scriptEl: HTMLScriptElement | null = null;
// Guards initGis so the SignInControl mounts (desktop slot + mobile bar) don't
// each re-register the global credential callback (GIS keeps only the last one).
// Reset by teardownGis so a post-reload initGis re-registers the callback.
let gisInitialized = false;

// GIS bakes its UI language at script-load time via the `hl` query param; the
// per-button `locale` option is overridden by the signed-in Google account's
// session locale, so the script URL is the only authoritative lever. We therefore
// reload the client when the app language changes (see teardownGis).
function teardownGis(): void {
  // Reject any in-flight load: the detached <script> won't fire onload/onerror,
  // so an awaiting caller would otherwise hang forever (rapid locale switch
  // before the initial load resolves). The caller's catch handles the rejection.
  rejectScript?.(new Error('Google Identity Services reloaded for a new locale.'));
  rejectScript = null;
  scriptEl?.remove();
  scriptEl = null;
  scriptPromise = null;
  gisInitialized = false;
  // Drop the global so the re-injected script re-defines it for the new locale.
  delete (window as { google?: unknown }).google;
}

/**
 * Inject the GIS client script and resolve when it has loaded. Pass the app
 * locale so the button text is localized via `?hl=`. If the locale differs from
 * the one already loaded, the previous client is torn down and re-injected.
 */
export function loadGisScript(locale?: string): Promise<void> {
  const hl = locale ?? '';
  if (scriptPromise && loadedHl === hl) {
    return scriptPromise;
  }
  // A prior client exists (possibly for a different language, or carried over an
  // HMR reload) — tear it down so the fresh script picks up the new `?hl=`.
  if (scriptPromise || window.google?.accounts?.id) {
    teardownGis();
  }
  loadedHl = hl;
  scriptPromise = new Promise<void>((resolve, reject) => {
    rejectScript = reject;
    const script = document.createElement('script');
    script.src = hl ? `${GIS_SRC}?hl=${encodeURIComponent(hl)}` : GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      rejectScript = null;
      resolve();
    };
    script.onerror = () => {
      // Clear the cache so a later call retries instead of replaying this rejection
      // forever (a transient network/CSP blip would otherwise wedge sign-in).
      scriptPromise = null;
      rejectScript = null;
      loadedHl = null;
      scriptEl = null;
      reject(new Error('Failed to load Google Identity Services.'));
    };
    scriptEl = script;
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function initGis(clientId: string, callback: (response: CredentialResponse) => void): void {
  if (gisInitialized) {
    return;
  }
  window.google?.accounts.id.initialize({ client_id: clientId, callback });
  gisInitialized = true;
}

export interface RenderSignInButtonOptions {
  // `compact` renders the small circular Google "G" for tight slots (the mobile top
  // bar); otherwise the full labelled standard button used in the desktop slot.
  compact?: boolean;
  // GIS theme for the standard button, chosen per app theme by the caller
  // (filled_black on the dark Film band, outline on the parchment Classic band).
  theme: 'outline' | 'filled_blue' | 'filled_black';
  // App locale (ru/be/en) so the button label follows the language switcher.
  locale?: string;
}

// GIS draws into `el`; calling renderButton again on a populated element stacks a
// second button, so we clear first — re-renders happen on theme/locale/sign-out
// changes while the signed-out mount element persists.
//
// The compact icon always uses the filled-blue circle: it reads as a recognizable
// Google button on both the dark and parchment headers (the outline icon is a blank
// white square), and an icon-only control carries no per-theme aesthetic weight.
export function renderSignInButton(el: HTMLElement, options: RenderSignInButtonOptions): void {
  el.replaceChildren();
  const { compact, theme, locale } = options;
  window.google?.accounts.id.renderButton(
    el,
    compact
      // The icon button has no text, so `locale` is ignored by GIS — omit it.
      ? { type: 'icon', shape: 'circle', theme: 'filled_blue', size: 'large' }
      : { type: 'standard', theme, shape: 'rectangular', size: 'large', text: 'signin', locale }
  );
}

export function disableAutoSelect(): void {
  window.google?.accounts.id.disableAutoSelect();
}
