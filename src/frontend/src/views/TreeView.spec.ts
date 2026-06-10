import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { i18n } from '../i18n';
import type { FamilyGraph, PersonDetail } from '../types/family';

vi.mock('../api/familyApi', () => ({ fetchFamilyGraph: vi.fn(), fetchPerson: vi.fn() }));
import { fetchFamilyGraph, fetchPerson } from '../api/familyApi';
import TreeView from './TreeView.vue';
import OakTree from '../components/OakTree.vue';
import { useUiStore } from '../stores/uiStore';
import { usePanelStore } from '../stores/panelStore';
import { useFamilyStore } from '../stores/familyStore';
import { useLocaleStore } from '../stores/localeStore';

const graph: FamilyGraph = {
  people: [
    { id: 'a', givenName: { ru: 'А', be: null, en: 'A' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'male', birthYear: 1850, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true },
    { id: 'b', givenName: { ru: 'Б', be: null, en: 'B' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'female', birthYear: 1880, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: 'a' }, marriedIntoFamily: false, isDefaultRoot: false },
    { id: 'c', givenName: { ru: 'Ц', be: null, en: 'C' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'male', birthYear: 1900, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false }
  ],
  unions: [{ id: 'u', partnerIds: ['a'], marriageYear: null, childIds: ['b'] }]
};

const detailB = {
  id: 'b',
  givenName: { ru: 'Б', be: null, en: 'B' },
  surname: { ru: 'Икс', be: null, en: 'X' },
  maidenName: null, sex: 'female',
  birth: { year: 1880, month: null, day: null, approx: false, place: null },
  death: null, vocation: 'other', summary: null, biography: null,
  portrait: null, gallery: [], links: [], residences: [],
  parents: { motherId: null, fatherId: 'a' }, marriedIntoFamily: false, isDefaultRoot: false
} as PersonDetail;

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'tree', component: TreeView },
      { path: '/person/:id', name: 'person', component: TreeView }
    ]
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchFamilyGraph).mockReset().mockResolvedValue(graph);
  vi.mocked(fetchPerson).mockReset().mockResolvedValue(detailB);
  // Default: desktop mode (matchMedia not available → useMediaQuery returns false).
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TreeView', () => {
  it('loads the graph and renders the oak and time rail', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });

    await flushPromises();

    expect(wrapper.find('.oak').exists()).toBe(true);
    expect(wrapper.find('[data-test="time-rail"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="node"]')).toHaveLength(2);
    expect(wrapper.find('[data-test="person-popup"]').exists()).toBe(false);
  });

  it('navigates to /person/:id when a node is selected', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();

    await wrapper.findAll('[data-test="node"]')[1].trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('person');
    expect(router.currentRoute.value.params.id).toBe('b');
  });

  it('opens a person panel on deep link; on desktop popup is NOT opened by deep-link alone', async () => {
    const router = makeRouter();
    router.push('/person/b');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });

    // Two flushes: first lets graph load + watchers fire; second resolves
    // the async fetchPerson triggered by the expandedId watcher.
    await flushPromises();
    await flushPromises();

    // Deep link → person is expanded in the rail
    expect(usePanelStore().isOpen('b')).toBe(true);
    expect(usePanelStore().expandedId).toBe('b');
    expect(fetchPerson).toHaveBeenCalledWith('b');
    // Deep link alone does NOT open the popup — only tree clicks do.
    expect(usePanelStore().biggerViewId).toBeNull();
    expect(wrapper.find('[data-test="person-popup"]').exists()).toBe(false);
  });

  it('renders the TimeRail and flips the canvas orientation with the store', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();

    const ui = useUiStore();
    expect(wrapper.find('[data-test="time-rail"]').exists()).toBe(true);
    expect(wrapper.find('.tree-view__canvas--vertical').exists()).toBe(true);
    ui.setOrientation('horizontal');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.tree-view__canvas--horizontal').exists()).toBe(true);
  });

  it('renders the PanelRail instead of a bare stats panel', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();
    expect(wrapper.find('[data-test="panel-rail"]').exists()).toBe(true);
  });

  it('opens a person panel when the tree emits select; on desktop also opens popup', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();

    // Simulate OakTree emitting select (click on node 'b')
    await wrapper.findAll('[data-test="node"]')[1].trigger('click');
    await flushPromises();

    expect(usePanelStore().isOpen('b')).toBe(true);
    expect(usePanelStore().expandedId).toBe('b');
    // Desktop: popup also opens immediately on selection
    expect(usePanelStore().biggerViewId).toBe('b');
  });

  it('shows the bigger-view modal only when biggerViewId is set', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();

    expect(wrapper.find('[data-test="person-popup"]').exists()).toBe(false);

    usePanelStore().openPerson('b');
    usePanelStore().openBiggerView('b');
    await flushPromises();

    expect(wrapper.find('[data-test="person-popup"]').exists()).toBe(true);
  });

  it('Fix B — desktop tree click sets biggerViewId; direct expandPerson does NOT', async () => {
    // Desktop: matchMedia unavailable (jsdom default) → isMobile = false
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();

    // Direct expandPerson (simulating a bar maximize) must NOT open the popup.
    usePanelStore().openPerson('b');
    usePanelStore().expandPerson('b');
    await flushPromises();
    expect(usePanelStore().biggerViewId).toBeNull();

    // Tree click (node select) must open the popup on desktop.
    await wrapper.findAll('[data-test="node"]')[1].trigger('click');
    await flushPromises();
    expect(usePanelStore().biggerViewId).toBe('b');
  });

  it('Fix B — mobile: tree click does NOT set biggerViewId', async () => {
    // Mobile: stub matchMedia to always match
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: true, media: q, addEventListener() {}, removeEventListener() {}
    }));
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();

    await wrapper.findAll('[data-test="node"]')[1].trigger('click');
    await flushPromises();

    expect(usePanelStore().biggerViewId).toBeNull();
  });

  it('search re-roots the tree when the match is outside the rendered layout', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();
    useLocaleStore().setLocale('en');
    const ui = useUiStore();
    const family = useFamilyStore();
    expect(family.focusId).toBe('a');

    // Person c is the youngest 'X' and is NOT in the layout rooted at a.
    vi.useFakeTimers();
    ui.setSearch('X');
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await flushPromises();

    expect(family.focusId).toBe('c');
    expect(wrapper.findComponent(OakTree).props('centerRequest')).toMatchObject({ id: 'c' });
  });

  it('Enter cycles to the next match immediately, re-rooting only when needed', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();
    useLocaleStore().setLocale('en');
    const ui = useUiStore();
    const family = useFamilyStore();

    vi.useFakeTimers();
    ui.setSearch('X');
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await flushPromises();
    expect(family.focusId).toBe('c'); // youngest first

    ui.advanceSearchCursor(); // Enter: next youngest is b, off c's layout → re-root
    await flushPromises();
    expect(family.focusId).toBe('b');
    expect(wrapper.findComponent(OakTree).props('centerRequest')).toMatchObject({ id: 'b' });

    ui.advanceSearchCursor(); // a is b's father — already in b's layout → no re-root
    await flushPromises();
    expect(family.focusId).toBe('b');
    expect(wrapper.findComponent(OakTree).props('centerRequest')).toMatchObject({ id: 'a' });
  });

  it('Enter with a single match re-issues the request with a new seq', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();
    useLocaleStore().setLocale('en');
    const ui = useUiStore();

    vi.useFakeTimers();
    ui.setSearch('B'); // matches only person b
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await flushPromises();
    const first = wrapper.findComponent(OakTree).props('centerRequest') as { id: string; seq: number };
    expect(first).toMatchObject({ id: 'b' });

    ui.advanceSearchCursor();
    await flushPromises();
    const second = wrapper.findComponent(OakTree).props('centerRequest') as { id: string; seq: number };
    expect(second.id).toBe('b');
    expect(second.seq).toBeGreaterThan(first.seq);
  });

  it('clearing the search clears the center request without moving focus', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();
    useLocaleStore().setLocale('en');
    const ui = useUiStore();
    const family = useFamilyStore();

    vi.useFakeTimers();
    ui.setSearch('X');
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await flushPromises();
    expect(family.focusId).toBe('c');

    ui.setSearch('');
    await flushPromises();

    expect(wrapper.findComponent(OakTree).props('centerRequest')).toBeNull();
    expect(family.focusId).toBe('c'); // re-focus persists like any navigation
  });

  it('typing a new target during a pending debounce centers only the new target', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();
    useLocaleStore().setLocale('en');
    const ui = useUiStore();

    vi.useFakeTimers();
    ui.setSearch('C'); // would target c…
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(150); // …but the user keeps typing before the deadline
    ui.setSearch('B'); // retarget to b
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(150); // c's original deadline passes — nothing must fire
    expect(wrapper.findComponent(OakTree).props('centerRequest')).toBeNull();
    vi.advanceTimersByTime(150); // b's own 300 ms elapse
    vi.useRealTimers();
    await flushPromises();

    const request = wrapper.findComponent(OakTree).props('centerRequest') as { id: string } | null;
    expect(request).toMatchObject({ id: 'b' });
    expect(useFamilyStore().focusId).toBe('a'); // b is in a's layout — no re-root for b
  });
});
