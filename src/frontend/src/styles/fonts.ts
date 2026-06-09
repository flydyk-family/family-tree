// Self-hosted web fonts (see DESIGN.md → Typography).
//
// These were previously pulled from the Google Fonts CDN via an @import in
// global.scss, but the production CSP (public/_headers) only allows styles and
// fonts from 'self' — so the CDN stylesheet (fonts.googleapis.com) and the font
// files (fonts.gstatic.com) were both blocked, silently dropping every face to
// Georgia/serif once deployed. @fontsource ships the identical font files, which
// Vite bundles to /assets (same origin) so they survive the CSP. Keep this list in
// sync with the weights/styles actually used in the SCSS.
//
// Latin engraved faces; Cyrillic (ru/be) falls through the --font-display /
// --font-accent stacks to Forum, which carries a Cyrillic subset.
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/600.css';

// Body / years / captions — includes Cyrillic; italics for years & subtitles.
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/600.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/500-italic.css';

// Inscriptional Roman face that covers Cyrillic — the ru/be display/accent fallback.
import '@fontsource/forum/400.css';

// Fraktur, decorative accent only (drop-caps / monograms) — Latin.
import '@fontsource/unifrakturmaguntia/400.css';
