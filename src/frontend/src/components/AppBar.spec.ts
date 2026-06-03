import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AppBar from './AppBar.vue';
import { i18n } from '../i18n';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  i18n.global.locale.value = 'en';
});

describe('AppBar', () => {
  it('renders the localized app title and contains the language picker', () => {
    const wrapper = mount(AppBar, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toContain('Family Tree');
    expect(wrapper.find('[data-test="language-picker"]').exists()).toBe(true);
  });
});
