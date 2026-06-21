import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// loadGisScript keeps module-level cache state (the loaded promise + locale), so
// each test imports a fresh module instance to start from a clean slate.
async function freshModule() {
  vi.resetModules();
  return import('./googleIdentity');
}

function gisScripts(): HTMLScriptElement[] {
  return [...document.querySelectorAll('script')].filter((s) =>
    s.src.includes('gsi/client')
  ) as HTMLScriptElement[];
}

function fireLoad(script: HTMLScriptElement): void {
  script.onload?.(new Event('load'));
}

beforeEach(() => {
  document.head.innerHTML = '';
  delete (window as { google?: unknown }).google;
});

afterEach(() => {
  document.head.innerHTML = '';
  delete (window as { google?: unknown }).google;
});

describe('loadGisScript', () => {
  it('injects the GIS script with the locale as the hl query param', async () => {
    const { loadGisScript } = await freshModule();
    const p = loadGisScript('ru');
    const [script] = gisScripts();
    expect(script).toBeDefined();
    expect(script.src).toContain('accounts.google.com/gsi/client?hl=ru');
    fireLoad(script);
    await expect(p).resolves.toBeUndefined();
  });

  it('omits hl when no locale is given', async () => {
    const { loadGisScript } = await freshModule();
    const p = loadGisScript();
    const [script] = gisScripts();
    expect(script.src).toBe('https://accounts.google.com/gsi/client');
    fireLoad(script);
    await p;
  });

  it('reuses the existing script when the locale is unchanged', async () => {
    const { loadGisScript } = await freshModule();
    const p = loadGisScript('en');
    fireLoad(gisScripts()[0]);
    await p;
    await loadGisScript('en');
    expect(gisScripts()).toHaveLength(1);
  });

  it('tears down the client and re-injects with the new hl when the locale changes', async () => {
    const { loadGisScript } = await freshModule();
    const p1 = loadGisScript('en');
    fireLoad(gisScripts()[0]);
    await p1;
    // GIS defines this global after a real load; teardown must drop it so the
    // re-injected script re-defines it for the new locale.
    (window as { google?: unknown }).google = { accounts: { id: {} } };

    const p2 = loadGisScript('ru');
    expect((window as { google?: unknown }).google).toBeUndefined();
    const scripts = gisScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toContain('hl=ru');
    fireLoad(scripts[0]);
    await expect(p2).resolves.toBeUndefined();
  });

  it('clears its cache on load failure so a later call retries', async () => {
    const { loadGisScript } = await freshModule();
    const p = loadGisScript('en');
    gisScripts()[0].onerror?.(new Event('error'));
    await expect(p).rejects.toThrow(/Google Identity Services/);

    const p2 = loadGisScript('en');
    const scripts = gisScripts();
    const script2 = scripts[scripts.length - 1];
    expect(script2).toBeDefined();
    fireLoad(script2);
    await expect(p2).resolves.toBeUndefined();
  });
});

describe('renderSignInButton', () => {
  function withRenderButton() {
    const renderButton = vi.fn();
    (window as { google?: unknown }).google = { accounts: { id: { renderButton } } };
    return renderButton;
  }

  it('clears the mount and renders the standard button with the chosen theme/locale', async () => {
    const { renderSignInButton } = await freshModule();
    const renderButton = withRenderButton();
    const el = document.createElement('div');
    el.innerHTML = '<span>stale</span>';

    renderSignInButton(el, { compact: false, theme: 'filled_black', locale: 'en' });

    expect(el.innerHTML).toBe(''); // prior content cleared before re-render
    expect(renderButton).toHaveBeenCalledWith(
      el,
      expect.objectContaining({
        type: 'standard',
        theme: 'filled_black',
        shape: 'rectangular',
        text: 'signin',
        locale: 'en'
      })
    );
  });

  it('renders the compact icon as a filled_blue circle regardless of theme', async () => {
    const { renderSignInButton } = await freshModule();
    const renderButton = withRenderButton();
    const el = document.createElement('div');

    renderSignInButton(el, { compact: true, theme: 'outline', locale: 'ru' });

    expect(renderButton).toHaveBeenCalledWith(
      el,
      expect.objectContaining({
        type: 'icon',
        shape: 'circle',
        theme: 'filled_blue',
        locale: 'ru'
      })
    );
  });
});
