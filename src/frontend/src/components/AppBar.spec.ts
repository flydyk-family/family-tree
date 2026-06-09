import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

/**
 * Mount in desktop mode.
 * In jsdom matchMedia is undefined → useMediaQuery returns false → isMobile = false.
 * We explicitly unstub to ensure no previous mobile stub bleeds in.
 */
async function mountBar() {
  vi.unstubAllGlobals();
  const router = makeRouter();
  await router.push('/');
  await router.isReady();
  return mount(AppBar, { global: { plugins: [i18n, router] } });
}

/**
 * Mount in mobile mode.
 * Stubs matchMedia to always match so isMobile = true.
 */
async function mountMobileBar() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: true,
    media: q,
    addEventListener() {},
    removeEventListener() {}
  }));
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

afterEach(() => {
  vi.unstubAllGlobals();
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

  it('shows the menu and search buttons on mobile', async () => {
    const w = await mountMobileBar();
    expect(w.find('[data-test="nav-menu"]').exists()).toBe(true);
    expect(w.find('[data-test="nav-search"]').exists()).toBe(true);
  });

  it('opens the menu sheet with views, language and layout', async () => {
    const w = await mountMobileBar();
    await w.get('[data-test="nav-menu"]').trigger('click');
    const sheet = w.get('[data-test="nav-sheet"]');
    expect(sheet.findComponent({ name: 'TabNav' }).exists()).toBe(true);
    expect(sheet.findComponent({ name: 'LanguagePicker' }).exists()).toBe(true);
    expect(sheet.findComponent({ name: 'OrientationToggle' }).exists()).toBe(true);
  });

  it('reveals the search field inline when the search button is clicked', async () => {
    const w = await mountMobileBar();
    // Before clicking, the SearchField must NOT be mounted (desktop row absent on mobile)
    expect(w.findComponent({ name: 'SearchField' }).exists()).toBe(false);
    await w.get('[data-test="nav-search"]').trigger('click');
    // After clicking, the inline search row mounts a SearchField
    expect(w.findComponent({ name: 'SearchField' }).exists()).toBe(true);
  });

  it('tapping search while menu is open closes the menu and opens search in one tap', async () => {
    const w = await mountMobileBar();
    // Open the menu first
    await w.get('[data-test="nav-menu"]').trigger('click');
    expect(w.find('[data-test="nav-sheet"]').exists()).toBe(true);
    // Single tap on search should close menu AND open search
    await w.get('[data-test="nav-search"]').trigger('click');
    expect(w.find('[data-test="nav-sheet"]').exists()).toBe(false);
    expect(w.findComponent({ name: 'SearchField' }).exists()).toBe(true);
  });

  it('Esc keydown on the sheet closes the menu', async () => {
    const w = await mountMobileBar();
    // Open the menu
    await w.get('[data-test="nav-menu"]').trigger('click');
    expect(w.find('[data-test="nav-sheet"]').exists()).toBe(true);
    // Trigger Esc from within the sheet — it should bubble up to the wrapper handler
    await w.get('[data-test="nav-sheet"]').trigger('keydown', { key: 'Escape' });
    expect(w.find('[data-test="nav-sheet"]').exists()).toBe(false);
  });
});
