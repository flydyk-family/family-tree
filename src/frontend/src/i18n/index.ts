import { createI18n } from 'vue-i18n';
import { DEFAULT_LOCALE } from '../constants/locales';
import { detectInitialLocale } from './localeDetection';
import { ru } from './messages/ru';
import { be } from './messages/be';
import { en } from './messages/en';

export const i18n = createI18n({
  legacy: false,
  locale: detectInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { ru, be, en }
});
