import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { i18n } from '../i18n';
import { useLocaleStore } from '../stores/localeStore';
import type { FamilyGraph } from '../types/family';

vi.mock('../api/familyApi', () => ({ fetchFamilyGraph: vi.fn(), fetchPerson: vi.fn() }));
import { fetchFamilyGraph } from '../api/familyApi';
import ChronicleView from './ChronicleView.vue';

const stub = { template: '<div />' };

const graph: FamilyGraph = {
  people: [
    { id: 'a', givenName: { ru: 'А', be: null, en: 'Adam' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'male', birthYear: 1850, deathYear: 1916, vocation: 'other', portrait: 'a.jpg', parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true },
    { id: 'b', givenName: { ru: 'Б', be: null, en: 'Boris' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'female', birthYear: 1880, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: 'a' }, marriedIntoFamily: false, isDefaultRoot: false }
  ],
  unions: [{ id: 'u', partnerIds: ['a'], marriageYear: null, childIds: ['b'] }]
};

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'tree', component: stub },
      { path: '/chronicle', name: 'chronicle', component: ChronicleView },
      { path: '/person/:id', name: 'person', component: stub }
    ]
  });
}

async function mountView() {
  const router = makeRouter();
  await router.push('/chronicle');
  await router.isReady();
  const wrapper = mount(ChronicleView, { global: { plugins: [router, i18n] } });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  vi.mocked(fetchFamilyGraph).mockReset().mockResolvedValue(graph);
  useLocaleStore().setLocale('en');
});

describe('ChronicleView', () => {
  it('renders the chronicle heading and an intro carrying the earliest year', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find('[data-test="chronicle-view"]').exists()).toBe(true);
    expect(wrapper.find('.chronicle__heading').text()).toBe('The Family Chronicle');
    expect(wrapper.find('.chronicle__intro').text()).toContain('1850');
  });

  it('summarises the family with key statistics from the loaded graph', async () => {
    const { wrapper } = await mountView();
    expect(wrapper.get('[data-test="chronicle-stat-members"]').text()).toContain('2');
    expect(wrapper.get('[data-test="chronicle-stat-earliest"]').text()).toContain('1850');
    expect(wrapper.get('[data-test="chronicle-stat-withPortraits"]').text()).toContain('1');
    expect(wrapper.get('[data-test="chronicle-stat-living"]').text()).toContain('1');
    // generations are read off the laid-out oak: root + one child = 2 levels
    const gens = Number(wrapper.get('[data-test="chronicle-stat-generations"] .chronicle__stat-value').text());
    expect(gens).toBeGreaterThanOrEqual(2);
  });

  it('returns to the tree when the enter button is clicked', async () => {
    const { wrapper, router } = await mountView();
    await wrapper.get('[data-test="chronicle-enter"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('tree');
  });
});
