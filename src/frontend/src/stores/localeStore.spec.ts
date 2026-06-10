import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { LOCALE_STORAGE_KEY } from '../constants/locales';
import { i18n } from '../i18n';
import { useLocaleStore } from './localeStore';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  i18n.global.locale.value = 'ru';
  document.documentElement.lang = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('localeStore', () => {
  it('initializes from the persisted locale', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const store = useLocaleStore();
    expect(store.currentLocale).toBe('en');
  });

  it('defaults to ru when nothing is stored and the browser is unsupported', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    const store = useLocaleStore();
    expect(store.currentLocale).toBe('ru');
  });

  it('setLocale updates state, persists, sets <html lang>, and switches i18n', () => {
    const store = useLocaleStore();

    store.setLocale('be');

    expect(store.currentLocale).toBe('be');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('be');
    expect(document.documentElement.lang).toBe('be');
    expect(i18n.global.locale.value).toBe('be');
  });

  it('setLocale sets the localized document title', () => {
    const store = useLocaleStore();

    store.setLocale('ru');
    expect(document.title).toBe('Семейная летопись');

    store.setLocale('en');
    expect(document.title).toBe('Family Chronicle');

    store.setLocale('be');
    expect(document.title).toBe('Сямейны летапіс');
  });

  it('exposes the locale options in display order', () => {
    const store = useLocaleStore();
    expect(store.options.map(option => option.code)).toEqual(['en', 'ru', 'be']);
  });

  it('currentOption reflects the active locale', () => {
    const store = useLocaleStore();
    store.setLocale('en');
    expect(store.currentOption.nativeName).toBe('English');
  });

  it('initLocale applies the persisted locale to i18n and html lang', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const store = useLocaleStore();

    store.initLocale();

    expect(i18n.global.locale.value).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('initLocale applies the localized document title at startup', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    document.title = 'Семейная летопись';
    const store = useLocaleStore();

    store.initLocale();

    expect(document.title).toBe('Family Chronicle');
  });
});
