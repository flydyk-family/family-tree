import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import AppBar from './AppBar.vue';
import { i18n } from '../i18n';

const stub = { template: '<div />' };

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'tree', component: stub },
      { path: '/chronicle', name: 'chronicle', component: stub },
      { path: '/person/:id', name: 'person', component: stub }
    ]
  });
}

async function mountBar() {
  const router = makeRouter();
  await router.push('/');
  await router.isReady();
  return mount(AppBar, { global: { plugins: [i18n, router] } });
}

// Alias used by mobile-header tests (async wrapper returning the same mount).
const mountAppBar = mountBar;

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  i18n.global.locale.value = 'en';
});

describe('AppBar', () => {
  it('renders tabs, search, language picker and orientation toggle', async () => {
    const wrapper = await mountBar();
    expect(wrapper.find('[data-test="tab-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="search-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="language-picker"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="orientation-toggle"]').exists()).toBe(true);
  });

  it('shows the brand title', async () => {
    const wrapper = await mountBar();
    expect(wrapper.find('[data-test="app-bar"]').text()).toContain('Family');
  });

  it('shows the menu and search buttons (mobile header markup is always present)', async () => {
    const w = await mountAppBar();
    expect(w.find('[data-test="nav-menu"]').exists()).toBe(true);
    expect(w.find('[data-test="nav-search"]').exists()).toBe(true);
  });

  it('opens the menu sheet with views, language and layout', async () => {
    const w = await mountAppBar();
    await w.get('[data-test="nav-menu"]').trigger('click');
    const sheet = w.get('[data-test="nav-sheet"]');
    expect(sheet.findComponent({ name: 'TabNav' }).exists()).toBe(true);
    expect(sheet.findComponent({ name: 'LanguagePicker' }).exists()).toBe(true);
    expect(sheet.findComponent({ name: 'OrientationToggle' }).exists()).toBe(true);
  });

  it('reveals the search field inline when the search button is clicked', async () => {
    const w = await mountAppBar();
    await w.get('[data-test="nav-search"]').trigger('click');
    expect(w.findComponent({ name: 'SearchField' }).exists()).toBe(true);
  });
});
