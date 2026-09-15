import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { i18n } from '../i18n';
import FamilySwitcher from './FamilySwitcher.vue';
import { useFamiliesStore } from '../stores/familiesStore';
import { useLocaleStore } from '../stores/localeStore';
import { buildRoutes } from '../router/familyRoutes';
import type { FamilySummary } from '../types/family';

const stub = { template: '<div />' };
const two = [
  { id: 'wisniewski', name: { ru: null, be: null, en: 'Wisniewski' }, isDefault: true },
  { id: 'kowalski', name: { ru: null, be: null, en: 'Kowalski' }, isDefault: false }
];

async function mountAt(path: string, families: FamilySummary[] = two) {
  const store = useFamiliesStore();
  store.families = families;
  store.loaded = true;
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes({ tree: stub, chronicle: stub, members: stub }) });
  await router.push(path);
  const wrapper = mount(FamilySwitcher, { global: { plugins: [router, i18n] } });
  return { wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
});

describe('FamilySwitcher', () => {
  it('lists every family and marks the one in the route', async () => {
    const { wrapper } = await mountAt('/f/kowalski');

    const options = wrapper.findAll('[data-test="family-switcher-option"]');
    expect(options).toHaveLength(2);
    expect(options.filter(o => o.attributes('aria-current') === 'true').map(o => o.text())).toEqual(['Kowalski']);
  });

  it('marks the default family on the unprefixed routes', async () => {
    const { wrapper } = await mountAt('/');

    const checked = wrapper.findAll('[data-test="family-switcher-option"]').filter(o => o.attributes('aria-current') === 'true');
    expect(checked.map(o => o.text())).toEqual(['Wisniewski']);
  });

  it('labels a family by its id when it has no localized name', async () => {
    const unnamed = [two[0], { id: 'lesnicki', name: { ru: null, be: null, en: null }, isDefault: false }];
    const { wrapper } = await mountAt('/', unnamed);

    expect(wrapper.findAll('[data-test="family-switcher-option"]').map(o => o.text())).toEqual(['Wisniewski', 'lesnicki']);
  });

  it('is hidden with a single family', async () => {
    const { wrapper } = await mountAt('/', [two[0]]);

    expect(wrapper.find('[data-test="family-switcher"]').exists()).toBe(false);
  });

  it('switches to another family on its prefixed tree', async () => {
    const { wrapper, router } = await mountAt('/');

    await wrapper.findAll('[data-test="family-switcher-option"]')[1].trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/f/kowalski');
  });

  it('switches back to the default family on the unprefixed tree', async () => {
    const { wrapper, router } = await mountAt('/f/kowalski');

    await wrapper.findAll('[data-test="family-switcher-option"]')[0].trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/');
  });

  it.each([
    ['/chronicle', '/f/kowalski/chronicle'],
    ['/members/anna-1900-p-7', '/f/kowalski/members'],
    ['/person/anna-1900-p-7', '/f/kowalski']
  ])('switching from %s keeps the view where it carries across (%s)', async (from, to) => {
    const { wrapper, router } = await mountAt(from);

    await wrapper.findAll('[data-test="family-switcher-option"]')[1].trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe(to);
  });

  it('clicking the already-active family does not navigate', async () => {
    const { wrapper, router } = await mountAt('/person/anna-1900-p-7');

    await wrapper.findAll('[data-test="family-switcher-option"]')[0].trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/person/anna-1900-p-7');
  });

  it('labels the list via aria-labelledby pointing at the visible label', async () => {
    const { wrapper } = await mountAt('/');

    const label = wrapper.get('.family-switcher__label');
    const list = wrapper.get('.family-switcher__list');
    expect(label.attributes('id')).toBeTruthy();
    expect(list.attributes('aria-labelledby')).toBe(label.attributes('id'));
  });
});
