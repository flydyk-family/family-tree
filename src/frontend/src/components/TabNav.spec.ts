import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import TabNav from './TabNav.vue';
import { i18n } from '../i18n';

const stub = { template: '<div />' };

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'tree', component: stub },
      { path: '/chronicle', name: 'chronicle', component: stub },
      { path: '/person/:slug', name: 'person', component: stub }
    ]
  });
}

async function mountNav(initial = '/') {
  const router = makeRouter();
  await router.push(initial);
  await router.isReady();
  const wrapper = mount(TabNav, { global: { plugins: [i18n, router] } });
  return { wrapper, router };
}

beforeEach(() => { setActivePinia(createPinia()); });

describe('TabNav', () => {
  it('renders four tabs with Tree active on the tree route', async () => {
    const { wrapper } = await mountNav('/');
    expect(wrapper.findAll('.tabnav__tab')).toHaveLength(4);
    expect(wrapper.get('[data-test="tab-tree"]').classes()).toContain('tabnav__tab--active');
    expect(wrapper.get('[data-test="tab-chronicle"]').classes()).not.toContain('tabnav__tab--active');
  });

  it('keeps Tree active on a person deep link', async () => {
    const { wrapper } = await mountNav('/person/p1');
    expect(wrapper.get('[data-test="tab-tree"]').classes()).toContain('tabnav__tab--active');
  });

  it('Members and Timeline are disabled placeholders', async () => {
    const { wrapper } = await mountNav('/');
    expect(wrapper.get('[data-test="tab-members"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-test="tab-timeline"]').attributes('disabled')).toBeDefined();
  });

  it('clicking Chronicle navigates to /chronicle and marks it active', async () => {
    const { wrapper, router } = await mountNav('/');
    await wrapper.get('[data-test="tab-chronicle"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('chronicle');
    expect(wrapper.get('[data-test="tab-chronicle"]').classes()).toContain('tabnav__tab--active');
    expect(wrapper.get('[data-test="tab-tree"]').classes()).not.toContain('tabnav__tab--active');
  });

  it('clicking a disabled tab does not navigate', async () => {
    const { wrapper, router } = await mountNav('/');
    await wrapper.get('[data-test="tab-members"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('tree');
  });
});
