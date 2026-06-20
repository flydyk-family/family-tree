import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TimeRail from './TimeRail.vue';
import TimeRailSrc from './TimeRail.vue?raw';
import { createTimeScale } from '../layout/timeScale';
import { sprocketPitch } from './railFilmStrip';

const scale = createTimeScale([1800, 2000], 8, 0);

describe('TimeRail', () => {
  it('renders labelled ticks (vertical)', () => {
    const wrapper = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k: 1 }, orientation: 'vertical' } });
    expect(wrapper.findAll('[data-test="tick-label"]').length).toBeGreaterThan(0);
  });

  it('positions vertical ticks by top with the viewport translation/zoom', () => {
    const wrapper = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 50, k: 2 }, orientation: 'vertical' } });
    const top = wrapper.findAll('[data-test="tick"]').find(t => t.text().includes('2000'));
    expect(top?.attributes('style')).toContain('top: 50px');
  });

  it('positions horizontal ticks by left (oldest at viewportX)', () => {
    const wrapper = mount(TimeRail, { props: { scale, viewport: { x: 40, y: 0, k: 2 }, orientation: 'horizontal' } });
    const left = wrapper.findAll('[data-test="tick"]').find(t => t.text().includes('1800'));
    expect(left?.attributes('style')).toContain('left: 40px');
  });

  it('shows denser ticks when zoomed in', () => {
    const out = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k: 0.2 }, orientation: 'vertical' } });
    const inn = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k: 2 }, orientation: 'vertical' } });
    expect(inn.findAll('[data-test="tick"]').length).toBeGreaterThan(out.findAll('[data-test="tick"]').length);
  });

  it('marks decade and century ticks for emphasis above the in-between years', () => {
    // k=1 with pxPerYear 8 → a 5-year step, so 1800/1805/1810 are all present.
    const wrapper = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k: 1 }, orientation: 'vertical' } });
    const tick = (year: number) =>
      wrapper.findAll('[data-test="tick"]').find(t => t.find('[data-test="tick-label"]').text() === String(year));
    expect(tick(1800)?.classes()).toContain('time-rail__tick--century');
    expect(tick(1810)?.classes()).toContain('time-rail__tick--decade');
    expect(tick(1805)?.classes()).toContain('time-rail__tick--minor');
  });

  it('keeps horizontal year labels from overlapping across the zoom step-downs', () => {
    // k values straddling the 25→10→5→2→1 transitions where labels used to collide.
    for (const k of [0.6, 0.65, 1.1, 1.4, 2.2, 3.0]) {
      const wrapper = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k }, orientation: 'horizontal' } });
      const xs = wrapper.findAll('[data-test="tick"]')
        .map(t => Number(/left:\s*([\d.]+)px/.exec(t.attributes('style') || '')?.[1]))
        .filter(n => Number.isFinite(n))
        .sort((a, b) => a - b);
      expect(xs.length).toBeGreaterThan(1);
      for (let i = 1; i < xs.length; i++) {
        // a ~38px year label plus a clear gap → never overlapping
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(50);
      }
    }
  });

  it('renders the film strip only in the eighties theme', () => {
    const classic = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k: 1 }, orientation: 'vertical' } });
    expect(classic.find('[data-test="film-strip"]').exists()).toBe(false);
    const eighties = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k: 1 }, orientation: 'vertical', theme: 'eighties' } });
    expect(eighties.find('[data-test="film-strip"]').exists()).toBe(true);
  });

  it('sizes the sprocket background from the zoom', () => {
    const w = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k: 1 }, orientation: 'vertical', theme: 'eighties' } });
    const pitch = sprocketPitch(scale.pxPerYear, 1);
    expect(w.find('[data-test="film-strip"]').attributes('style')).toContain(`${pitch}px`);
  });

  it('time-rail perforations reference --rail-perf, never --canvas-bg', () => {
    const perfBlock = TimeRailSrc.slice(TimeRailSrc.indexOf('.time-rail__perf'));
    expect(perfBlock).toContain('var(--rail-perf)');
    expect(perfBlock).not.toContain('var(--canvas-bg)');
  });

  it('orients the film strip and frame lines along the horizontal axis', () => {
    const w = mount(TimeRail, { props: { scale, viewport: { x: 30, y: 0, k: 1 }, orientation: 'horizontal', theme: 'eighties' } });
    const pitch = sprocketPitch(scale.pxPerYear, 1);
    // horizontal perforations: `${pitch}px 15px` sized, scrolled along X
    const stripStyle = w.find('[data-test="film-strip"]').attributes('style') || '';
    expect(stripStyle).toContain(`${pitch}px 15px`);
    expect(stripStyle).toContain('background-position-x');
    // the frame-line layer tracks the same axis
    expect(w.find('.time-rail__frames').attributes('style') || '').toContain('background-position-x');
  });
});
