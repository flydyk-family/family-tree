import type { Locale } from '../constants/locales';
import type { LocalizedText } from '../types/family';
import { localize } from '../i18n/localize';

/**
 * Localized "{given} {middle} {surname}", trimmed, with empty parts dropped (so a
 * person without a patronymic reads "{given} {surname}"). Shared by the person
 * detail/popup and the panel rail so the name-assembly rule lives in one place.
 */
export function formatPersonName(
  givenName: LocalizedText | null | undefined,
  middleName: LocalizedText | null | undefined,
  surname: LocalizedText | null | undefined,
  locale: Locale
): string {
  return [localize(givenName, locale), localize(middleName, locale), localize(surname, locale)]
    .filter(part => part.trim() !== '')
    .join(' ');
}
