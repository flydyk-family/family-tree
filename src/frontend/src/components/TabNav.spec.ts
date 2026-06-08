import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import TabNav from './TabNav.vue';
import { i18n } from '../i18n';
import { useUiStore } from '../stores/uiStore';

beforeEach(() => { setActivePinia(createPinia()); });
const mountNav = () => mount(TabNav, { global: { plugins: [i18n] } });

describe('TabNav', () => {
  it('renders four tabs with Tree active', () => {
    const wrapper = mountNav();
    expect(wrapper.findAll('.tabnav__tab')).toHaveLength(4);
    expect(wrapper.get('[data-test="tab-tree"]').classes()).toContain('tabnav__tab--active');
  });

  it('Members and Timeline are disabled placeholders', () => {
    const wrapper = mountNav();
    expect(wrapper.get('[data-test="tab-members"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-test="tab-timeline"]').attributes('disabled')).toBeDefined();
  });

  it('clicking an enabled tab updates the store', async () => {
    const wrapper = mountNav();
    const ui = useUiStore();
    await wrapper.get('[data-test="tab-chronicle"]').trigger('click');
    expect(ui.activeTab).toBe('chronicle');
  });
});
