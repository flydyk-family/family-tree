import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../i18n';

// Force two pages regardless of (absent) jsdom layout.
const paginateMock = vi.fn();
vi.mock('../text/paginateText', () => ({ paginate: (...args: unknown[]) => paginateMock(...args) }));

import ChroniclePager from './ChroniclePager.vue';
import { useLocaleStore } from '../stores/localeStore';
import { createPinia, setActivePinia } from 'pinia';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  paginateMock.mockReset();
});

function mountPager(text: string) {
  return mount(ChroniclePager, { props: { text }, global: { plugins: [i18n] } });
}

describe('ChroniclePager', () => {
  it('renders a single page with no control when it all fits', () => {
    paginateMock.mockReturnValue([{ start: 0, end: 5 }]);
    const w = mountPager('aaa bbb ccc ddd eee');
    expect(w.find('[data-test="pager-page"]').text()).toBe('aaa bbb ccc ddd eee');
    expect(w.find('[data-test="pager-control"]').exists()).toBe(false);
  });

  it('shows the control and turns pages when there are several', async () => {
    // tokens for "aaa bbb ccc": [aaa, ' ', bbb, ' ', ccc] (5 tokens)
    paginateMock.mockReturnValue([{ start: 0, end: 3 }, { start: 3, end: 5 }]);
    const w = mountPager('aaa bbb ccc');
    expect(w.find('[data-test="pager-control"]').exists()).toBe(true);
    expect(w.find('[data-test="pager-page"]').text()).toBe('aaa bbb');
    expect(w.find('[data-test="pager-count"]').text()).toBe('1 / 2');
    expect(w.find('[data-test="pager-prev"]').attributes('disabled')).toBeDefined();

    await w.find('[data-test="pager-next"]').trigger('click');
    expect(w.find('[data-test="pager-page"]').text()).toBe('ccc');
    expect(w.find('[data-test="pager-count"]').text()).toBe('2 / 2');
    expect(w.find('[data-test="pager-next"]').attributes('disabled')).toBeDefined();

    await w.find('[data-test="pager-prev"]').trigger('click');
    expect(w.find('[data-test="pager-page"]').text()).toBe('aaa bbb');
  });

  it('marks the page region as a polite live region', () => {
    paginateMock.mockReturnValue([{ start: 0, end: 1 }]);
    const w = mountPager('aaa');
    expect(w.find('[data-test="pager-page"]').attributes('aria-live')).toBe('polite');
  });

  it('renders empty and shows no control for empty text', () => {
    paginateMock.mockReturnValue([]);
    const w = mountPager('');
    expect(w.find('[data-test="pager-page"]').text()).toBe('');
    expect(w.find('[data-test="pager-control"]').exists()).toBe(false);
  });

  // Security invariant: biography text is untrusted (editor-supplied, stored verbatim by the
  // API) and must never be rendered as HTML. This guards against a future regression that
  // swaps the `{{ }}` interpolation for v-html and reintroduces stored XSS.
  it('renders biography text as escaped plain text, never as HTML', () => {
    paginateMock.mockReturnValue([{ start: 0, end: 100 }]);
    const w = mountPager('<script>alert(1)</script> <b>bold</b> <img src=x onerror=alert(2)>');
    const page = w.find('[data-test="pager-page"]');

    // No element was synthesised from the markup...
    expect(page.find('script').exists()).toBe(false);
    expect(page.find('b').exists()).toBe(false);
    expect(page.find('img').exists()).toBe(false);
    // ...and the literal characters survive as text (escaped in the HTML).
    expect(page.text()).toContain('<script>alert(1)</script>');
    expect(page.html()).toContain('&lt;script&gt;');
  });
});
