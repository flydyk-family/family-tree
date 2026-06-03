import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import LanguagePicker from './LanguagePicker.vue';
import { i18n } from '../i18n';
import { useLocaleStore } from '../stores/localeStore';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  i18n.global.locale.value = 'ru';
});

function mountPicker() {
  return mount(LanguagePicker, { global: { plugins: [i18n] } });
}

describe('LanguagePicker', () => {
  it('shows the current locale flag and native name', () => {
    const store = useLocaleStore();
    store.setLocale('en');

    const wrapper = mountPicker();

    const toggle = wrapper.get('[data-test="language-picker-toggle"]');
    expect(toggle.text()).toContain('English');
    expect(wrapper.find('.fi.fi-gb').exists()).toBe(true);
  });

  it('opens and lists the three locales', async () => {
    const wrapper = mountPicker();

    await wrapper.get('[data-test="language-picker-toggle"]').trigger('click');

    expect(wrapper.findAll('[data-test="language-option"]')).toHaveLength(3);
  });

  it('selecting a locale updates the store and closes the menu', async () => {
    const wrapper = mountPicker();
    const store = useLocaleStore();

    await wrapper.get('[data-test="language-picker-toggle"]').trigger('click');
    // Options render in order en, ru, be → index 2 is Belarusian.
    await wrapper.findAll('[data-test="language-option"]')[2].trigger('click');

    expect(store.currentLocale).toBe('be');
    expect(wrapper.findAll('[data-test="language-option"]')).toHaveLength(0);
  });
});
