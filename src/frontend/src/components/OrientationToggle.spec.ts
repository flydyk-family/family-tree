import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import OrientationToggle from './OrientationToggle.vue';
import { i18n } from '../i18n';
import { useUiStore } from '../stores/uiStore';

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); });

function mountToggle() {
  return mount(OrientationToggle, { global: { plugins: [i18n] } });
}

describe('OrientationToggle', () => {
  it('marks the active orientation pressed', () => {
    const wrapper = mountToggle();
    expect(wrapper.get('[data-test="orientation-vertical"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[data-test="orientation-horizontal"]').attributes('aria-pressed')).toBe('false');
  });

  it('clicking horizontal updates the store', async () => {
    const wrapper = mountToggle();
    const ui = useUiStore();
    await wrapper.get('[data-test="orientation-horizontal"]').trigger('click');
    expect(ui.orientation).toBe('horizontal');
    expect(wrapper.get('[data-test="orientation-horizontal"]').attributes('aria-pressed')).toBe('true');
  });
});
