import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import ThemeToggle from './ThemeToggle.vue';
import { useUiStore } from '../stores/uiStore';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { theme: { label: 'Theme', classic: 'Classic', eighties: 'Film' } } }
});

function mountToggle() {
  return mount(ThemeToggle, { global: { plugins: [i18n] } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('ThemeToggle', () => {
  it('marks the classic button as pressed by default', () => {
    const wrapper = mountToggle();
    expect(wrapper.find('[data-test="theme-classic"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-test="theme-eighties"]').attributes('aria-pressed')).toBe('false');
  });

  it('switches the store theme to eighties on click', async () => {
    const ui = useUiStore();
    const wrapper = mountToggle();
    await wrapper.find('[data-test="theme-eighties"]').trigger('click');
    expect(ui.theme).toBe('eighties');
    expect(wrapper.find('[data-test="theme-eighties"]').attributes('aria-pressed')).toBe('true');
  });

  it('switches back to classic on click', async () => {
    const ui = useUiStore();
    ui.setTheme('eighties');
    const wrapper = mountToggle();
    await wrapper.find('[data-test="theme-classic"]').trigger('click');
    expect(ui.theme).toBe('classic');
  });
});
