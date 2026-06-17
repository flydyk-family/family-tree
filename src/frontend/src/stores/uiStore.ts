import { defineStore } from 'pinia';

export type Orientation = 'vertical' | 'horizontal';
export type TabId = 'chronicle' | 'tree' | 'members' | 'timeline';

export const ORIENTATION_STORAGE_KEY = 'familytree.orientation';

function isOrientation(value: string | null): value is Orientation {
  return value === 'vertical' || value === 'horizontal';
}

export type Theme = 'classic' | 'eighties';

export const THEME_STORAGE_KEY = 'familytree.theme';

function isTheme(value: string | null): value is Theme {
  return value === 'classic' || value === 'eighties';
}

interface UiState {
  orientation: Orientation;
  orientationExplicit: boolean;
  search: string;
  searchCursor: number;
  theme: Theme;
}

export const useUiStore = defineStore('ui', {
  state: (): UiState => ({
    orientation: 'vertical',
    orientationExplicit: false,
    search: '',
    searchCursor: 0,
    theme: 'classic'
  }),
  actions: {
    setOrientation(orientation: Orientation): void {
      this.orientation = orientation;
      this.orientationExplicit = true;
      try {
        localStorage.setItem(ORIENTATION_STORAGE_KEY, orientation);
      } catch {
        // storage unavailable (private mode / SSR) — non-fatal
      }
    },
    /** Sets orientation only when no explicit choice has been made (no-op otherwise).
     *  Does NOT persist to localStorage and does NOT set the explicit flag. */
    applyResponsiveOrientation(orientation: Orientation): void {
      if (!this.orientationExplicit) {
        this.orientation = orientation;
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
    setTheme(theme: Theme): void {
      this.theme = theme;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // storage unavailable (private mode / SSR) — non-fatal
      }
    },
    toggleTheme(): void {
      this.setTheme(this.theme === 'classic' ? 'eighties' : 'classic');
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
        this.orientationExplicit = true;
      }
      let storedTheme: string | null = null;
      try {
        storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      } catch {
        storedTheme = null;
      }
      if (isTheme(storedTheme)) {
        this.theme = storedTheme;
      }
    }
  }
});
