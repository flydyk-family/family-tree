import { describe, it, expect, afterEach } from 'vitest';
import { applyThemeToRoot } from './applyTheme';

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.remove();
});

const themeColor = () =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

describe('applyThemeToRoot', () => {
  it('sets data-theme to eighties', () => {
    applyThemeToRoot('eighties');
    expect(document.documentElement.dataset.theme).toBe('eighties');
  });

  it('removes the attribute for the classic theme (so :root defaults apply)', () => {
    applyThemeToRoot('eighties');
    applyThemeToRoot('classic');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('sets the browser theme-color to the Film graphite for eighties', () => {
    applyThemeToRoot('eighties');
    expect(themeColor()).toBe('#1b1c1f');
  });

  it('sets the browser theme-color to the Classic parchment for classic', () => {
    applyThemeToRoot('classic');
    expect(themeColor()).toBe('#faf3df');
  });

  it('creates the theme-color meta tag when none exists', () => {
    expect(document.querySelector('meta[name="theme-color"]')).toBeNull();
    applyThemeToRoot('eighties');
    expect(themeColor()).toBe('#1b1c1f');
  });

  it('updates the existing tag on toggle without creating a duplicate', () => {
    // The real browser always ships the tag in index.html; toggling must reuse it.
    const seed = document.createElement('meta');
    seed.name = 'theme-color';
    seed.content = '#1b1c1f';
    document.head.appendChild(seed);

    applyThemeToRoot('eighties');
    applyThemeToRoot('classic');

    expect(themeColor()).toBe('#faf3df');
    expect(document.querySelectorAll('meta[name="theme-color"]').length).toBe(1);
  });
});
