import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import type { PersonSummary } from '../types/family';

export interface FamilyStats {
  members: ComputedRef<number>;
  earliestBirthYear: ComputedRef<number | null>;
  withPortraits: ComputedRef<number>;
  living: ComputedRef<number>;
}

// Shared roster arithmetic for every stats surface (dock panel, chronicle page),
// so they can never drift on what "earliest" or "living" means.
export function useFamilyStats(people: MaybeRefOrGetter<PersonSummary[]>): FamilyStats {
  const roster = computed(() => toValue(people));
  const birthYears = computed(() =>
    roster.value.map(p => p.birthYear).filter((y): y is number => y != null)
  );
  return {
    members: computed(() => roster.value.length),
    earliestBirthYear: computed(() =>
      birthYears.value.length ? Math.min(...birthYears.value) : null
    ),
    withPortraits: computed(() => roster.value.filter(p => p.portrait).length),
    // "living" = no recorded death year
    living: computed(() => roster.value.filter(p => p.deathYear == null).length)
  };
}
