import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { i18n } from '../i18n';
import type { FamilyGraph, PersonDetail } from '../types/family';

vi.mock('../api/familyApi', () => ({ fetchFamilyGraph: vi.fn(), fetchPerson: vi.fn() }));
import { fetchFamilyGraph, fetchPerson } from '../api/familyApi';
import TreeView from './TreeView.vue';
import { useUiStore } from '../stores/uiStore';
import { usePanelStore } from '../stores/panelStore';

const graph: FamilyGraph = {
  people: [
    { id: 'a', givenName: { ru: 'А', be: null, en: 'A' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'male', birthYear: 1850, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true },
    { id: 'b', givenName: { ru: 'Б', be: null, en: 'B' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'female', birthYear: 1880, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: 'a' }, marriedIntoFamily: false, isDefaultRoot: false }
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

  it('opens a person panel in the rail on deep link (not the bigger-view modal)', async () => {
    const router = makeRouter();
    router.push('/person/b');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });

    // Two flushes: first lets graph load + watchers fire; second resolves
    // the async fetchPerson triggered by the expandedId watcher.
    await flushPromises();
    await flushPromises();

    // Deep link → person is expanded in the rail, not in the popup modal
    expect(usePanelStore().isOpen('b')).toBe(true);
    expect(usePanelStore().expandedId).toBe('b');
    expect(fetchPerson).toHaveBeenCalledWith('b');
    // bigger-view modal is NOT shown unless explicitly triggered
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

  it('opens a person panel when the tree emits select', async () => {
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
});
