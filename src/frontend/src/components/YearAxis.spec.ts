import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import YearAxis from './YearAxis.vue';
import { createTimeScale } from '../layout/timeScale';

describe('YearAxis', () => {
  it('renders labelled ticks across the scale', () => {
    const scale = createTimeScale([1800, 2000], 8, 0);
    const wrapper = mount(YearAxis, { props: { scale, viewport: { x: 0, y: 0, k: 1 } } });

    const labels = wrapper.findAll('[data-test="tick-label"]');
    expect(labels.length).toBeGreaterThan(0);
  });

  it('positions ticks with the viewport translation and zoom', () => {
    const scale = createTimeScale([1800, 2000], 8, 0);
    const wrapper = mount(YearAxis, { props: { scale, viewport: { x: 0, y: 50, k: 2 } } });

    const ticks = wrapper.findAll('[data-test="tick"]');
    // newest year (2000) sits at content y=0 → screen y = viewportY (50px)
    const top = ticks.find(tick => tick.text().includes('2000'));
    expect(top?.attributes('style')).toContain('top: 50px');
  });

  it('shows denser ticks when zoomed in', () => {
    const scale = createTimeScale([1800, 2000], 8, 0);
    const zoomedOut = mount(YearAxis, { props: { scale, viewport: { x: 0, y: 0, k: 0.2 } } });
    const zoomedIn = mount(YearAxis, { props: { scale, viewport: { x: 0, y: 0, k: 2 } } });

    expect(zoomedIn.findAll('[data-test="tick"]').length)
      .toBeGreaterThan(zoomedOut.findAll('[data-test="tick"]').length);
  });
});
