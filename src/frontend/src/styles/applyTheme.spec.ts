import { describe, it, expect, afterEach } from 'vitest';
import { applyThemeToRoot } from './applyTheme';

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

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
});
