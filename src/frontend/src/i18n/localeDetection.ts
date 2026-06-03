import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale, type Locale } from '../constants/locales';

export function loadStoredLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return raw && isLocale(raw) ? raw : null;
  } catch {
    return null; // localStorage may be unavailable (private mode)
  }
}

export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore persistence failures (private mode / quota)
  }
}

export function detectInitialLocale(): Locale {
  const stored = loadStoredLocale();
  if (stored) {
    return stored;
  }
  const browser = typeof navigator !== 'undefined' && typeof navigator.language === 'string'
    ? navigator.language.slice(0, 2).toLowerCase()
    : '';
  return isLocale(browser) ? browser : DEFAULT_LOCALE;
}
