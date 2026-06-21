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
 * Mount in narrow-desktop mode: not mobile, but below the search-collapse width.
 * matchMedia matches the narrow-desktop query only.
 */
async function mountNarrowDesktopBar() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('1299.98px'),
    media: q,
    addEventListener() {},
    removeEventListener() {}
  }));
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
  vi.unstubAllEnvs();
});

describe('AppBar', () => {
  it('renders tabs, search and the settings menu on desktop', async () => {
    const wrapper = await mountBar();
    expect(wrapper.find('[data-test="tab-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="search-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="settings-menu"]').exists()).toBe(true);
  });

  it('hosts language, theme and orientation inside the settings popover', async () => {
    const wrapper = await mountBar();
    // Closed by default — controls are not in the DOM yet.
    expect(wrapper.find('[data-test="orientation-toggle"]').exists()).toBe(false);
    await wrapper.get('[data-test="settings-menu-toggle"]').trigger('click');
    expect(wrapper.find('[data-test="orientation-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="theme-toggle"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="settings-language-option"]')).toHaveLength(3);
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

  it('opens the menu sheet with views and the settings panel', async () => {
    const w = await mountMobileBar();
    await w.get('[data-test="nav-menu"]').trigger('click');
    const sheet = w.get('[data-test="nav-sheet"]');
    expect(sheet.findComponent({ name: 'TabNav' }).exists()).toBe(true);
    expect(sheet.findComponent({ name: 'SettingsPanel' }).exists()).toBe(true);
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

  it('renders the sign-in control on desktop', async () => {
    const wrapper = await mountBar();
    expect(wrapper.find('[data-test="sign-in-control-slot"]').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'SignInControl' }).exists()).toBe(true);
  });

  it('renders the account control in the mobile top bar (not the sheet) when GIS is configured', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
    const w = await mountMobileBar();
    // Account sits in the top bar, compact.
    const account = w.find('[data-test="mobile-account"]');
    expect(account.exists()).toBe(true);
    expect(account.findComponent({ name: 'SignInControl' }).exists()).toBe(true);
    expect(account.findComponent({ name: 'SignInControl' }).props('compact')).toBe(true);
    // And it is no longer inside the ☰ sheet.
    await w.get('[data-test="nav-menu"]').trigger('click');
    expect(w.get('[data-test="nav-sheet"]').findComponent({ name: 'SignInControl' }).exists()).toBe(false);
  });

  it('omits the mobile account control when GIS is not configured', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    const w = await mountMobileBar();
    expect(w.find('[data-test="mobile-account"]').exists()).toBe(false);
    expect(w.findComponent({ name: 'SignInControl' }).exists()).toBe(false);
  });

  it('collapses search to an icon on narrow desktop and reveals it on click', async () => {
    const w = await mountNarrowDesktopBar();
    // Not mobile: the desktop row (settings menu) is present.
    expect(w.find('[data-test="settings-menu"]').exists()).toBe(true);
    // Search starts collapsed — the field is not shown, the toggle is.
    expect(w.find('[data-test="search-input"]').exists()).toBe(false);
    const toggle = w.get('[data-test="desktop-search-toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    await toggle.trigger('click');
    expect(w.find('[data-test="search-input"]').exists()).toBe(true);
    expect(w.get('[data-test="desktop-search-toggle"]').attributes('aria-expanded')).toBe('true');
  });
});
