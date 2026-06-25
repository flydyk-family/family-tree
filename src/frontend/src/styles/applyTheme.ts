import type { Theme } from '../stores/uiStore';

/** Browser-chrome colour per theme — blends the mobile address bar / PWA status
 *  bar with the top of the viewport (Film body/header `#1b1c1f`, Classic
 *  parchment-gradient top `#faf3df`). Mirrors the static default in index.html. */
const THEME_COLOR: Record<Theme, string> = {
  classic: '#faf3df',
  eighties: '#1b1c1f'
};

/** Reflects the active theme onto <html data-theme>. The classic theme removes
 *  the attribute entirely so the bare :root token defaults apply. Also keeps the
 *  <meta name="theme-color"> tag in sync so browser chrome matches the theme. */
export function applyThemeToRoot(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'classic') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  applyThemeColor(theme);
}

function applyThemeColor(theme: Theme): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR[theme];
}
