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
}

export const useSelectionStore = defineStore('selection', {
  state: (): SelectionState => ({
    selectedId: null,
    detail: null,
    mode: 'normal',
    loading: false,
    error: null
  }),
  actions: {
    async open(id: string): Promise<void> {
      // Already showing this person's detail — keep it (and the current mode).
      if (this.selectedId === id && this.detail) {
        return;
      }
      this.selectedId = id;
      this.mode = 'normal';
      this.loading = true;
      this.error = null;
      this.detail = null;
      try {
        const detail = await fetchPerson(id);
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
