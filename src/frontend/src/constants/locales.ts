export const LOCALES = ['ru', 'be', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_STORAGE_KEY = 'familytree.locale';

export interface LocaleOption {
  code: Locale;
  nativeName: string;
  flagClass: string;
}

// Display order in the picker. flagClass uses flag-icons country codes:
// gb (United Kingdom) for English, ru for Russian, by (official Belarus) for Belarusian.
export const LOCALE_OPTIONS: LocaleOption[] = [
  { code: 'en', nativeName: 'English', flagClass: 'fi fi-gb' },
  { code: 'ru', nativeName: 'Русский', flagClass: 'fi fi-ru' },
  { code: 'be', nativeName: 'Беларуская', flagClass: 'fi fi-by' }
];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
