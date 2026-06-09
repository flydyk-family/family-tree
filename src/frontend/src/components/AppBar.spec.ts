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
});
