import { computed } from 'vue';
import { useFamilyStore } from '../stores/familyStore';
import { useUiStore } from '../stores/uiStore';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import type { Locale } from '../constants/locales';
import type { PersonSummary } from '../types/family';

// Shared search predicate: the query is a case-insensitive substring of the
// localized given name or surname (mirrors the tree highlight rule).
export function personMatchesQuery(person: PersonSummary, query: string, locale: Locale): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return false;
  }
  const given = localize(person.givenName, locale).toLowerCase();
  const surname = localize(person.surname, locale).toLowerCase();
  return given.includes(q) || surname.includes(q);
}

// Single source of truth for nav-bar search: who matches the query, in what
// order they are visited (youngest first; unknown birth years last), and which
// match the camera currently targets via the Enter-cycling cursor.
export function useSearchMatches() {
  const family = useFamilyStore();
  const ui = useUiStore();
  const locale = useLocaleStore();

  const matches = computed<PersonSummary[]>(() =>
    family.people
      .filter(person => personMatchesQuery(person, ui.search, locale.currentLocale))
      .sort((a, b) => (b.birthYear ?? -Infinity) - (a.birthYear ?? -Infinity))
  );
  const total = computed(() => matches.value.length);
  // 0-based index of the camera target; -1 when there are no matches. Positive
  // modulo keeps the index valid even if the cursor ever goes negative.
  const currentIndex = computed(() =>
    total.value === 0 ? -1 : ((ui.searchCursor % total.value) + total.value) % total.value
  );
  const current = computed<PersonSummary | null>(() =>
    currentIndex.value < 0 ? null : matches.value[currentIndex.value]
  );

  return { matches, total, currentIndex, current };
}
