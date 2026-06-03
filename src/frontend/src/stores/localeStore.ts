import { defineStore } from 'pinia';
import { LOCALE_OPTIONS, type Locale, type LocaleOption } from '../constants/locales';
import { detectInitialLocale, storeLocale } from '../i18n/localeDetection';
import { i18n } from '../i18n';

interface LocaleState {
  currentLocale: Locale;
}

export const useLocaleStore = defineStore('locale', {
  state: (): LocaleState => ({
    currentLocale: detectInitialLocale()
  }),
  getters: {
    options(): LocaleOption[] {
      return LOCALE_OPTIONS;
    },
    currentOption(state): LocaleOption {
      return LOCALE_OPTIONS.find(option => option.code === state.currentLocale) ?? LOCALE_OPTIONS[0];
    }
  },
  actions: {
    setLocale(locale: Locale): void {
      this.currentLocale = locale;
      storeLocale(locale);
      i18n.global.locale.value = locale;
      if (typeof document !== 'undefined') {
        document.documentElement.lang = locale;
      }
    },
    // Apply the detected/persisted locale to i18n + <html lang> at app startup.
    initLocale(): void {
      this.setLocale(this.currentLocale);
    }
  }
});
