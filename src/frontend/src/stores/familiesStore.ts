import { defineStore } from 'pinia';
import type { FamilySummary } from '../types/family';
import { fetchFamilies } from '../api/familiesApi';

interface FamiliesState {
  families: FamilySummary[];
  loaded: boolean;
}

/** The registry of family trees. The *active* family is never stored here: it is derived from the
 *  route (see router/familyRoutes.ts), so deep links, Back and link buttons can't desynchronise it. */
export const useFamiliesStore = defineStore('families', {
  state: (): FamiliesState => ({ families: [], loaded: false }),
  getters: {
    defaultFamilyId(state): string | null {
      return state.families.find(family => family.isDefault)?.id ?? null;
    },
    hasMultiple(state): boolean {
      return state.families.length > 1;
    },
    /** A registered family by id. Used by the member-card links to other trees (multi-family PR 4). */
    familyById(state) {
      return (id: string): FamilySummary | undefined => state.families.find(family => family.id === id);
    },
    /** Whether an id is in the registry; the member-card links (PR 4) only offer registered families. */
    isKnown(state) {
      return (id: string): boolean => state.families.some(family => family.id === id);
    },
    /** The route family for an id: null (unprefixed routes) for the default family. */
    routeFamily(): (id: string) => string | null {
      return (id: string) => (id === this.defaultFamilyId ? null : id);
    }
  },
  actions: {
    /** Loads once per session; a failure leaves an empty registry, i.e. a single-family app. */
    async load(): Promise<void> {
      if (this.loaded) {
        return;
      }
      try {
        this.families = await fetchFamilies();
      } catch {
        this.families = [];
      }
      this.loaded = true;
    }
  }
});
