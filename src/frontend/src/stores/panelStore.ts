import { defineStore } from 'pinia';

export interface PersonPanel {
  id: string;
  minimized: boolean;
}

export type RailMode = 'chips' | 'rectangles';

interface PanelState {
  personPanels: PersonPanel[];
  statsMinimized: boolean;
  railMode: RailMode;
  biggerViewId: string | null;
}

export const usePanelStore = defineStore('panels', {
  state: (): PanelState => ({
    personPanels: [],
    statsMinimized: true,
    railMode: 'chips',
    biggerViewId: null
  }),
  getters: {
    expandedId(state): string | null {
      return state.personPanels.find(p => !p.minimized)?.id ?? null;
    },
    isOpen(state) {
      return (id: string): boolean => state.personPanels.some(p => p.id === id);
    }
  },
  actions: {
    // Expand exactly one person, minimizing the rest. Adds the panel if new.
    openPerson(id: string): void {
      if (!this.isOpen(id)) {
        this.personPanels.push({ id, minimized: false });
      }
      this.expandPerson(id);
    },
    expandPerson(id: string): void {
      for (const panel of this.personPanels) {
        panel.minimized = panel.id !== id;
      }
      this.railMode = 'rectangles';
      // Close any popup that is for a DIFFERENT person so a stale popup is
      // never left open when the user switches who is expanded.
      if (this.biggerViewId !== null && this.biggerViewId !== id) {
        this.biggerViewId = null;
      }
    },
    minimizePerson(id: string): void {
      const panel = this.personPanels.find(p => p.id === id);
      if (panel) {
        panel.minimized = true;
      }
    },
    minimizeAllPersons(): void {
      for (const panel of this.personPanels) {
        panel.minimized = true;
      }
    },
    closePerson(id: string): void {
      this.personPanels = this.personPanels.filter(p => p.id !== id);
      if (this.biggerViewId === id) {
        this.biggerViewId = null;
      }
    },
    setStatsMinimized(value: boolean): void {
      this.statsMinimized = value;
    },
    // The ← arrow: show all panels as minimized rectangles.
    expandRail(): void {
      this.railMode = 'rectangles';
      this.minimizeAllPersons();
    },
    // The → arrow: collapse the rail back to chips (membership preserved).
    collapseRail(): void {
      this.railMode = 'chips';
    },
    // Bring the rail into rectangles with stats shown (stats chip tap / focus).
    expandStats(): void {
      this.railMode = 'rectangles';
      this.statsMinimized = false;
    },
    openBiggerView(id: string): void {
      this.biggerViewId = id;
    },
    closeBiggerView(): void {
      this.biggerViewId = null;
    },
    // Expand the person in the rail (making it the active panel) then pop it out
    // as the bigger-view popup. Use this for the undock (⤢) button on a bar.
    undock(id: string): void {
      this.expandPerson(id);   // make it the active/expanded person (clears any OTHER popup)
      this.biggerViewId = id;  // then show it as the popup
    }
  }
});
