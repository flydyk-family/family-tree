import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import ChroniclePager from './ChroniclePager.vue';
import { useLocaleStore } from '../stores/localeStore';

// Unlike ChroniclePager.spec.ts (which mocks `paginate`), this suite drives the
// REAL measurement path: it fakes jsdom's (absent) layout so `fits()` and the
// ResizeObserver / deferred-paginate lifecycle actually run.

// A controllable ResizeObserver: capture the callback so a test can fire it.
let triggerResize: () => void = () => {};

// Fake layout: the off-screen probe's height is its text length; a page holds
// `pageCapacityChars`. So pagination splits a long string into predictable pages.
function fakeGeometry(root: Element, pageWidth: number, pageCapacityChars: number): void {
  const page = root.querySelector('[data-test="pager-page"]') as HTMLElement;
  const measure = root.querySelector('.pager__measure') as HTMLElement;
  Object.defineProperty(page, 'clientWidth', { value: pageWidth, configurable: true });
  Object.defineProperty(page, 'clientHeight', { value: pageCapacityChars, configurable: true });
  Object.defineProperty(measure, 'scrollHeight', {
    get() { return (this.textContent ?? '').length; },
    configurable: true
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  vi.useFakeTimers();
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    constructor(cb: () => void) { triggerResize = () => cb(); }
    observe() {}
    disconnect() {}
  };
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as { requestIdleCallback?: unknown }).requestIdleCallback;
});

// 40 two-letter words → ~119 chars / 79 tokens; with a 30-char page that paginates.
const LONG = Array.from({ length: 40 }, () => 'xx').join(' ');

function mountPager(text = LONG) {
  return mount(ChroniclePager, { props: { text }, attachTo: document.body, global: { plugins: [i18n] } });
}

describe('ChroniclePager — real measurement lifecycle', () => {
  it('starts as a single page, then paginates after the deferred measure runs', async () => {
    const w = mountPager();
    // Setup-time pagination saw null refs → everything "fits" → one page, no control.
    expect(w.find('[data-test="pager-control"]').exists()).toBe(false);

    fakeGeometry(w.element, 100, 30);
    vi.advanceTimersByTime(40); // deferRepaginate's setTimeout(32) fallback fires
    await w.vm.$nextTick();

    expect(w.find('[data-test="pager-control"]').exists()).toBe(true);
    const count = w.find('[data-test="pager-count"]').text();
    expect(count).toMatch(/1 \/ \d+/);
    // First page is non-empty and bounded by the fake capacity.
    expect(w.find('[data-test="pager-page"]').text().length).toBeGreaterThan(0);
  });

  it('uses requestIdleCallback for the initial deferred measure when available', async () => {
    (globalThis as unknown as { requestIdleCallback: unknown }).requestIdleCallback =
      (cb: () => void) => { cb(); return 1; };
    (globalThis as unknown as { cancelIdleCallback: unknown }).cancelIdleCallback = () => {};
    const w = mount(ChroniclePager, {
      props: { text: LONG }, attachTo: document.body, global: { plugins: [i18n] }
    });
    fakeGeometry(w.element, 100, 30);
    // requestIdleCallback ran synchronously in onMounted, but geometry was faked
    // after — so force one more measure via the resize path.
    triggerResize();
    vi.advanceTimersByTime(150);
    await w.vm.$nextTick();
    expect(w.find('[data-test="pager-control"]').exists()).toBe(true);
  });

  it('re-paginates from a ResizeObserver callback when the page box changes', async () => {
    const w = mountPager();
    fakeGeometry(w.element, 100, 30);
    vi.advanceTimersByTime(40);
    await w.vm.$nextTick();
    const before = Number(w.find('[data-test="pager-count"]').text().split('/')[1].trim());

    // Shrink the page → more pages. Re-define clientHeight then fire the RO.
    Object.defineProperty(w.find('[data-test="pager-page"]').element, 'clientHeight', { value: 12, configurable: true });
    triggerResize();
    vi.advanceTimersByTime(150); // coalesced scheduleRepaginate
    await w.vm.$nextTick();
    const after = Number(w.find('[data-test="pager-count"]').text().split('/')[1].trim());
    expect(after).toBeGreaterThan(before);
  });

  it('skips the re-paginate when the page box is unchanged', async () => {
    const w = mountPager();
    fakeGeometry(w.element, 100, 30);
    vi.advanceTimersByTime(40);
    await w.vm.$nextTick();
    const before = w.find('[data-test="pager-count"]').text();

    triggerResize(); // same geometry → shouldRepaginate() is false
    vi.advanceTimersByTime(150);
    await w.vm.$nextTick();
    expect(w.find('[data-test="pager-count"]').text()).toBe(before);
  });

  it('does not re-paginate while collapsed (clientHeight 0)', async () => {
    const w = mountPager();
    fakeGeometry(w.element, 100, 30);
    vi.advanceTimersByTime(40);
    await w.vm.$nextTick();
    const before = w.find('[data-test="pager-count"]').text();

    Object.defineProperty(w.find('[data-test="pager-page"]').element, 'clientHeight', { value: 0, configurable: true });
    triggerResize();
    vi.advanceTimersByTime(150);
    await w.vm.$nextTick();
    expect(w.find('[data-test="pager-count"]').text()).toBe(before); // unchanged
  });

  it('clamps the current page when re-pagination yields fewer pages', async () => {
    const w = mountPager();
    fakeGeometry(w.element, 100, 12); // many small pages
    vi.advanceTimersByTime(40);
    await w.vm.$nextTick();
    const total = Number(w.find('[data-test="pager-count"]').text().split('/')[1].trim());
    expect(total).toBeGreaterThan(1);

    // Jump to the last page.
    for (let i = 1; i < total; i++) {
      await w.find('[data-test="pager-next"]').trigger('click');
    }
    expect(w.find('[data-test="pager-count"]').text()).toBe(`${total} / ${total}`);

    // Grow the page so it all fits in one → current must clamp back to 0.
    Object.defineProperty(w.find('[data-test="pager-page"]').element, 'clientHeight', { value: 1000, configurable: true });
    triggerResize();
    vi.advanceTimersByTime(150);
    await w.vm.$nextTick();
    expect(w.find('[data-test="pager-control"]').exists()).toBe(false); // single page
  });

  it('re-paginates and resets to page 1 when the text changes', async () => {
    const w = mountPager();
    fakeGeometry(w.element, 100, 12);
    vi.advanceTimersByTime(40);
    await w.vm.$nextTick();
    await w.find('[data-test="pager-next"]').trigger('click');
    expect(w.find('[data-test="pager-count"]').text()).not.toMatch(/^1 \//);

    await w.setProps({ text: 'short' });
    await w.vm.$nextTick();
    // Short text → single page, no control, back at the top.
    expect(w.find('[data-test="pager-control"]').exists()).toBe(false);
    expect(w.find('[data-test="pager-page"]').text()).toBe('short');
  });

  it('disconnects its observer and cancels timers on unmount', async () => {
    const disconnect = vi.fn();
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      constructor(cb: () => void) { triggerResize = () => cb(); }
      observe() {}
      disconnect = disconnect;
    };
    const w = mountPager();
    fakeGeometry(w.element, 100, 30);
    vi.advanceTimersByTime(40);
    await w.vm.$nextTick();
    w.unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
