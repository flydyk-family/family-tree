import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LOCALE_STORAGE_KEY } from '../constants/locales';
import { loadStoredLocale, storeLocale, detectInitialLocale } from './localeDetection';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('localeDetection', () => {
  it('loadStoredLocale returns a valid stored locale', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    expect(loadStoredLocale()).toBe('en');
  });

  it('loadStoredLocale returns null for an unsupported value', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'xx');
    expect(loadStoredLocale()).toBeNull();
  });

  it('storeLocale round-trips through localStorage', () => {
    storeLocale('be');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('be');
  });

  it('detectInitialLocale prefers the stored locale', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    expect(detectInitialLocale()).toBe('en');
  });

  it('detectInitialLocale uses navigator.language when nothing is stored', () => {
    vi.stubGlobal('navigator', { language: 'be-BY' });
    expect(detectInitialLocale()).toBe('be');
  });

  it('detectInitialLocale defaults to ru for an unsupported browser language', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    expect(detectInitialLocale()).toBe('ru');
  });

  it('detectInitialLocale defaults to ru when navigator has no language', () => {
    vi.stubGlobal('navigator', {});
    expect(detectInitialLocale()).toBe('ru');
  });
});
