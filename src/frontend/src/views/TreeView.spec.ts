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
    { id: 'p-0001', givenName: { ru: 'А', be: null, en: 'A' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'male', birthYear: 1850, deathYear: null, vocation: 'other', portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true },
    { id: 'p-0002', givenName: { ru: 'Б', be: null, en: 'B' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'female', birthYear: 1880, deathYear: null, vocation: 'other', portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: 'p-0001' }, marriedIntoFamily: false, isDefaultRoot: false },
    { id: 'p-0003', givenName: { ru: 'Ц', be: null, en: 'C' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'male', birthYear: 1900, deathYear: null, vocation: 'other', portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false }
  ],
  unions: [{ id: 'u', partnerIds: ['p-0001'], marriageYear: null, childIds: ['p-0002'] }]
};

const detailB = {
  id: 'p-0002',
  givenName: { ru: 'Б', be: null, en: 'B' },
  surname: { ru: 'Икс', be: null, en: 'X' },
  maidenName: null, sex: 'female',
  birth: { year: 1880, month: null, day: null, approx: false, place: null },
  death: null, vocation: 'other', summary: null, biography: null,
  portrait: null, portraitVideo: null, gallery: [], links: [], residences: [],
  parents: { motherId: null, fatherId: 'p-0001' }, marriedIntoFamily: false, isDefaultRoot: false
} as PersonDetail;

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'tree', component: TreeView },
      { path: '/person/:slug', name: 'person', component: TreeView }
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
    expect(router.currentRoute.value.params.slug).toBe('b-x-1880-p-0002');
  });

  it('opens a person panel on deep link; on desktop popup is NOT opened by deep-link alone', async () => {
    const router = makeRouter();
    router.push('/person/p-0002');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });

    // Two flushes: first lets graph load + watchers fire; second resolves
    // the async fetchPerson triggered by the expandedId watcher.
    await flushPromises();
    await flushPromises();

    // Deep link → person is expanded in the rail
    expect(usePanelStore().isOpen('p-0002')).toBe(true);
    expect(usePanelStore().expandedId).toBe('p-0002');
    expect(fetchPerson).toHaveBeenCalledWith('p-0002');
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

    // Simulate OakTree emitting select (click on node 'p-0002')
    await wrapper.findAll('[data-test="node"]')[1].trigger('click');
    await flushPromises();

    expect(usePanelStore().isOpen('p-0002')).toBe(true);
    expect(usePanelStore().expandedId).toBe('p-0002');
    // Desktop: popup also opens immediately on selection
    expect(usePanelStore().biggerViewId).toBe('p-0002');
  });

  it('shows the bigger-view modal only when biggerViewId is set', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();

    expect(wrapper.find('[data-test="person-popup"]').exists()).toBe(false);

    usePanelStore().openPerson('p-0002');
    usePanelStore().openBiggerView('p-0002');
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
    usePanelStore().openPerson('p-0002');
    usePanelStore().expandPerson('p-0002');
    await flushPromises();
    expect(usePanelStore().biggerViewId).toBeNull();

    // Tree click (node select) must open the popup on desktop.
    await wrapper.findAll('[data-test="node"]')[1].trigger('click');
    await flushPromises();
    expect(usePanelStore().biggerViewId).toBe('p-0002');
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

  it('search centers the camera on a match without re-rooting the tree', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();
    useLocaleStore().setLocale('en');
    const ui = useUiStore();
    const family = useFamilyStore();
    expect(family.focusId).toBe('p-0001');

    // Person p-0003 is the youngest 'X'. The whole tree is always rendered, so search
    // only glides the camera to the match — the focus/root must not change.
    vi.useFakeTimers();
    ui.setSearch('X');
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await flushPromises();

    expect(family.focusId).toBe('p-0001');
    expect(wrapper.findComponent(OakTree).props('centerRequest')).toMatchObject({ id: 'p-0003' });
  });

  it('Enter cycles the camera through matches without re-rooting', async () => {
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
    expect(family.focusId).toBe('p-0001'); // root never moves
    expect(wrapper.findComponent(OakTree).props('centerRequest')).toMatchObject({ id: 'p-0003' }); // youngest first

    ui.advanceSearchCursor(); // Enter: next youngest is p-0002 — just re-centers
    await flushPromises();
    expect(family.focusId).toBe('p-0001');
    expect(wrapper.findComponent(OakTree).props('centerRequest')).toMatchObject({ id: 'p-0002' });

    ui.advanceSearchCursor(); // then p-0001 — still only re-centers
    await flushPromises();
    expect(family.focusId).toBe('p-0001');
    expect(wrapper.findComponent(OakTree).props('centerRequest')).toMatchObject({ id: 'p-0001' });
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
    ui.setSearch('B'); // matches only person p-0002
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await flushPromises();
    const first = wrapper.findComponent(OakTree).props('centerRequest') as { id: string; seq: number };
    expect(first).toMatchObject({ id: 'p-0002' });

    ui.advanceSearchCursor();
    await flushPromises();
    const second = wrapper.findComponent(OakTree).props('centerRequest') as { id: string; seq: number };
    expect(second.id).toBe('p-0002');
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
    expect(family.focusId).toBe('p-0001'); // search never re-roots

    ui.setSearch('');
    await flushPromises();

    expect(wrapper.findComponent(OakTree).props('centerRequest')).toBeNull();
    expect(family.focusId).toBe('p-0001'); // focus/root unchanged throughout
  });

  it('passes morphProgress and branchOrientation props to OakTree', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();

    const ui = useUiStore();
    const oak = wrapper.findComponent(OakTree);
    expect(oak.exists()).toBe(true);
    // Idle state: morphProgress is 0 (no morph active), branchOrientation matches
    // the current orientation. Both props must be present on the wired OakTree.
    expect(oak.props()).toHaveProperty('morphProgress');
    expect(oak.props()).toHaveProperty('branchOrientation');
    expect(oak.props('morphProgress')).toBe(0);
    expect(oak.props('branchOrientation')).toBe(ui.orientation);
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
    ui.setSearch('B'); // retarget to p-0002
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(150); // c's original deadline passes — nothing must fire
    expect(wrapper.findComponent(OakTree).props('centerRequest')).toBeNull();
    vi.advanceTimersByTime(150); // b's own 300 ms elapse
    vi.useRealTimers();
    await flushPromises();

    const request = wrapper.findComponent(OakTree).props('centerRequest') as { id: string } | null;
    expect(request).toMatchObject({ id: 'p-0002' });
    expect(useFamilyStore().focusId).toBe('p-0001'); // p-0002 is in p-0001's layout — no re-root for p-0002
  });
});
