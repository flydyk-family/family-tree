import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AppVersion from './AppVersion.vue';

afterEach(() => {
  document.head.innerHTML = '';
});

describe('AppVersion', () => {
  it('renders the injected build version with the commit in the tooltip', () => {
    const wrapper = mount(AppVersion);

    expect(wrapper.text()).toContain(`v${__APP_VERSION__}`);
    expect(wrapper.attributes('title')).toContain(__APP_COMMIT__);
  });

  it('injects a machine-readable app-version meta tag exactly once', () => {
    mount(AppVersion);
    mount(AppVersion);

    const metas = document.head.querySelectorAll('meta[name="app-version"]');
    expect(metas).toHaveLength(1);
    expect(metas[0].getAttribute('content')).toBe(`${__APP_VERSION__}+${__APP_COMMIT__}`);
  });
});
