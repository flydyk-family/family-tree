import { defineStore } from 'pinia';
import type { PersonSummary, Union } from '../types/family';
import { fetchFamilyGraph } from '../api/familyApi';

interface FamilyState {
  people: PersonSummary[];
  unions: Union[];
  focusId: string | null;
  loading: boolean;
  error: string | null;
}

export const useFamilyStore = defineStore('family', {
  state: (): FamilyState => ({
    people: [],
    unions: [],
    focusId: null,
    loading: false,
    error: null
  }),
  getters: {
    defaultRootId(state): string | null {
      return state.people.find(person => person.isDefaultRoot)?.id
        ?? state.people[0]?.id
        ?? null;
    },
    personById(state) {
      const byId = new Map(state.people.map(person => [person.id, person]));
      return (id: string): PersonSummary | undefined => byId.get(id);
    }
  },
  actions: {
    async load(): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const graph = await fetchFamilyGraph();
        this.people = graph.people;
        this.unions = graph.unions;
        this.focusId = this.defaultRootId;
      } catch (cause) {
        this.error = cause instanceof Error ? cause.message : 'Failed to load family';
      } finally {
        this.loading = false;
      }
    },
    setFocus(id: string): void {
      this.focusId = id;
    }
  }
});
