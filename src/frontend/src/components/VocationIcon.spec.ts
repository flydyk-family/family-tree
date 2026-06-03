import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import VocationIcon from './VocationIcon.vue';

// Keep in sync with VocationIcon.vue — intentionally not imported, to avoid coupling tests to internals
const KNOWN = ['teacher', 'church', 'writer', 'office', 'other'] as const;

describe('VocationIcon', () => {
  it.each(KNOWN)('renders a decorative svg motif for "%s"', (vocation) => {
    const wrapper = mount(VocationIcon, { props: { vocation } });
    const svg = wrapper.find('[data-test="vocation-icon"]');

    expect(svg.exists()).toBe(true);
    expect(svg.attributes('data-vocation')).toBe(vocation);
    // decorative: must not be announced by assistive tech
    expect(svg.attributes('aria-hidden')).toBe('true');
    // has actual geometry, not an empty svg
    expect(svg.element.querySelectorAll('path, line, circle').length).toBeGreaterThan(0);
  });

  it('renders nothing for an unknown vocation', () => {
    const wrapper = mount(VocationIcon, { props: { vocation: 'unknown' } });
    expect(wrapper.find('[data-test="vocation-icon"]').exists()).toBe(false);
  });

  it('renders nothing for an empty vocation', () => {
    const wrapper = mount(VocationIcon, { props: { vocation: '' } });
    expect(wrapper.find('[data-test="vocation-icon"]').exists()).toBe(false);
  });

  it('renders distinct geometry per vocation', () => {
    const htmls = KNOWN.map((v) =>
      mount(VocationIcon, { props: { vocation: v } })
        .find('[data-test="vocation-icon"]').element.innerHTML
    );
    const unique = new Set(htmls);
    expect(unique.size).toBe(KNOWN.length);
    htmls.forEach((h) => expect(h.length).toBeGreaterThan(0));
  });
});
