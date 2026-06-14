import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ChronicleScroll from './ChronicleScroll.vue';

// A controllable ResizeObserver stub: the component re-measures (reads layout +
// sizes the thumb) from the RO callback, so the tests trigger it explicitly.
let triggerResize: () => void = () => {};
beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    constructor(cb: () => void) { triggerResize = () => cb(); }
    observe() {}
    disconnect() {}
  };
});

// jsdom has no layout, so define the scroll geometry on the elements directly.
function setGeometry(el: Element, props: { scrollTop?: number; scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, 'scrollHeight', { value: props.scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: props.clientHeight, configurable: true });
  if (props.scrollTop !== undefined) {
    Object.defineProperty(el, 'scrollTop', { value: props.scrollTop, writable: true, configurable: true });
  }
}

describe('ChronicleScroll', () => {
  it('renders slotted content inside the viewport', () => {
    const w = mount(ChronicleScroll, { slots: { default: '<p class="x">hello</p>' } });
    expect(w.find('[data-test="cs-view"] .x').text()).toBe('hello');
  });

  it('always renders the decorated gutter', () => {
    const w = mount(ChronicleScroll);
    expect(w.find('[data-test="cs-gutter"]').exists()).toBe(true);
  });

  it('hides the thumb when content fits', () => {
    const w = mount(ChronicleScroll, { slots: { default: '<p>x</p>' } });
    expect(w.find('[data-test="cs-thumb"]').isVisible()).toBe(false);
  });

  it('shows and sizes the thumb when content overflows', async () => {
    const w = mount(ChronicleScroll, { slots: { default: '<p>x</p>' } });
    setGeometry(w.find('[data-test="cs-view"]').element, { scrollTop: 0, scrollHeight: 600, clientHeight: 300 });
    setGeometry(w.find('[data-test="cs-gutter"]').element, { scrollHeight: 300, clientHeight: 300 });
    triggerResize(); // a ResizeObserver callback re-measures (post-layout)
    await w.vm.$nextTick();
    const thumb = w.find('[data-test="cs-thumb"]');
    expect(thumb.isVisible()).toBe(true);
    expect(thumb.attributes('style')).toContain('height: 150px');
  });

  it('drags the thumb to update scrollTop', async () => {
    const w = mount(ChronicleScroll, { slots: { default: '<p>x</p>' } });
    const view = w.find('[data-test="cs-view"]').element as HTMLElement;
    setGeometry(view, { scrollTop: 0, scrollHeight: 600, clientHeight: 300 });
    setGeometry(w.find('[data-test="cs-gutter"]').element, { scrollHeight: 300, clientHeight: 300 });
    triggerResize(); // measure → thumbH = 150, dims cached
    await w.vm.$nextTick();
    const thumb = w.find('[data-test="cs-thumb"]');
    await thumb.trigger('pointerdown', { clientY: 0, pointerId: 1 });
    await thumb.trigger('pointermove', { clientY: 75, pointerId: 1 });
    expect(view.scrollTop).toBe(150); // 75/150 * 300
  });
});
