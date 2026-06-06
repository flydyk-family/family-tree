import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppVersion from './AppVersion.vue';

describe('AppVersion', () => {
  it('renders the injected build version with the commit in the tooltip', () => {
    const wrapper = mount(AppVersion);

    expect(wrapper.text()).toContain(`v${__APP_VERSION__}`);
    expect(wrapper.attributes('title')).toContain(__APP_COMMIT__);
  });
});
