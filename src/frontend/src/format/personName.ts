import type { Locale } from '../constants/locales';
import type { LocalizedText } from '../types/family';
import { localize } from '../i18n/localize';

/**
 * Localized "{given} {surname}", trimmed. Shared by the person detail/popup and
 * the panel rail so the name-assembly rule lives in one place.
 */
export function formatPersonName(
  givenName: LocalizedText | null | undefined,
  surname: LocalizedText | null | undefined,
  locale: Locale
): string {
  return `${localize(givenName, locale)} ${localize(surname, locale)}`.trim();
}
