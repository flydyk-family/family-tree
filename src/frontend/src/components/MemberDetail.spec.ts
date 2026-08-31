import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { i18n } from '../i18n';
import type { PersonDetail, PersonSummary } from '../types/family';
import { personSlug } from '../utils/personSlug';

vi.mock('../api/familyApi', () => ({ fetchFamilyGraph: vi.fn(), fetchPerson: vi.fn() }));
// The editor fetches its override baseline on mount; stub it so that call resolves
// cleanly and doesn't leave unhandled network noise in these onSaved-focused tests.
vi.mock('../api/profileApi', async (orig) => ({
  ...(await orig<typeof import('../api/profileApi')>()),
  getProfile: vi.fn().mockResolvedValue({
    givenName: null, surname: null, maidenName: null, middleName: null, sex: null, birthYear: null, birthMonth: null, birthDay: null, deathYear: null, deathMonth: null, deathDay: null, vocation: null, residences: null
  })
}));
import { fetchPerson } from '../api/familyApi';
import MemberDetail from './MemberDetail.vue';
import MemberFieldsEditor from './MemberFieldsEditor.vue';
import BiographyEditor from './BiographyEditor.vue';
import ResidencesEditor from './ResidencesEditor.vue';
import { useAuthStore } from '../stores/authStore';
import { useFamilyStore } from '../stores/familyStore';
import { useSelectionStore } from '../stores/selectionStore';

function detail(overrides: Partial<PersonDetail> = {}): PersonDetail {
  return {
    id: 'p-1',
    givenName: { ru: 'Анна', be: 'Ганна', en: 'Anna' },
    surname: { ru: 'Ковальская', be: 'Кавальская', en: 'Kowalska' },
    maidenName: { ru: 'Новак', be: null, en: 'Nowak' }, middleName: null,
    sex: 'female',
    birth: { year: 1901, month: 5, day: 3, approx: false, place: { ru: 'Минск', be: null, en: 'Minsk' } },
    death: { year: 1980, month: null, day: null, approx: false, place: null },
    vocation: 'teacher', summary: null,
    biography: { ru: 'Био', be: null, en: 'A short life story.' },
    portrait: null, portraitVideo: null, gallery: [], links: [],
    residences: [{ place: { ru: 'Гродно', be: null, en: 'Hrodna' }, fromYear: 1920, toYear: 1950 }],
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false,
    ...overrides
  } as PersonDetail;
}

function summary(id: string): PersonSummary {
  return {
    id, givenName: { ru: 'Анна', be: 'Ганна', en: 'Anna' }, surname: { ru: 'Ковальская', be: 'Кавальская', en: 'Kowalska' },
    maidenName: null, middleName: null, sex: 'female', birthYear: 1901, deathYear: 1980, vocation: 'teacher',
    portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false
  };
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      // Mirrors production: the members route carries an optional friendly slug param.
      { path: '/members/:slug?', name: 'members', component: { template: '<div />' } },
      { path: '/person/:slug', name: 'person', component: { template: '<div />' } }
    ]
  });
}

async function mountDetail(
  personId = 'p-1',
  startPath = '/members'
): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const router = makeRouter();
  router.push(startPath);
  await router.isReady();
  const wrapper = mount(MemberDetail, {
    props: { personId },
    global: { plugins: [router, i18n] }
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchPerson).mockReset().mockResolvedValue(detail());
});

describe('MemberDetail', () => {
  it('loads and renders the dossier for the given person', async () => {
    const { wrapper } = await mountDetail('p-1');
    expect(fetchPerson).toHaveBeenCalledWith('p-1');
    expect(wrapper.get('.member-detail__name').text()).toContain('Anna');
    expect(wrapper.get('[data-test="member-fields"]').text()).toContain('Kowalska');
  });

  it('renders the middle name in the header (Given Middle Surname) and a dossier tablet', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail({ middleName: { ru: 'Богдановна', be: null, en: 'Bohdanovna' } }));
    const { wrapper } = await mountDetail();
    expect(wrapper.get('.member-detail__name').text()).toBe('Anna Bohdanovna Kowalska');
    expect(wrapper.get('[data-test="member-fields"]').text()).toContain('Bohdanovna');
  });

  it('shows the maiden-name tablet for a female person but hides it for a male person', async () => {
    const maidenLabel = i18n.global.t('members.field.maidenName');
    vi.mocked(fetchPerson).mockResolvedValue(detail({ sex: 'female', maidenName: { ru: 'Новак', be: null, en: 'Nowak' } }));
    const female = await mountDetail();
    expect(female.wrapper.get('[data-test="member-fields"]').text()).toContain(maidenLabel);
    expect(female.wrapper.get('[data-test="member-fields"]').text()).toContain('Nowak');

    vi.mocked(fetchPerson).mockResolvedValue(detail({ sex: 'male', maidenName: { ru: 'Новак', be: null, en: 'Nowak' } }));
    const male = await mountDetail();
    expect(male.wrapper.get('[data-test="member-fields"]').text()).not.toContain(maidenLabel);
    expect(male.wrapper.find('.member-detail__maiden').exists()).toBe(false);
  });

  it('renders birth and death places inline in parentheses', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail({
      birth: { year: 1901, month: null, day: null, approx: false, place: { ru: 'Минск', be: null, en: 'Minsk' } },
      death: { year: 1980, month: null, day: null, approx: false, place: { ru: 'Гродно', be: null, en: 'Hrodna' } }
    }));
    const { wrapper } = await mountDetail();
    const places = wrapper.findAll('.member-detail__value-place').map(p => p.text());
    expect(places).toContain('(Minsk)');
    expect(places).toContain('(Hrodna)');
  });

  it('shows the biography panel when a biography exists', async () => {
    const { wrapper } = await mountDetail();
    expect(wrapper.find('.member-detail__bio').exists()).toBe(true);
    expect(wrapper.get('.member-detail__bio-text').text()).toContain('short life story');
  });

  it('omits the biography panel when there is no biography', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail({ biography: null }));
    const { wrapper } = await mountDetail();
    expect(wrapper.find('.member-detail__bio').exists()).toBe(false);
  });

  it('renders residences', async () => {
    const { wrapper } = await mountDetail();
    expect(wrapper.get('.member-detail__residences').text()).toContain('Hrodna');
  });

  it('shows a read-only map link for a residence with a mapUrl', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail({
      residences: [{
        place: { ru: 'Гродно', be: null, en: 'Hrodna' }, fromYear: 1920, toYear: 1950,
        lat: 53.68, lng: 23.83, mapUrl: 'https://www.google.com/maps?q=53.68,23.83'
      }]
    }));
    const { wrapper } = await mountDetail();
    const link = wrapper.find('[data-test="residence-map-link"]');
    expect(link.exists()).toBe(true);
    // Coordinate-bearing row: link straight to the point, at locality zoom, not a bare pin.
    expect(link.attributes('href')).toBe(
      'https://www.google.com/maps/place/53.68,23.83/@53.68,23.83,13z'
    );
  });

  it('links a name-only residence to a Maps name search', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail({
      residences: [{
        place: { ru: 'Гродно', be: null, en: 'Hrodna' }, fromYear: 1920, toYear: 1950,
        lat: null, lng: null, mapUrl: 'https://maps.google.com/?q=Grodno'
      }]
    }));
    const { wrapper } = await mountDetail();
    expect(wrapper.find('[data-test="residence-map-link"]').attributes('href')).toMatch(
      /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=.+/
    );
  });

  it('omits the map link for a residence without a mapUrl', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail({
      residences: [{ place: { ru: 'Гродно', be: null, en: 'Hrodna' }, fromYear: 1920, toYear: 1950, lat: null, lng: null, mapUrl: null }]
    }));
    const { wrapper } = await mountDetail();
    expect(wrapper.find('[data-test="residence-map-link"]').exists()).toBe(false);
  });

  it('does not show the residences panel for a visitor with no residences', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail({ residences: [] }));
    const { wrapper } = await mountDetail();
    expect(wrapper.find('.member-detail__residences').exists()).toBe(false);
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(fetchPerson).mockRejectedValue(new Error('boom'));
    const { wrapper } = await mountDetail();
    expect(wrapper.find('.member-detail__status--error').exists()).toBe(true);
  });

  it('reloads when the personId prop changes', async () => {
    const { wrapper } = await mountDetail('p-1');
    vi.mocked(fetchPerson).mockResolvedValue(detail({ id: 'p-2' }));
    await wrapper.setProps({ personId: 'p-2' });
    await flushPromises();
    expect(fetchPerson).toHaveBeenLastCalledWith('p-2');
  });

  it('navigates to the person route when Find on tree is clicked', async () => {
    const { wrapper, router } = await mountDetail('p-1');
    useFamilyStore().$patch({ people: [summary('p-1')] });
    const push = vi.spyOn(router, 'push');
    await wrapper.get('[data-test="find-on-tree"]').trigger('click');
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ name: 'person' }));
  });
});

describe('MemberDetail editing', () => {
  it('shows the Edit button only when the user can edit', async () => {
    const { wrapper } = await mountDetail('p-1');
    expect(wrapper.find('[data-test="fields-edit"]').exists()).toBe(false);
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="fields-edit"]').exists()).toBe(true);
  });

  it('opens the editor and hides the read-only tablets when Edit is clicked', async () => {
    const { wrapper } = await mountDetail('p-1');
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-test="fields-edit"]').trigger('click');
    expect(wrapper.find('[data-test="member-fields-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="member-fields"]').exists()).toBe(false);
  });

  it('renders the Edit details button in the header, separated from Find on tree', async () => {
    const { wrapper } = await mountDetail('p-1');
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();
    const edit = wrapper.get('[data-test="fields-edit"]');
    // The edit button is a header action, not inside the centered name/heading block.
    expect(edit.element.closest('.member-detail__heading')).toBeNull();
    expect(wrapper.find('[data-test="find-on-tree"]').exists()).toBe(true);
  });

  it('opens the biography editor for an editor and closes it on save', async () => {
    const { wrapper } = await mountDetail('p-1');
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-test="bio-edit"]').trigger('click');
    const editor = wrapper.findComponent(BiographyEditor);
    expect(editor.exists()).toBe(true);
    await editor.vm.$emit('saved', detail({ biography: { ru: null, be: null, en: 'Edited life.' } }));
    await flushPromises();
    expect(wrapper.find('[data-test="bio-edit"]').exists()).toBe(true); // back to read mode
    expect(wrapper.get('.member-detail__bio-text').text()).toContain('Edited life.');
  });

  it('refreshes the tree selection cache after a biography save so the popup is not stale', async () => {
    const { wrapper } = await mountDetail('p-1');
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-test="bio-edit"]').trigger('click');
    const edited = detail({ biography: { ru: null, be: null, en: 'Edited life.' } });
    await wrapper.findComponent(BiographyEditor).vm.$emit('saved', edited);
    await flushPromises();
    // The tree popup/rail render from the selection store's per-id cache; editing on
    // the Members page must update it, otherwise the tree shows the pre-edit copy.
    expect(useSelectionStore().cache['p-1']).toStrictEqual(edited);
  });

  it('shows the biography panel with an add affordance when there is no biography yet', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail({ biography: null }));
    const { wrapper } = await mountDetail('p-1');
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.member-detail__bio').exists()).toBe(true);
    expect(wrapper.find('[data-test="bio-edit"]').exists()).toBe(true);
    expect(wrapper.find('.member-detail__bio-empty').exists()).toBe(true);
  });

  it('shows the residences Edit toggle only when canEdit', async () => {
    const { wrapper } = await mountDetail('p-1');
    expect(wrapper.find('[data-test="residences-edit"]').exists()).toBe(false);
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="residences-edit"]').exists()).toBe(true);
  });

  it('shows the residences panel for an editor even with no residences yet', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail({ residences: [] }));
    const { wrapper } = await mountDetail('p-1');
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.member-detail__residences').exists()).toBe(true);
    expect(wrapper.find('[data-test="residences-edit"]').exists()).toBe(true);
  });

  it('opens the residences editor and updates detail + selection cache on save, without reloading the store', async () => {
    const { wrapper } = await mountDetail('p-1');
    const store = useFamilyStore();
    const loadSpy = vi.spyOn(store, 'load').mockResolvedValue();
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-test="residences-edit"]').trigger('click');
    await flushPromises();
    const editor = wrapper.findComponent(ResidencesEditor);
    expect(editor.exists()).toBe(true);
    const updated = detail({
      residences: [{ place: { ru: 'Вильно', be: null, en: 'Vilnius' }, fromYear: 1930, toYear: 1940, lat: 54.68, lng: 25.28, mapUrl: 'https://www.google.com/maps?q=54.68,25.28' }]
    });
    await editor.vm.$emit('saved', updated);
    await flushPromises();
    expect(wrapper.find('[data-test="residences-edit"]').exists()).toBe(true); // back to read mode
    expect(wrapper.get('.member-detail__residences').text()).toContain('Vilnius');
    expect(useSelectionStore().cache['p-1']).toStrictEqual(updated);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('opening the residences editor closes the fields editor, and vice versa', async () => {
    const { wrapper } = await mountDetail('p-1');
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();

    // Both editors save through PUT /profile from a base snapshotted at mount, so
    // having both open at once risks one save silently reverting the other's — see
    // MemberDetail.vue's openFieldsEditor/openResidencesEditor.
    await wrapper.get('[data-test="fields-edit"]').trigger('click');
    expect(wrapper.find('[data-test="member-fields-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="residences-editor"]').exists()).toBe(false);

    // Neither trigger is reachable while an editor is open: swapping directly would unmount
    // the open editor via v-if and discard unsaved work without its confirm-on-discard.
    expect(wrapper.find('[data-test="residences-edit"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="fields-edit"]').exists()).toBe(false);

    // Cancel is the way out, and it carries the dirty check.
    await wrapper.findComponent(MemberFieldsEditor).vm.$emit('cancel');
    await flushPromises();
    expect(wrapper.find('[data-test="residences-edit"]').exists()).toBe(true);

    await wrapper.get('[data-test="residences-edit"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="residences-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="member-fields-editor"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="fields-edit"]').exists()).toBe(false);

    await wrapper.findComponent(ResidencesEditor).vm.$emit('cancel');
    await flushPromises();
    expect(wrapper.find('[data-test="fields-edit"]').exists()).toBe(true);
  });

  it('cannot swap editors past a pending confirm-on-discard, in either direction', async () => {
    // The regression this guards: both triggers used to check only their own flag, so with
    // the residences editor holding an unsaved row the "Edit details" pencil was still live
    // — one click silently destroyed the row, never reaching the discard confirmation.
    const { wrapper } = await mountDetail('p-1');
    useAuthStore().$patch({ canEdit: true });
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-test="residences-edit"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-test="add-residence"]').trigger('click');
    await wrapper.get('[data-test="place-en-0"]').setValue('Kraków');
    await flushPromises();

    expect(wrapper.find('[data-test="fields-edit"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="residences-editor"]').exists()).toBe(true);
    expect((wrapper.get('[data-test="place-en-0"]').element as HTMLInputElement).value).toBe('Kraków');

    // And the mirror case: unsaved field edits are equally protected.
    await wrapper.findComponent(ResidencesEditor).vm.$emit('cancel');
    await flushPromises();
    await wrapper.get('[data-test="fields-edit"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="residences-edit"]').exists()).toBe(false);
  });

  describe('onSaved', () => {
    // The starting URL uses the real slug for p-1 so the "does the slug differ"
    // comparison in onSaved has a genuine baseline to compare against.
    const startSlug = personSlug(summary('p-1'));

    async function openEditorAndSave(wrapper: ReturnType<typeof mount>, updated: PersonDetail): Promise<void> {
      useAuthStore().$patch({ canEdit: true });
      await wrapper.vm.$nextTick();
      await wrapper.get('[data-test="fields-edit"]').trigger('click');
      await flushPromises();
      await wrapper.findComponent(MemberFieldsEditor).vm.$emit('saved', updated);
      await flushPromises();
    }

    it('patches the store in place and skips reload/replace when birth year is unchanged', async () => {
      const { wrapper, router } = await mountDetail('p-1', `/members/${startSlug}`);
      const store = useFamilyStore();
      store.$patch({ people: [summary('p-1')] });
      const loadSpy = vi.spyOn(store, 'load').mockResolvedValue();
      const replaceSpy = vi.spyOn(router, 'replace');

      // Same birth year (1901) as the seed — only a non-slug field (vocation) changes.
      const updated = detail({ vocation: 'writer' });
      await openEditorAndSave(wrapper, updated);

      expect(store.personById('p-1')?.vocation).toBe('writer');
      expect(loadSpy).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
      // The tree popup/rail read the detail from the selection cache — keep it fresh.
      expect(useSelectionStore().cache['p-1']).toStrictEqual(updated);
    });

    it('reloads the graph and replaces the route when birth year changes', async () => {
      const { wrapper, router } = await mountDetail('p-1', `/members/${startSlug}`);
      const store = useFamilyStore();
      store.$patch({ people: [summary('p-1')] });
      const loadSpy = vi.spyOn(store, 'load').mockResolvedValue();
      const replaceSpy = vi.spyOn(router, 'replace');

      const updated = detail({ birth: { year: 1902, month: 5, day: 3, approx: false, place: null } });
      await openEditorAndSave(wrapper, updated);

      expect(loadSpy).toHaveBeenCalledTimes(1);

      // store.load() is mocked as a no-op here (it would normally refetch the whole
      // graph from the API), but onSaved's own store.applyPersonProfile(...) call —
      // which runs unconditionally, before the load-gated branch — already patches
      // the seeded summary's birthYear to 1902 in place. So store.personById('p-1')
      // reflects the new year regardless of the mocked load, and the "does the slug
      // differ" comparison in onSaved is exercised for real rather than by manually
      // re-seeding post-load state.
      const expectedSlug = personSlug({ ...summary('p-1'), birthYear: 1902 });
      expect(expectedSlug).not.toBe(startSlug);
      expect(replaceSpy).toHaveBeenCalledWith({ name: 'members', params: { slug: expectedSlug } });
    });
  });
});
