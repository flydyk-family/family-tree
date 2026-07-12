import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { i18n } from '../i18n';
import type { PersonDetail, PersonSummary } from '../types/family';

vi.mock('../api/familyApi', () => ({ fetchFamilyGraph: vi.fn(), fetchPerson: vi.fn() }));
import { fetchPerson } from '../api/familyApi';
import MembersView from './MembersView.vue';
import { useFamilyStore } from '../stores/familyStore';

function summary(id: string, given: string): PersonSummary {
  return {
    id, givenName: { ru: given, be: given, en: given }, surname: { ru: 'Тест', be: 'Тэст', en: 'Test' },
    maidenName: null, sex: 'unknown', birthYear: 1950, deathYear: null, vocation: 'unknown',
    portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false
  };
}

const detail = {
  id: 'p-1', givenName: { ru: 'Анна', be: 'Анна', en: 'Anna' }, surname: { ru: 'Тест', be: 'Тэст', en: 'Test' },
  maidenName: null, sex: 'unknown',
  birth: { year: 1950, month: null, day: null, approx: false, place: null },
  death: null, vocation: 'unknown', summary: null, biography: null,
  portrait: null, portraitVideo: null, gallery: [], links: [], residences: [],
  parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false
} as PersonDetail;

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/members/:slug?', name: 'members', component: MembersView },
      { path: '/person/:slug', name: 'person', component: { template: '<div />' } }
    ]
  });
}

// Seed the store BEFORE mounting so onMounted's "empty → load()" branch never
// runs (the graph fetch is not stubbed here — MemberDetail's fetchPerson is).
async function mountView(
  path = '/members',
  people: PersonSummary[] = [summary('p-1', 'Анна')]
): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  useFamilyStore().$patch({ people });
  const router = makeRouter();
  router.push(path);
  await router.isReady();
  const wrapper = mount(MembersView, { global: { plugins: [router, i18n] } });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchPerson).mockReset().mockResolvedValue(detail);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Narrow viewport: every media query matches, so useMediaQuery('(max-width: 720px)') is true.
function stubNarrow(): void {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: true, media: q, addEventListener() {}, removeEventListener() {}
  }));
}

describe('MembersView', () => {
  it('shows the loading status while the store is loading', async () => {
    const { wrapper } = await mountView();
    useFamilyStore().$patch({ loading: true });
    await flushPromises();
    expect(wrapper.find('.members__status').text()).toBeTruthy();
    expect(wrapper.find('.members__status--error').exists()).toBe(false);
  });

  it('shows the error status when the store has an error', async () => {
    const { wrapper } = await mountView();
    useFamilyStore().$patch({ loading: false, error: 'nope' });
    await flushPromises();
    expect(wrapper.find('.members__status--error').exists()).toBe(true);
  });

  it('renders the index and a pick hint when no person is selected', async () => {
    const { wrapper } = await mountView('/members');
    expect(wrapper.find('[data-test="members-index"]').exists()).toBe(true);
    expect(wrapper.find('.members__hint').exists()).toBe(true);
    expect(wrapper.find('[data-test="member-detail"]').exists()).toBe(false);
  });

  it('renders the detail pane when a person is selected via the route', async () => {
    const { wrapper } = await mountView('/members/anna-test-1950-p-1');
    expect(wrapper.find('[data-test="member-detail"]').exists()).toBe(true);
    expect(wrapper.find('.members__hint').exists()).toBe(false);
  });

  it('navigates to a friendly slug when the index emits select', async () => {
    const { wrapper, router } = await mountView('/members');
    const push = vi.spyOn(router, 'push');

    await wrapper.get('[data-test="member-row"]').trigger('click');

    expect(push).toHaveBeenCalledWith(expect.objectContaining({ name: 'members' }));
    const arg = push.mock.calls[0][0] as { params: { slug: string } };
    expect(arg.params.slug).toContain('p-1');
  });

  it('on a narrow viewport with no selection shows the roster full-screen (no back, no detail)', async () => {
    stubNarrow();
    const { wrapper } = await mountView('/members');
    expect(wrapper.get('[data-test="members-index"]').isVisible()).toBe(true);
    expect(wrapper.find('[data-test="member-detail"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="members-back"]').exists()).toBe(false);
    expect(wrapper.find('.members__hint').exists()).toBe(false);
  });

  it('on a narrow viewport with a selection hides the roster and shows the dossier with a back button', async () => {
    stubNarrow();
    const { wrapper } = await mountView('/members/anna-test-1950-p-1');
    // Roster stays mounted (search survives) but is hidden; the dossier is shown.
    expect(wrapper.get('[data-test="members-index"]').isVisible()).toBe(false);
    expect(wrapper.get('[data-test="member-detail"]').isVisible()).toBe(true);
    expect(wrapper.find('[data-test="members-back"]').exists()).toBe(true);
  });

  it('the narrow back button returns to the roster by clearing the slug', async () => {
    stubNarrow();
    const { wrapper, router } = await mountView('/members/anna-test-1950-p-1');
    const push = vi.spyOn(router, 'push');

    await wrapper.get('[data-test="members-back"]').trigger('click');

    expect(push).toHaveBeenCalledWith({ name: 'members' });
  });
});
