import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import VocationIcon from './VocationIcon.vue';

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
    const teacher = mount(VocationIcon, { props: { vocation: 'teacher' } })
      .find('[data-test="vocation-icon"]').element.innerHTML;
    const church = mount(VocationIcon, { props: { vocation: 'church' } })
      .find('[data-test="vocation-icon"]').element.innerHTML;

    expect(teacher).not.toBe(church);
    expect(teacher.length).toBeGreaterThan(0);
  });
});
