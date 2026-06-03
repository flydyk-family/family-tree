import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { i18n } from '../i18n';
import type { FamilyGraph, PersonDetail } from '../types/family';

vi.mock('../api/familyApi', () => ({ fetchFamilyGraph: vi.fn(), fetchPerson: vi.fn() }));
import { fetchFamilyGraph, fetchPerson } from '../api/familyApi';
import TreeView from './TreeView.vue';

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
  it('loads the graph and renders the oak and year axis', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });

    await flushPromises();

    expect(wrapper.find('.oak').exists()).toBe(true);
    expect(wrapper.find('.year-axis').exists()).toBe(true);
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

  it('opens the popup for the person in the route on a deep link', async () => {
    const router = makeRouter();
    router.push('/person/b');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });

    await flushPromises();

    expect(wrapper.find('[data-test="person-popup"]').exists()).toBe(true);
    expect(fetchPerson).toHaveBeenCalledWith('b');
  });
});
