import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ChronicleScroll from './ChronicleScroll.vue';

// A controllable ResizeObserver stub: the component re-measures (reads layout +
// sizes the thumb) from the RO callback, which is coalesced via a timer — so the
// tests trigger it explicitly and then advance fake timers to flush it.
let triggerResize: () => void = () => {};
beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    constructor(cb: () => void) { triggerResize = () => cb(); }
    observe() {}
    disconnect() {}
  };
});
afterEach(() => {
  vi.useRealTimers();
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
    triggerResize();             // RO callback schedules a (debounced) re-measure
    vi.advanceTimersByTime(160); // flush the coalesced measure
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
    triggerResize();
    vi.advanceTimersByTime(160); // flush the coalesced measure → thumbH = 150, dims cached
    await w.vm.$nextTick();
    const thumb = w.find('[data-test="cs-thumb"]');
    await thumb.trigger('pointerdown', { clientY: 0, pointerId: 1 });
    await thumb.trigger('pointermove', { clientY: 75, pointerId: 1 });
    expect(view.scrollTop).toBe(150); // 75/150 * 300
  });

  it('repositions the thumb as the viewport scrolls', async () => {
    const w = mount(ChronicleScroll, { slots: { default: '<p>x</p>' } });
    const view = w.find('[data-test="cs-view"]');
    setGeometry(view.element, { scrollTop: 0, scrollHeight: 600, clientHeight: 300 });
    setGeometry(w.find('[data-test="cs-gutter"]').element, { scrollHeight: 300, clientHeight: 300 });
    triggerResize();
    vi.advanceTimersByTime(160);
    await w.vm.$nextTick();
    expect(w.find('[data-test="cs-thumb"]').attributes('style')).toContain('top: 0px');

    // Scroll halfway → the thumb tracks to the middle of the available track.
    Object.defineProperty(view.element, 'scrollTop', { value: 150, configurable: true });
    await view.trigger('scroll');
    expect(w.find('[data-test="cs-thumb"]').attributes('style')).toContain('top: 75px'); // 150/300 * 150
  });

  it('ignores a scroll while the thumb is hidden (nothing to scroll)', async () => {
    const w = mount(ChronicleScroll, { slots: { default: '<p>x</p>' } });
    // No overflow geometry → thumb hidden; the scroll handler is a no-op.
    await w.find('[data-test="cs-view"]').trigger('scroll');
    expect(w.find('[data-test="cs-thumb"]').isVisible()).toBe(false);
  });

  it('ends a drag on pointerup and pointercancel', async () => {
    const w = mount(ChronicleScroll, { slots: { default: '<p>x</p>' } });
    const view = w.find('[data-test="cs-view"]').element as HTMLElement;
    setGeometry(view, { scrollTop: 0, scrollHeight: 600, clientHeight: 300 });
    setGeometry(w.find('[data-test="cs-gutter"]').element, { scrollHeight: 300, clientHeight: 300 });
    triggerResize();
    vi.advanceTimersByTime(160);
    await w.vm.$nextTick();
    const thumb = w.find('[data-test="cs-thumb"]');
    await thumb.trigger('pointerdown', { clientY: 0, pointerId: 1 });
    await thumb.trigger('pointerup', { pointerId: 1 });
    // A move after release does nothing — the drag has ended.
    const at = view.scrollTop;
    await thumb.trigger('pointermove', { clientY: 200, pointerId: 1 });
    expect(view.scrollTop).toBe(at);
    // pointercancel path also ends a drag cleanly.
    await thumb.trigger('pointerdown', { clientY: 0, pointerId: 1 });
    await thumb.trigger('pointercancel', { pointerId: 1 });
  });

  it('captures and releases the pointer around a thumb drag when supported', async () => {
    const w = mount(ChronicleScroll, { slots: { default: '<p>x</p>' }, attachTo: document.body });
    setGeometry(w.find('[data-test="cs-view"]').element, { scrollTop: 0, scrollHeight: 600, clientHeight: 300 });
    setGeometry(w.find('[data-test="cs-gutter"]').element, { scrollHeight: 300, clientHeight: 300 });
    triggerResize();
    vi.advanceTimersByTime(160);
    await w.vm.$nextTick();
    const thumb = w.find('[data-test="cs-thumb"]');
    const el = thumb.element as HTMLElement;
    const setCapture = vi.fn();
    const releaseCapture = vi.fn();
    el.setPointerCapture = setCapture;
    el.releasePointerCapture = releaseCapture;
    await thumb.trigger('pointerdown', { clientY: 0, pointerId: 7 });
    expect(setCapture).toHaveBeenCalledWith(7);
    await thumb.trigger('pointerup', { pointerId: 7 });
    expect(releaseCapture).toHaveBeenCalledWith(7);
    w.unmount();
  });

  it('disconnects its observer on unmount', () => {
    const disconnect = vi.fn();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      constructor(cb: () => void) { triggerResize = () => cb(); }
      observe() {}
      disconnect = disconnect;
    };
    const w = mount(ChronicleScroll, { slots: { default: '<p>x</p>' } });
    w.unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
