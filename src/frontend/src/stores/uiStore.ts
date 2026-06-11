import { defineStore } from 'pinia';

export type Orientation = 'vertical' | 'horizontal';
export type TabId = 'chronicle' | 'tree' | 'members' | 'timeline';

export const ORIENTATION_STORAGE_KEY = 'familytree.orientation';

function isOrientation(value: string | null): value is Orientation {
  return value === 'vertical' || value === 'horizontal';
}

interface UiState {
  orientation: Orientation;
  search: string;
  searchCursor: number;
}

export const useUiStore = defineStore('ui', {
  state: (): UiState => ({
    orientation: 'vertical',
    search: '',
    searchCursor: 0
  }),
  actions: {
    setOrientation(orientation: Orientation): void {
      this.orientation = orientation;
      try {
        localStorage.setItem(ORIENTATION_STORAGE_KEY, orientation);
      } catch {
        // storage unavailable (private mode / SSR) — non-fatal
      }
    },
    toggleOrientation(): void {
      this.setOrientation(this.orientation === 'vertical' ? 'horizontal' : 'vertical');
    },
    setSearch(query: string): void {
      // Unchanged query → no-op: Enter in a type=search input fires a native
      // `search` event that re-reports the value, and it must not reset the
      // cycling cursor the accompanying keydown just advanced.
      if (query === this.search) {
        return;
      }
      this.search = query;
      this.searchCursor = 0;
    },
    // Advances the cursor; wrap-around is applied by useSearchMatches via modulo.
    advanceSearchCursor(): void {
      this.searchCursor += 1;
    },
    init(): void {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(ORIENTATION_STORAGE_KEY);
      } catch {
        stored = null;
      }
      if (isOrientation(stored)) {
        this.orientation = stored;
      }
    }
  }
});
