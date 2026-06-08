import { defineStore } from 'pinia';

export type Orientation = 'vertical' | 'horizontal';
export type TabId = 'chronicle' | 'tree' | 'members' | 'timeline';

export const ORIENTATION_STORAGE_KEY = 'familytree.orientation';

function isOrientation(value: string | null): value is Orientation {
  return value === 'vertical' || value === 'horizontal';
}

interface UiState {
  orientation: Orientation;
  activeTab: TabId;
  search: string;
}

export const useUiStore = defineStore('ui', {
  state: (): UiState => ({
    orientation: 'vertical',
    activeTab: 'tree',
    search: ''
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
    setActiveTab(tab: TabId): void {
      this.activeTab = tab;
    },
    setSearch(query: string): void {
      this.search = query;
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
