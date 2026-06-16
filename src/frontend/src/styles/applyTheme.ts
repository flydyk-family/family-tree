import type { Theme } from '../stores/uiStore';

/** Reflects the active theme onto <html data-theme>. The classic theme removes
 *  the attribute entirely so the bare :root token defaults apply. */
export function applyThemeToRoot(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'classic') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}
