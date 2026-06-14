import { defineStore } from 'pinia';
import type { PersonDetail } from '../types/family';
import { fetchPerson } from '../api/familyApi';

interface SelectionState {
  selectedId: string | null;
  detail: PersonDetail | null;
  loading: boolean;
  error: string | null;
  cache: Record<string, PersonDetail>;
}

export const useSelectionStore = defineStore('selection', {
  state: (): SelectionState => ({
    selectedId: null,
    detail: null,
    loading: false,
    error: null,
    cache: {}
  }),
  actions: {
    async open(id: string): Promise<void> {
      if (this.selectedId === id && this.detail) {
        return;
      }
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
        const detail = await fetchPerson(id);
        this.cache[id] = detail;
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
    close(): void {
      this.selectedId = null;
      this.detail = null;
      this.error = null;
      this.loading = false;
    }
  }
});
