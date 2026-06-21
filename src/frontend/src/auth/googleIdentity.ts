// The single home for the Google Identity Services integration. Everything else
// (store, components, tests) depends on these functions, never on window.google,
// so the third-party global is mockable and contained.

const GIS_SRC = 'https://accounts.google.com/gsi/client';

export interface CredentialResponse {
  credential: string;
}

let scriptPromise: Promise<void> | null = null;

/** Inject the GIS client script once; resolve when it has loaded. */
export function loadGisScript(): Promise<void> {
  if (scriptPromise) {
    return scriptPromise;
  }
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Clear the cache so a later call retries instead of replaying this rejection
      // forever (a transient network/CSP blip would otherwise wedge sign-in).
      scriptPromise = null;
      reject(new Error('Failed to load Google Identity Services.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function initGis(clientId: string, callback: (response: CredentialResponse) => void): void {
  window.google?.accounts.id.initialize({ client_id: clientId, callback });
}

// `icon` renders the compact circular Google "G" (≈40px) for tight slots like the
// mobile top bar; `standard` is the full-width button used in the desktop slot.
export function renderSignInButton(el: HTMLElement, type: 'standard' | 'icon' = 'standard'): void {
  window.google?.accounts.id.renderButton(el, { type, theme: 'outline', size: 'medium' });
}

export function disableAutoSelect(): void {
  window.google?.accounts.id.disableAutoSelect();
}
