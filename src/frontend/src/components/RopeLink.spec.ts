import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RopeLink from './RopeLink.vue';
import type { LayoutLink } from '../layout/treeLayout';

const link: LayoutLink = { id: 'l1', kind: 'descent', source: 'p', target: 'c', x1: 0, y1: 0, x2: 80, y2: 160 };

describe('RopeLink', () => {
  it('renders shadow + core + two twist overlays sharing one path', () => {
    const w = mount(RopeLink, { props: { link, orientation: 'vertical', drawGen: 2 } });
    expect(w.find('path.rope__shadow').exists()).toBe(true);
    expect(w.find('path.rope__core').exists()).toBe(true);
    expect(w.find('path.rope__twist-hi').exists()).toBe(true);
    expect(w.find('path.rope__twist-lo').exists()).toBe(true);
  });
  it('keeps the ceremony/test hooks on the SOLID core (never on twist overlays)', () => {
    const w = mount(RopeLink, { props: { link, orientation: 'vertical', drawGen: 2 } });
    const core = w.find('path.rope__core');
    expect(core.attributes('data-test')).toBe('branch');
    expect(core.attributes('data-link-id')).toBe('l1');
    expect(core.attributes('data-entrance-draw')).toBe('2');
    expect(core.attributes('stroke-dasharray')).toBeUndefined(); // core is solid
    // twist overlays fade, not draw
    expect(w.find('path.rope__twist-hi').attributes('data-entrance-fade')).toBe('2');
  });
});
