import { defineStore } from 'pinia';
import type { PersonDetail } from '../types/family';
import { fetchPerson } from '../api/familyApi';
import { useFamilyStore } from './familyStore';

interface SelectionState {
  selectedId: string | null;
  detail: PersonDetail | null;
  loading: boolean;
  error: string | null;
  cache: Record<string, PersonDetail>;
  /** Bumped by `reset()` so an in-flight `open()` from a since-reset family is ignored. */
  generation: number;
}

export const useSelectionStore = defineStore('selection', {
  state: (): SelectionState => ({
    selectedId: null,
    detail: null,
    loading: false,
    error: null,
    cache: {},
    generation: 0
  }),
  actions: {
    async open(id: string): Promise<void> {
      if (this.selectedId === id && this.detail) {
        return;
      }
      const generation = this.generation;
      this.selectedId = id;
      this.error = null;

      const cached = this.cache[id];
      if (cached) {
        this.detail = cached;
        this.loading = false;
        return;
      }

      this.loading = true;
      this.detail = null;
      try {
        const detail = await fetchPerson(useFamilyStore().familyId, id);
        if (generation !== this.generation) {
          return;
        }
        this.cache[id] = detail;
        if (this.selectedId === id) {
          this.detail = detail;
        }
      } catch (cause) {
        if (generation !== this.generation) {
          return;
        }
        if (this.selectedId === id) {
          this.error = cause instanceof Error ? cause.message : 'Failed to load person';
        }
      } finally {
        if (generation === this.generation && this.selectedId === id) {
          this.loading = false;
        }
      }
    },
    close(): void {
      this.selectedId = null;
      this.detail = null;
      this.error = null;
      this.loading = false;
    },
    /** Clears the selection and its cache; an in-flight request for the old family is ignored. */
    reset(): void {
      this.generation++;
      this.selectedId = null;
      this.detail = null;
      this.loading = false;
      this.error = null;
      this.cache = {};
    },
    // Replace a cached person with an authoritative server copy (e.g. after a
    // biography save). Both the popup (reads `detail`) and the rail (reads
    // `cache[id]`) render from this store, so updating here reflects everywhere.
    applyDetail(detail: PersonDetail): void {
      this.cache[detail.id] = detail;
      if (this.selectedId === detail.id) {
        this.detail = detail;
      }
    }
  }
});
