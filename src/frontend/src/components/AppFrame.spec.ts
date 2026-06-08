import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppFrame from './AppFrame.vue';

describe('AppFrame', () => {
  it('renders the framed chrome and its default slot', () => {
    const wrapper = mount(AppFrame, { slots: { default: '<p>inside</p>' } });
    expect(wrapper.find('[data-test="app-frame"]').exists()).toBe(true);
    expect(wrapper.html()).toContain('inside');
  });
});
