import { defineStore } from 'pinia';
import type { LocalizedText, PersonSummary, Union } from '../types/family';
import { fetchFamilyGraph } from '../api/familyApi';
import { useSelectionStore } from './selectionStore';
import { usePanelStore } from './panelStore';

interface FamilyState {
  /** The family this store currently represents, or `null` for the default family. */
  familyId: string | null;
  people: PersonSummary[];
  unions: Union[];
  focusId: string | null;
  loading: boolean;
  error: string | null;
  /** The family key (`familyId ?? ''`) `ensureFamily` last committed to, for de-duping. */
  requestedKey: string | null;
  /** Bumped on every `load()` call; guards a stale response from a superseded switch. `ensureFamily`
   *  also reads `> 0` as "a family was shown before", so a bare `load()` must never run before the
   *  first `ensureFamily` (today only post-save refreshes call it). */
  requestToken: number;
}

export const useFamilyStore = defineStore('family', {
  state: (): FamilyState => ({
    familyId: null,
    people: [],
    unions: [],
    focusId: null,
    loading: false,
    error: null,
    requestedKey: null,
    requestToken: 0
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
    /** The single entry point for showing a family. No-op when it is already loaded or loading;
     *  otherwise drops the previous family's people, selection and person panels (ids are only
     *  unique within a family), then loads. The very first load resets nothing, so a deep-linked
     *  person panel survives. */
    async ensureFamily(familyId: string | null): Promise<void> {
      const key = familyId ?? '';
      if (this.requestedKey === key) {
        return;
      }
      // Any earlier request, even a failed one, may have left another family's state on screen.
      if (this.requestToken > 0) {
        this.reset();
        useSelectionStore().reset();
        usePanelStore().clearPersons();
      }
      this.requestedKey = key;
      await this.load(familyId);
    },
    async load(familyId?: string | null): Promise<void> {
      const targetFamilyId = familyId === undefined ? this.familyId : familyId;
      const token = ++this.requestToken;
      this.familyId = targetFamilyId;
      this.loading = true;
      this.error = null;
      try {
        const graph = await fetchFamilyGraph(targetFamilyId);
        if (token !== this.requestToken) {
          return;
        }
        this.people = graph.people;
        this.unions = graph.unions;
        this.focusId = this.defaultRootId;
      } catch (cause) {
        if (token !== this.requestToken) {
          return;
        }
        this.error = cause instanceof Error ? cause.message : 'Failed to load family';
        this.requestedKey = null;   // allow a retry of the same family
      } finally {
        if (token === this.requestToken) {
          this.loading = false;
        }
      }
    },
    reset(): void {
      this.people = [];
      this.unions = [];
      this.focusId = null;
      this.error = null;
    },
    setFocus(id: string): void {
      this.focusId = id;
    },
    /**
     * Patch one person's portrait media in place so the tree medallion updates immediately
     * after a photo edit — without refetching the graph or recomputing the layout (the layout
     * never reads `portrait`, so mutating it does not trigger a relayout).
     */
    applyPersonMedia(id: string, portrait: string | null, portraitThumb?: string | null): void {
      const person = this.people.find(p => p.id === id);
      if (person) {
        person.portrait = portrait;
        person.portraitThumb = portraitThumb ?? null;
      }
    },
    /**
     * Patch one person's editable scalar fields in place after a profile save, so the roster
     * and tree medallion reflect the edit without a full refetch. Mirrors the backend merge;
     * the caller still refetches the graph when a layout-affecting field (birth year) changed.
     */
    applyPersonProfile(id: string, patch: {
      givenName: LocalizedText;
      surname: LocalizedText;
      maidenName: LocalizedText | null;
      middleName: LocalizedText | null;
      sex: string;
      vocation: string;
      birthYear: number | null;
      deathYear: number | null;
    }): void {
      const person = this.people.find(p => p.id === id);
      if (person) {
        person.givenName = patch.givenName;
        person.surname = patch.surname;
        person.maidenName = patch.maidenName;
        person.middleName = patch.middleName;
        person.sex = patch.sex;
        person.vocation = patch.vocation;
        person.birthYear = patch.birthYear;
        person.deathYear = patch.deathYear;
      }
    }
  }
});
