import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AppBar from './AppBar.vue';
import { i18n } from '../i18n';

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); });
const mountBar = () => mount(AppBar, { global: { plugins: [i18n] } });

describe('AppBar', () => {
  it('renders tabs, search, language picker and orientation toggle', () => {
    const wrapper = mountBar();
    expect(wrapper.find('[data-test="tab-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="search-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="language-picker"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="orientation-toggle"]').exists()).toBe(true);
  });

  it('shows the brand title', () => {
    expect(mountBar().find('[data-test="app-bar"]').text()).toContain('Family');
  });
});
