import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SettingsMenu from './SettingsMenu.vue';
import { i18n } from '../i18n';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  i18n.global.locale.value = 'en';
});

function mountMenu(attach = false) {
  return mount(SettingsMenu, {
    global: { plugins: [i18n] },
    ...(attach ? { attachTo: document.body } : {})
  });
}

describe('SettingsMenu', () => {
  it('is closed by default — panel not rendered', () => {
    const w = mountMenu();
    expect(w.find('[data-test="settings-menu-panel"]').exists()).toBe(false);
    expect(w.get('[data-test="settings-menu-toggle"]').attributes('aria-expanded')).toBe('false');
  });

  it('opens the panel on trigger click and shows the settings panel', async () => {
    const w = mountMenu();
    await w.get('[data-test="settings-menu-toggle"]').trigger('click');
    expect(w.find('[data-test="settings-menu-panel"]').exists()).toBe(true);
    expect(w.findComponent({ name: 'SettingsPanel' }).exists()).toBe(true);
    expect(w.get('[data-test="settings-menu-toggle"]').attributes('aria-expanded')).toBe('true');
  });

  it('closes on Esc', async () => {
    const w = mountMenu();
    await w.get('[data-test="settings-menu-toggle"]').trigger('click');
    expect(w.find('[data-test="settings-menu-panel"]').exists()).toBe(true);
    await w.get('[data-test="settings-menu"]').trigger('keydown', { key: 'Escape' });
    expect(w.find('[data-test="settings-menu-panel"]').exists()).toBe(false);
  });

  it('closes when a pointer press lands outside the menu', async () => {
    const w = mountMenu(true);
    await w.get('[data-test="settings-menu-toggle"]').trigger('click');
    expect(w.find('[data-test="settings-menu-panel"]').exists()).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await w.vm.$nextTick();
    expect(w.find('[data-test="settings-menu-panel"]').exists()).toBe(false);
    w.unmount();
  });

  it('stays open when a pointer press lands inside the panel (e.g. on a label)', async () => {
    const w = mountMenu(true);
    await w.get('[data-test="settings-menu-toggle"]').trigger('click');
    const panel = w.get('[data-test="settings-menu-panel"]');
    panel.element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await w.vm.$nextTick();
    expect(w.find('[data-test="settings-menu-panel"]').exists()).toBe(true);
    w.unmount();
  });
});
