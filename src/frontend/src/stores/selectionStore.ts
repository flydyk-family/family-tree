import { defineStore } from 'pinia';
import type { PersonDetail } from '../types/family';
import { fetchPerson } from '../api/familyApi';

export type PopupMode = 'normal' | 'expanded';

interface SelectionState {
  selectedId: string | null;
  detail: PersonDetail | null;
  mode: PopupMode;
  loading: boolean;
  error: string | null;
  // Per-session cache of fetched person details, keyed by id. The seed data is
  // read-only, so a once-fetched detail never goes stale — re-opening any
  // previously-viewed person (e.g. maximizing a docked panel) serves from here
  // instead of hitting /api/people/:id again. Survives close(); not invalidated.
  cache: Record<string, PersonDetail>;
}

export const useSelectionStore = defineStore('selection', {
  state: (): SelectionState => ({
    selectedId: null,
    detail: null,
    mode: 'normal',
    loading: false,
    error: null,
    cache: {}
  }),
  actions: {
    async open(id: string): Promise<void> {
      // Already showing this person's detail — keep it (and the current mode).
      if (this.selectedId === id && this.detail) {
        return;
      }
      this.selectedId = id;
      this.mode = 'normal';
      this.error = null;

      // Cache hit — show the detail immediately, no fetch, no loading flash.
      const cached = this.cache[id];
      if (cached) {
        this.detail = cached;
        this.loading = false;
        return;
      }

      this.loading = true;
      this.detail = null;
      try {
        const detail = await fetchPerson(id);
        this.cache[id] = detail;
        // Guard against a race: a newer open() may have superseded this one.
        if (this.selectedId === id) {
          this.detail = detail;
        }
      } catch (cause) {
        if (this.selectedId === id) {
          this.error = cause instanceof Error ? cause.message : 'Failed to load person';
        }
      } finally {
        if (this.selectedId === id) {
          this.loading = false;
        }
      }
    },
    expand(): void {
      this.mode = 'expanded';
    },
    collapse(): void {
      this.mode = 'normal';
    },
    close(): void {
      this.selectedId = null;
      this.detail = null;
      this.mode = 'normal';
      this.error = null;
      this.loading = false;
    }
  }
});
