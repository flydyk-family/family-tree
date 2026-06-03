import type { Locale } from '../constants/locales';
import type { LocalizedText } from '../types/family';

// Fallback chain mirrors the backend LocalizedText.Resolve: requested → ru → en → any.
export function localize(text: LocalizedText | null | undefined, locale: Locale): string {
  if (!text) {
    return '';
  }
  const candidates = [text[locale], text.ru, text.en, text.be];
  return candidates.find(value => typeof value === 'string' && value.trim() !== '') ?? '';
}
