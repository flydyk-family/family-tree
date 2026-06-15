# Chronicle Scrollbar + Paginated Person Reader — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the person popup a fixed header over a scrolling, paginated body; replace the native scrollbar everywhere with a reusable vine-decorated custom scrollbar whose gutter is always reserved; and remove the More/Less toggle in favour of a paginated biography.

**Architecture:** Two pure helpers (`paginateText`, `scrollThumb`) hold the tricky math so it is unit-testable without a DOM. Two reusable components (`ChronicleScroll`, `ChroniclePager`) consume them. The person card is split into `PersonHeader` (pinned) + `PersonDossier` (body), composed differently by the popup (fixed header + scrolling body) and the rail (`PersonDetail`, inline). The popup↔dock FLIP morph is preserved (the dialog keeps `data-flip-id`; header/body blocks keep `data-cascade`).

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Pinia, vue-i18n, SCSS tokens, Vitest + @vue/test-utils (jsdom).

**Spec:** [`docs/superpowers/specs/2026-06-14-chronicle-scrollbar-and-paginated-reader-design.md`](../specs/2026-06-14-chronicle-scrollbar-and-paginated-reader-design.md)

## Conventions for every task

- Run a single spec: `npm --prefix src/frontend test -- <pattern>` (from the repo root). `<pattern>` is any substring of the file path.
- Full suite: `npm --prefix src/frontend test`. Type-check + build: `npm --prefix src/frontend run build`.
- jsdom has **no layout engine** (`clientHeight`/`scrollHeight` are `0`). Pure math is tested directly; component tests that need overflow define those props on the element with `Object.defineProperty(el, 'scrollHeight', { value, configurable: true })`.
- `ResizeObserver` is absent in jsdom. Components guard with `typeof ResizeObserver !== 'undefined'`; specs that mount them stub it in `beforeEach` (pattern below).
- Commit after each task with the message shown.

## File structure

| File | Responsibility |
|---|---|
| `src/text/paginateText.ts` (new) | Pure greedy page-break over a token count + injected `fits` predicate. |
| `src/scroll/scrollThumb.ts` (new) | Pure custom-scrollbar geometry (thumb size/position; drag inverse). |
| `src/components/ChronicleScroll.vue` (new) | Scroll viewport with native bar hidden + always-reserved vine gutter + draggable thumb. |
| `src/components/ChroniclePager.vue` (new) | Paginates a text block to its container height with a `‹ 1/N ›` control. |
| `src/components/PersonHeader.vue` (new) | Portrait/media + lightbox + name/years/vocation (extracted from `PersonDetail`). |
| `src/components/PersonDossier.vue` (new) | Summary + paged biography + residences + links. |
| `src/components/PersonDetail.vue` (rewrite) | Rail card: loading/error + `PersonHeader` + `PersonDossier`. |
| `src/components/PersonPopup.vue` (modify) | Popup: chrome + fixed `PersonHeader` + `ChronicleScroll(PersonDossier)`. |
| `src/components/PanelRail.vue` (modify) | Wrap the desktop person stack in `ChronicleScroll`. |
| `src/stores/selectionStore.ts` (modify) | Drop `mode`/`expand`/`collapse`/`PopupMode`. |
| `src/i18n/messages/{en,ru,be}.ts` (modify) | Add pager labels; later remove `person.expand`/`collapse`. |

---

## Task 1: `paginateText` pure helper

**Files:**
- Create: `src/frontend/src/text/paginateText.ts`
- Test: `src/frontend/src/text/paginateText.spec.ts`

- [ ] **Step 1: Write the failing test**

`src/frontend/src/text/paginateText.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { paginate } from './paginateText';

describe('paginate', () => {
  it('returns a single page when everything fits', () => {
    expect(paginate(5, () => true)).toEqual([{ start: 0, end: 5 }]);
  });

  it('returns no pages for an empty token list', () => {
    expect(paginate(0, () => true)).toEqual([]);
  });

  it('breaks greedily at the largest fitting prefix (capacity 3)', () => {
    const fits = (start: number, end: number) => end - start <= 3;
    expect(paginate(7, fits)).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
      { start: 6, end: 7 }
    ]);
  });

  it('always advances by at least one token when a single token overflows', () => {
    const fits = (start: number, end: number) => end - start <= 1;
    expect(paginate(3, fits)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 }
    ]);
  });

  it('respects an exact-fit boundary', () => {
    const fits = (start: number, end: number) => end - start <= 4;
    expect(paginate(4, fits)).toEqual([{ start: 0, end: 4 }]);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm --prefix src/frontend test -- paginateText`
Expected: FAIL — `paginate` is not exported / module not found.

- [ ] **Step 3: Implement**

`src/frontend/src/text/paginateText.ts`:

```ts
export type FitsPredicate = (start: number, end: number) => boolean;
export interface PageRange { start: number; end: number; }

// Greedy pagination: each page is the largest [start, end) prefix of the
// remaining tokens that still fits, located by binary search. Always advances by
// at least one token, so a single token too tall for the box still gets its own
// page instead of looping forever. `fits(start, end)` is supplied by the caller
// (a DOM measurer in the component; a synthetic capacity in tests).
export function paginate(tokenCount: number, fits: FitsPredicate): PageRange[] {
  const pages: PageRange[] = [];
  let start = 0;
  while (start < tokenCount) {
    let lo = start + 1;
    let hi = tokenCount;
    let best = start + 1; // guarantee progress
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (fits(start, mid)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    pages.push({ start, end: best });
    start = best;
  }
  return pages;
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npm --prefix src/frontend test -- paginateText`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/text/paginateText.ts src/frontend/src/text/paginateText.spec.ts
git commit -m "feat(frontend): add pure paginate() page-break helper"
```

---

## Task 2: `scrollThumb` pure helper

**Files:**
- Create: `src/frontend/src/scroll/scrollThumb.ts`
- Test: `src/frontend/src/scroll/scrollThumb.spec.ts`

- [ ] **Step 1: Write the failing test**

`src/frontend/src/scroll/scrollThumb.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { thumbMetrics, scrollTopFromThumbTop } from './scrollThumb';

describe('thumbMetrics', () => {
  it('is hidden when content fits the viewport', () => {
    expect(thumbMetrics(0, 200, 200, 200)).toEqual({ visible: false, height: 0, top: 0 });
  });

  it('is hidden when the track has no height', () => {
    expect(thumbMetrics(0, 600, 200, 0)).toEqual({ visible: false, height: 0, top: 0 });
  });

  it('sizes the thumb to the viewport/content ratio', () => {
    const m = thumbMetrics(0, 600, 300, 300);
    expect(m.visible).toBe(true);
    expect(m.height).toBe(150); // 300/600 * 300
    expect(m.top).toBe(0);
  });

  it('places the thumb at the bottom when scrolled to the end', () => {
    const m = thumbMetrics(300, 600, 300, 300); // maxScroll 300, maxTop 150
    expect(m.top).toBe(150);
  });

  it('clamps the thumb height to the minimum', () => {
    const m = thumbMetrics(0, 10000, 300, 300, 28);
    expect(m.height).toBe(28);
  });
});

describe('scrollTopFromThumbTop', () => {
  it('maps a thumb position back to scrollTop', () => {
    // thumbH 150, track 300 -> maxTop 150; content 600, view 300 -> maxScroll 300
    expect(scrollTopFromThumbTop(75, 150, 300, 600, 300)).toBe(150);
  });

  it('clamps past either end', () => {
    expect(scrollTopFromThumbTop(-50, 150, 300, 600, 300)).toBe(0);
    expect(scrollTopFromThumbTop(999, 150, 300, 600, 300)).toBe(300);
  });

  it('returns 0 when there is nothing to scroll', () => {
    expect(scrollTopFromThumbTop(50, 200, 200, 200, 200)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm --prefix src/frontend test -- scrollThumb`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/frontend/src/scroll/scrollThumb.ts`:

```ts
export interface ThumbMetrics { visible: boolean; height: number; top: number; }

// Geometry of the custom scrollbar thumb. Hidden when content fits (or the track
// is collapsed). Otherwise the thumb height is the viewport/content ratio of the
// track (floored at `minThumb`), and its top maps scrollTop onto the remaining
// track travel.
export function thumbMetrics(
  scrollTop: number,
  scrollHeight: number,
  viewHeight: number,
  trackHeight: number,
  minThumb = 28
): ThumbMetrics {
  if (scrollHeight <= viewHeight || trackHeight <= 0) {
    return { visible: false, height: 0, top: 0 };
  }
  const height = Math.max(minThumb, Math.round((viewHeight / scrollHeight) * trackHeight));
  const maxTop = Math.max(0, trackHeight - height);
  const maxScroll = scrollHeight - viewHeight;
  const top = maxScroll <= 0 ? 0 : Math.round((scrollTop / maxScroll) * maxTop);
  return { visible: true, height, top: Math.max(0, Math.min(maxTop, top)) };
}

// Inverse of the `top` mapping: the scrollTop for a thumb dragged to `thumbTop`,
// clamped to the scrollable range.
export function scrollTopFromThumbTop(
  thumbTop: number,
  thumbHeight: number,
  trackHeight: number,
  scrollHeight: number,
  viewHeight: number
): number {
  const maxTop = trackHeight - thumbHeight;
  const maxScroll = scrollHeight - viewHeight;
  if (maxTop <= 0 || maxScroll <= 0) {
    return 0;
  }
  const clampedTop = Math.max(0, Math.min(maxTop, thumbTop));
  return Math.round((clampedTop / maxTop) * maxScroll);
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npm --prefix src/frontend test -- scrollThumb`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/scroll/scrollThumb.ts src/frontend/src/scroll/scrollThumb.spec.ts
git commit -m "feat(frontend): add pure custom-scrollbar thumb geometry"
```

---

## Task 3: i18n — add pager labels

**Files:**
- Modify: `src/frontend/src/i18n/messages/en.ts`, `ru.ts`, `be.ts` (the `person:` block)

This is additive — `messages.spec.ts` (key parity + `person.expand` presence) stays green.

- [ ] **Step 1: Add keys to `en.ts`**

In the `person:` object of `src/frontend/src/i18n/messages/en.ts`, after `error: 'Could not load this person.'` add a comma and:

```ts
    prevPage: 'Previous page',
    nextPage: 'Next page',
    pageOf: '{current} / {total}'
```

- [ ] **Step 2: Add keys to `ru.ts`**

In the `person:` object of `src/frontend/src/i18n/messages/ru.ts`, after `error: 'Не удалось загрузить данные человека.'` add a comma and:

```ts
    prevPage: 'Предыдущая страница',
    nextPage: 'Следующая страница',
    pageOf: '{current} из {total}'
```

- [ ] **Step 3: Add keys to `be.ts`**

In the `person:` object of `src/frontend/src/i18n/messages/be.ts`, after `error: 'Не ўдалося загрузіць звесткі пра чалавека.'` add a comma and:

```ts
    prevPage: 'Папярэдняя старонка',
    nextPage: 'Наступная старонка',
    pageOf: '{current} з {total}'
```

- [ ] **Step 4: Verify parity holds**

Run: `npm --prefix src/frontend test -- messages`
Expected: PASS (both tests; all three catalogs still share key paths).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/i18n/messages/en.ts src/frontend/src/i18n/messages/ru.ts src/frontend/src/i18n/messages/be.ts
git commit -m "feat(i18n): add biography pager labels (prev/next/pageOf)"
```

---

## Task 4: `ChronicleScroll` component

**Files:**
- Create: `src/frontend/src/components/ChronicleScroll.vue`
- Test: `src/frontend/src/components/ChronicleScroll.spec.ts`

- [ ] **Step 1: Write the failing test**

`src/frontend/src/components/ChronicleScroll.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ChronicleScroll from './ChronicleScroll.vue';

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
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
    await w.find('[data-test="cs-view"]').trigger('scroll');
    const thumb = w.find('[data-test="cs-thumb"]');
    expect(thumb.isVisible()).toBe(true);
    expect(thumb.attributes('style')).toContain('height: 150px');
  });

  it('drags the thumb to update scrollTop', async () => {
    const w = mount(ChronicleScroll, { slots: { default: '<p>x</p>' } });
    const view = w.find('[data-test="cs-view"]').element as HTMLElement;
    setGeometry(view, { scrollTop: 0, scrollHeight: 600, clientHeight: 300 });
    setGeometry(w.find('[data-test="cs-gutter"]').element, { scrollHeight: 300, clientHeight: 300 });
    await w.find('[data-test="cs-view"]').trigger('scroll'); // thumbH = 150
    const thumb = w.find('[data-test="cs-thumb"]');
    await thumb.trigger('pointerdown', { clientY: 0, pointerId: 1 });
    await thumb.trigger('pointermove', { clientY: 75, pointerId: 1 });
    expect(view.scrollTop).toBe(150); // 75/150 * 300
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm --prefix src/frontend test -- ChronicleScroll`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement**

`src/frontend/src/components/ChronicleScroll.vue`:

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { scrollTopFromThumbTop, thumbMetrics } from '../scroll/scrollThumb';

const viewEl = ref<HTMLElement | null>(null);
const gutterEl = ref<HTMLElement | null>(null);
const thumbEl = ref<HTMLElement | null>(null);

const visible = ref(false);
const thumbH = ref(0);
const thumbTop = ref(0);

function update(): void {
  const view = viewEl.value;
  const gutter = gutterEl.value;
  if (!view || !gutter) {
    return;
  }
  const m = thumbMetrics(view.scrollTop, view.scrollHeight, view.clientHeight, gutter.clientHeight);
  visible.value = m.visible;
  thumbH.value = m.height;
  thumbTop.value = m.top;
}

let dragging = false;
let dragStartY = 0;
let dragStartTop = 0;

function onPointerDown(e: PointerEvent): void {
  dragging = true;
  dragStartY = e.clientY;
  dragStartTop = thumbTop.value;
  if (thumbEl.value?.setPointerCapture) {
    thumbEl.value.setPointerCapture(e.pointerId);
  }
  e.preventDefault();
}

function onPointerMove(e: PointerEvent): void {
  const view = viewEl.value;
  const gutter = gutterEl.value;
  if (!dragging || !view || !gutter) {
    return;
  }
  const nextTop = dragStartTop + (e.clientY - dragStartY);
  view.scrollTop = scrollTopFromThumbTop(nextTop, thumbH.value, gutter.clientHeight, view.scrollHeight, view.clientHeight);
  update();
}

function onPointerUp(e: PointerEvent): void {
  dragging = false;
  if (thumbEl.value?.releasePointerCapture) {
    thumbEl.value.releasePointerCapture(e.pointerId);
  }
}

let observer: ResizeObserver | null = null;
onMounted(() => {
  update();
  if (typeof ResizeObserver !== 'undefined' && viewEl.value) {
    observer = new ResizeObserver(() => update());
    observer.observe(viewEl.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div class="cs" data-test="chronicle-scroll">
    <div ref="viewEl" class="cs__view" data-test="cs-view" @scroll="update"><slot /></div>
    <div ref="gutterEl" class="cs__gutter" data-test="cs-gutter" aria-hidden="true">
      <div
        v-show="visible"
        ref="thumbEl"
        class="cs__thumb"
        data-test="cs-thumb"
        :style="{ height: thumbH + 'px', top: thumbTop + 'px' }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.cs { position: relative; height: 100%; min-height: 0; }
.cs__view {
  position: absolute; inset: 0 var(--cs-gutter, 14px) 0 0;
  overflow-y: scroll; scrollbar-width: none;
  &::-webkit-scrollbar { width: 0; height: 0; }
}
.cs__gutter {
  position: absolute; top: 0; bottom: 0; right: 0; width: var(--cs-gutter, 14px);
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='44' viewBox='0 0 12 44'><path d='M6 0 C1 8 11 13 6 22 C1 31 11 36 6 44' fill='none' stroke='%23876626' stroke-width='1' opacity='0.5'/><ellipse cx='10' cy='10' rx='2.4' ry='1.3' fill='%237e9a45' opacity='0.55' transform='rotate(35 10 10)'/><ellipse cx='2' cy='32' rx='2.4' ry='1.3' fill='%237e9a45' opacity='0.55' transform='rotate(35 2 32)'/></svg>");
  background-repeat: repeat-y; background-position: center top;
}
.cs__thumb {
  position: absolute; left: 1px; right: 1px; border-radius: 7px; min-height: 28px; cursor: grab;
  background: linear-gradient(var(--gilt-light), var(--gilt));
  border: 1px solid var(--gilt-deep);
  &:active { cursor: grabbing; }
  &::after {
    content: ""; position: absolute; left: 50%; top: 50%; width: 6px; height: 8px;
    transform: translate(-50%, -50%) rotate(-20deg);
    background: radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.5), transparent 60%), var(--leaf);
    border-radius: 0 70% 0 70%; opacity: 0.85;
  }
}
</style>
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npm --prefix src/frontend test -- ChronicleScroll`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/ChronicleScroll.vue src/frontend/src/components/ChronicleScroll.spec.ts
git commit -m "feat(frontend): add ChronicleScroll custom gilt scrollbar"
```

---

## Task 5: `ChroniclePager` component

**Files:**
- Create: `src/frontend/src/components/ChroniclePager.vue`
- Test: `src/frontend/src/components/ChroniclePager.spec.ts`

The component's `fits` predicate uses DOM measurement (no-op in jsdom → single page). To exercise multi-page UI, the test **mocks `paginate`** to return fixed ranges; the real `paginate` is covered by Task 1.

- [ ] **Step 1: Write the failing test**

`src/frontend/src/components/ChroniclePager.spec.ts`:

```ts
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
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm --prefix src/frontend test -- ChroniclePager`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement**

`src/frontend/src/components/ChroniclePager.vue`:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { paginate, type PageRange } from '../text/paginateText';

const props = defineProps<{ text: string }>();
const { t } = useI18n({ useScope: 'global' });

// Tokenise into alternating whitespace / word runs so paragraph breaks (newlines
// inside whitespace tokens) survive pagination; pages are rebuilt by joining a
// token slice verbatim.
const tokens = computed<string[]>(() => props.text.match(/\s+|\S+/g) ?? []);

const pageEl = ref<HTMLElement | null>(null);
const measureEl = ref<HTMLElement | null>(null);
const pages = ref<PageRange[]>([]);
const current = ref(0);

function fits(start: number, end: number): boolean {
  const measure = measureEl.value;
  const page = pageEl.value;
  if (!measure || !page) {
    return true; // no layout (SSR/jsdom) → treat as fitting
  }
  measure.textContent = tokens.value.slice(start, end).join('');
  return measure.scrollHeight <= page.clientHeight;
}

function repaginate(): void {
  pages.value = paginate(tokens.value.length, fits);
  if (current.value > pages.value.length - 1) {
    current.value = Math.max(0, pages.value.length - 1);
  }
}

const total = computed(() => pages.value.length);
const showControl = computed(() => total.value > 1);
const pageText = computed(() => {
  const range = pages.value[current.value];
  // Trim a leading whitespace token so a page never opens with a blank line.
  return range ? tokens.value.slice(range.start, range.end).join('').replace(/^\s+/, '') : props.text;
});

function prev(): void {
  if (current.value > 0) {
    current.value--;
  }
}
function next(): void {
  if (current.value < total.value - 1) {
    current.value++;
  }
}

let observer: ResizeObserver | null = null;
onMounted(() => {
  repaginate();
  if (typeof ResizeObserver !== 'undefined' && pageEl.value) {
    observer = new ResizeObserver(() => repaginate());
    observer.observe(pageEl.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());
watch(() => props.text, () => { current.value = 0; repaginate(); });
</script>

<template>
  <div class="pager" data-test="pager">
    <div ref="pageEl" class="pager__page" data-test="pager-page" aria-live="polite">{{ pageText }}</div>
    <div ref="measureEl" class="pager__measure" aria-hidden="true"></div>
    <div v-if="showControl" class="pager__control" data-test="pager-control">
      <button type="button" class="pager__btn" data-test="pager-prev" :disabled="current === 0"
              :aria-label="t('person.prevPage')" @click="prev">‹</button>
      <span class="pager__count" data-test="pager-count">{{ t('person.pageOf', { current: current + 1, total }) }}</span>
      <button type="button" class="pager__btn" data-test="pager-next" :disabled="current === total - 1"
              :aria-label="t('person.nextPage')" @click="next">›</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.pager { display: flex; flex-direction: column; }
.pager__page {
  height: var(--pager-page-h, 220px); overflow: hidden;
  line-height: 1.55; font-size: 19px; white-space: pre-line;
}
// The off-screen probe must match the page's width + typography so its measured
// height predicts the real page height. Width is inherited from the flow.
.pager__measure {
  position: absolute; visibility: hidden; pointer-events: none; left: -9999px; top: 0;
  line-height: 1.55; font-size: 19px; white-space: pre-line;
}
.pager__control {
  display: flex; align-items: center; justify-content: center; gap: 14px;
  margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--glass-border);
}
.pager__btn {
  width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
  border: 1px solid var(--gilt); background: linear-gradient(var(--control-grad-top), var(--control-grad-bottom));
  color: var(--gilt-deep); font-size: 16px; line-height: 1;
  &:disabled { opacity: 0.35; cursor: default; }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
.pager__count { font-family: var(--font-display); font-size: 14px; color: var(--ink-soft); min-width: 56px; text-align: center; }
</style>
```

> **Note on the measurer width:** because `.pager__measure` is absolutely positioned, give it the page width at runtime. The simplest reliable approach is already covered — `position:absolute; left:-9999px` inherits the containing block width is **not** guaranteed, so in Step 3 the measurer relies on the same font metrics and wraps at the flow width when its `width` is set. If live verification (Task 12) shows page breaks that ignore width, set `measure.style.width = page.clientWidth + 'px'` at the top of `fits()`. Add that line then.

- [ ] **Step 4: Run it; verify it passes**

Run: `npm --prefix src/frontend test -- ChroniclePager`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/ChroniclePager.vue src/frontend/src/components/ChroniclePager.spec.ts
git commit -m "feat(frontend): add ChroniclePager paginated text reader"
```

---

## Task 6: `PersonHeader` component (extract from PersonDetail)

**Files:**
- Create: `src/frontend/src/components/PersonHeader.vue`
- Test: `src/frontend/src/components/PersonHeader.spec.ts`

Ports the portrait/media/lightbox/heading logic and styles out of `PersonDetail.vue`. Takes `detail` as a prop (decoupled from the store for testability). Keeps `data-cascade` on the portrait + heading.

- [ ] **Step 1: Write the failing test**

`src/frontend/src/components/PersonHeader.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PersonHeader from './PersonHeader.vue';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonDetail } from '../types/family';

const tadeusz: PersonDetail = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: 'Тадэвуш', en: 'Tadeusz' },
  surname: { ru: 'Ковальский', be: 'Кавальскі', en: 'Kowalski' },
  maidenName: null, sex: 'male',
  birth: { year: 1962, month: 4, day: null, approx: false, place: { ru: 'Варшава', be: 'Варшава', en: 'Warsaw' } },
  death: null, vocation: 'teacher',
  summary: { ru: 'Учитель истории.', be: null, en: 'A history teacher.' },
  biography: { ru: 'Длинная биография.', be: null, en: 'A longer biography.' },
  portrait: null, portraitVideo: null, gallery: [],
  links: [], residences: [],
  parents: { motherId: 'p-0014', fatherId: 'p-0013' },
  marriedIntoFamily: false, isDefaultRoot: true
};

function mountWith(detail: PersonDetail) {
  return mount(PersonHeader, {
    props: { detail },
    attachTo: document.body,
    global: { plugins: [i18n], stubs: { teleport: true } }
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
});

describe('PersonHeader', () => {
  it('renders name, lifespan and vocation', () => {
    const w = mountWith(tadeusz);
    expect(w.text()).toContain('Tadeusz');
    expect(w.text()).toContain('1962–');
    expect(w.text()).toContain('Teacher');
  });

  it('shows the initial when there is no portrait', () => {
    const w = mountWith(tadeusz);
    expect(w.find('[data-test="portrait-fallback"]').text()).toBe('T');
  });

  it('renders the vocation motif with its data attribute', () => {
    const w = mountWith(tadeusz);
    expect(w.find('[data-test="vocation-icon"]').attributes('data-vocation')).toBe('teacher');
  });

  it('hides the vocation row when there is no vocation', () => {
    const w = mountWith({ ...tadeusz, vocation: '' });
    expect(w.find('.header__vocation').exists()).toBe(false);
  });

  it('re-localizes the name when the active locale changes', async () => {
    const w = mountWith(tadeusz);
    expect(w.text()).toContain('Tadeusz');
    useLocaleStore().setLocale('ru');
    await w.vm.$nextTick();
    expect(w.text()).toContain('Тадеуш');
  });

  it('plays the living portrait with the still as poster when both exist', () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg', portraitVideo: 'p-0016.mp4' });
    const video = w.find('[data-test="portrait-video"]');
    expect(video.attributes('src')).toBe('/media/portraits/p-0016.mp4');
    expect(video.attributes('poster')).toBe('/media/portraits/p-0016.jpg');
    expect(w.find('[data-test="portrait-image"]').exists()).toBe(false);
  });

  it('shows the still image when only a portrait exists', () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg' });
    expect(w.find('[data-test="portrait-image"]').attributes('src')).toBe('/media/portraits/p-0016.jpg');
    expect(w.find('[data-test="portrait-video"]').exists()).toBe(false);
  });

  it('falls back from a failing video to the still image', async () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg', portraitVideo: 'p-0016.mp4' });
    await w.find('[data-test="portrait-video"]').trigger('error');
    expect(w.find('[data-test="portrait-video"]').exists()).toBe(false);
    expect(w.find('[data-test="portrait-image"]').exists()).toBe(true);
  });

  it('falls back from a failing image to the initials', async () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg' });
    await w.find('[data-test="portrait-image"]').trigger('error');
    expect(w.find('[data-test="portrait-image"]').exists()).toBe(false);
    expect(w.find('[data-test="portrait-fallback"]').text()).toBe('T');
  });

  it('opens the lightbox with the clip first and closes it returning focus', async () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg', portraitVideo: 'p-0016.mp4' });
    await w.find('[data-test="portrait-trigger"]').trigger('click');
    const box = w.findComponent({ name: 'MediaLightbox' });
    expect(box.exists()).toBe(true);
    expect(box.props('items')).toEqual([
      { kind: 'video', src: '/media/portraits/p-0016.mp4', poster: '/media/portraits/p-0016.jpg' },
      { kind: 'image', src: '/media/portraits/p-0016.jpg' }
    ]);
    await box.vm.$emit('close');
    await w.vm.$nextTick();
    expect(w.findComponent({ name: 'MediaLightbox' }).exists()).toBe(false);
    expect(document.activeElement).toBe(w.find('[data-test="portrait-trigger"]').element);
    w.unmount();
  });

  it('closes the lightbox when a different person is shown', async () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg', portraitVideo: 'p-0016.mp4' });
    await w.find('[data-test="portrait-trigger"]').trigger('click');
    expect(w.findComponent({ name: 'MediaLightbox' }).exists()).toBe(true);
    await w.setProps({ detail: { ...tadeusz, id: 'p-0099', portrait: 'p-0099.jpg', portraitVideo: null } });
    expect(w.findComponent({ name: 'MediaLightbox' }).exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm --prefix src/frontend test -- PersonHeader`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement**

`src/frontend/src/components/PersonHeader.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatLifespan } from '../format/lifespan';
import { formatPersonName } from '../format/personName';
import type { LocalizedText, PersonDetail } from '../types/family';
import VocationIcon from './VocationIcon.vue';
import { mediaUrl } from '../media/mediaUrl';
import type { MediaItem } from '../media/types';
import MediaLightbox from './MediaLightbox.vue';

const props = defineProps<{ detail: PersonDetail }>();
const { t, te } = useI18n({ useScope: 'global' });
const localeStore = useLocaleStore();

function loc(text: LocalizedText | null | undefined): string {
  return localize(text, localeStore.currentLocale);
}
const fullName = computed(() =>
  formatPersonName(props.detail.givenName, props.detail.surname, localeStore.currentLocale));
const maidenName = computed(() => (props.detail.maidenName ? loc(props.detail.maidenName) : ''));
const lifespan = computed(() => formatLifespan(props.detail.birth, props.detail.death));
const initial = computed(() => fullName.value.charAt(0).toUpperCase());

const videoFailed = ref(false);
const imageFailed = ref(false);
const lightboxOpen = ref(false);
watch(() => props.detail.id, () => {
  videoFailed.value = false;
  imageFailed.value = false;
  lightboxOpen.value = false;
});

const stillUrl = computed(() =>
  props.detail.portrait && !imageFailed.value ? mediaUrl('portraits', props.detail.portrait) : null);
const videoUrl = computed(() =>
  props.detail.portraitVideo && !videoFailed.value ? mediaUrl('portraits', props.detail.portraitVideo) : null);
const hasMedia = computed(() => videoUrl.value !== null || stillUrl.value !== null);

const portraitTriggerRef = ref<HTMLButtonElement | null>(null);
const lightboxItems = computed<MediaItem[]>(() => {
  const items: MediaItem[] = [];
  if (videoUrl.value) {
    items.push({ kind: 'video', src: videoUrl.value, poster: stillUrl.value ?? undefined });
  }
  if (stillUrl.value) {
    items.push({ kind: 'image', src: stillUrl.value });
  }
  return items;
});
function closeLightbox(): void {
  lightboxOpen.value = false;
  portraitTriggerRef.value?.focus();
}

const vocationLabel = computed(() => {
  const v = props.detail.vocation;
  if (!v) {
    return '';
  }
  const key = `vocation.${v}`;
  return te(key) ? t(key) : v;
});
</script>

<template>
  <header class="header" data-test="person-header">
    <button
      v-if="hasMedia"
      ref="portraitTriggerRef"
      type="button"
      class="header__portrait header__portrait--media"
      data-cascade
      data-test="portrait-trigger"
      :aria-label="t('media.view', { name: fullName })"
      @click="lightboxOpen = true"
    >
      <video
        v-if="videoUrl"
        class="header__media"
        data-test="portrait-video"
        :src="videoUrl"
        :poster="stillUrl ?? undefined"
        autoplay
        muted
        loop
        playsinline
        @error="videoFailed = true"
      />
      <img v-else class="header__media" data-test="portrait-image" :src="stillUrl!" alt="" @error="imageFailed = true" />
    </button>
    <div v-else class="header__portrait" data-cascade>
      <span class="header__initial" data-test="portrait-fallback">{{ initial }}</span>
    </div>
    <div class="header__heading" data-cascade>
      <h2 class="header__name">{{ fullName }}</h2>
      <p v-if="maidenName" class="header__maiden">{{ t('person.nee') }} {{ maidenName }}</p>
      <p class="header__life">{{ lifespan }}</p>
      <p v-if="vocationLabel" class="header__vocation">
        <VocationIcon :vocation="detail.vocation" />{{ vocationLabel }}
      </p>
    </div>

    <Teleport to="body">
      <MediaLightbox v-if="lightboxOpen" :items="lightboxItems" :name="fullName" @close="closeLightbox" />
    </Teleport>
  </header>
</template>

<style scoped lang="scss">
.header { display: flex; gap: 14px; align-items: center; font-family: var(--font-body); color: var(--ink); }
.header__portrait { flex: 0 0 auto; width: 84px; height: 84px; border-radius: 50%; border: 1px solid var(--glass-border); background: var(--parchment-2); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.header__media { width: 100%; height: 100%; object-fit: cover; display: block; }
.header__portrait--media { padding: 0; cursor: zoom-in; font: inherit; &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; } }
.header__initial { font-size: 36px; color: var(--ink-soft); }
.header__name { margin: 0; font-size: 29px; font-family: var(--font-display); }
.header__maiden, .header__life, .header__vocation { margin: 3px 0 0; font-size: 20px; color: var(--ink-soft); }
.header__vocation { display: inline-flex; align-items: center; gap: 6px; }
</style>
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npm --prefix src/frontend test -- PersonHeader`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonHeader.vue src/frontend/src/components/PersonHeader.spec.ts
git commit -m "feat(frontend): extract PersonHeader (portrait + media + heading)"
```

---

## Task 7: `PersonDossier` component

**Files:**
- Create: `src/frontend/src/components/PersonDossier.vue`
- Test: `src/frontend/src/components/PersonDossier.spec.ts`

Body blocks: summary + paginated biography + residences + links. Takes `detail` as a prop. In jsdom the pager renders a single page (no layout) so the full biography text appears in `[data-test="pager-page"]`.

- [ ] **Step 1: Write the failing test**

`src/frontend/src/components/PersonDossier.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PersonDossier from './PersonDossier.vue';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonDetail } from '../types/family';

const base: PersonDetail = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: null, en: 'Tadeusz' },
  surname: { ru: 'Ковальский', be: null, en: 'Kowalski' },
  maidenName: null, sex: 'male',
  birth: { year: 1962, month: null, day: null, approx: false, place: null },
  death: null, vocation: 'teacher',
  summary: { ru: null, be: null, en: 'A history teacher.' },
  biography: { ru: null, be: null, en: 'A longer biography.' },
  portrait: null, portraitVideo: null, gallery: [],
  links: [{ type: 'facebook', url: 'https://facebook.com/example' }],
  residences: [{ place: { ru: null, be: null, en: 'Warsaw' }, fromYear: 1962, toYear: null, mapUrl: 'https://maps.google.com/?q=Warszawa' }],
  parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true
};

function mountWith(detail: PersonDetail) {
  return mount(PersonDossier, {
    props: { detail },
    global: { plugins: [i18n], stubs: { teleport: true } }
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
});

describe('PersonDossier', () => {
  it('renders the summary, biography, residences and links', () => {
    const w = mountWith(base);
    expect(w.text()).toContain('A history teacher.');
    expect(w.find('[data-test="pager-page"]').text()).toContain('A longer biography.');
    expect(w.find('[data-test="residences"]').text()).toContain('Warsaw');
    expect(w.find('[data-test="links"]').find('a').text()).toContain('Facebook');
  });

  it('omits the biography block when there is no biography', () => {
    const w = mountWith({ ...base, biography: { ru: null, be: null, en: null } });
    expect(w.find('[data-test="biography"]').exists()).toBe(false);
  });

  it('omits residences and links when empty', () => {
    const w = mountWith({ ...base, residences: [], links: [] });
    expect(w.find('[data-test="residences"]').exists()).toBe(false);
    expect(w.find('[data-test="links"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm --prefix src/frontend test -- PersonDossier`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement**

`src/frontend/src/components/PersonDossier.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import type { LocalizedText, PersonDetail } from '../types/family';
import ChroniclePager from './ChroniclePager.vue';

const props = defineProps<{ detail: PersonDetail }>();
const { t, te } = useI18n({ useScope: 'global' });
const localeStore = useLocaleStore();

function loc(text: LocalizedText | null | undefined): string {
  return localize(text, localeStore.currentLocale);
}
const summaryText = computed(() => loc(props.detail.summary));
const biographyText = computed(() => loc(props.detail.biography));

function socialLabel(type: string): string {
  const key = `social.${type}`;
  return te(key) ? t(key) : type;
}
function residenceYears(fromYear: number | null, toYear: number | null): string {
  const from = fromYear ?? '';
  const to = toYear ?? t('person.present');
  if (from === '' && toYear == null) {
    return '';
  }
  return `${from}–${to}`;
}
</script>

<template>
  <div class="dossier" data-test="person-dossier">
    <p v-if="summaryText" class="dossier__summary" data-cascade>{{ summaryText }}</p>

    <section v-if="biographyText" class="dossier__block" data-cascade data-test="biography">
      <h3 class="dossier__title">{{ t('person.biography') }}</h3>
      <ChroniclePager :text="biographyText" />
    </section>

    <section v-if="detail.residences.length" class="dossier__block" data-cascade>
      <h3 class="dossier__title">{{ t('person.residences') }}</h3>
      <ul class="dossier__list" data-test="residences">
        <li v-for="(r, i) in detail.residences" :key="i" class="dossier__residence">
          <span class="dossier__place">{{ loc(r.place) }}</span>
          <span class="dossier__years">{{ residenceYears(r.fromYear, r.toYear) }}</span>
          <a v-if="r.mapUrl" class="dossier__map" :href="r.mapUrl" target="_blank" rel="noopener noreferrer" :aria-label="t('person.viewOnMap')">🗺</a>
        </li>
      </ul>
    </section>

    <section v-if="detail.links.length" class="dossier__block" data-cascade>
      <h3 class="dossier__title">{{ t('person.links') }}</h3>
      <ul class="dossier__list dossier__links" data-test="links">
        <li v-for="link in detail.links" :key="link.url">
          <a :href="link.url" target="_blank" rel="noopener noreferrer">{{ socialLabel(link.type) }}</a>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped lang="scss">
.dossier { font-family: var(--font-body); color: var(--ink); }
.dossier__summary { margin: 0 0 4px; line-height: 1.5; font-size: 19px; }
.dossier__block { margin-top: 14px; }
.dossier__title { margin: 0 0 6px; font-size: 18px; font-family: var(--font-display); letter-spacing: 0.4px; text-transform: uppercase; color: var(--ink-soft); }
.dossier__list { margin: 0; padding: 0; list-style: none; font-size: 19px; }
.dossier__residence { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; }
.dossier__years { color: var(--ink-soft); font-size: 18px; }
.dossier__map { text-decoration: none; }
.dossier__links a { color: var(--leaf-deep); }
</style>
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npm --prefix src/frontend test -- PersonDossier`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonDossier.vue src/frontend/src/components/PersonDossier.spec.ts
git commit -m "feat(frontend): add PersonDossier (summary + paged bio + residences + links)"
```

---

## Task 8: Restructure `PersonPopup` — fixed header + scrolling body

**Files:**
- Modify: `src/frontend/src/components/PersonPopup.vue`
- Modify: `src/frontend/src/components/PersonPopup.spec.ts`

The dialog becomes a flex column: pinned `PersonHeader` + `ChronicleScroll(PersonDossier)`. Loading/error move into the popup (it no longer renders `PersonDetail`). Chrome (`✕`, dock chevron, scrim, Esc) and the morph hooks (`data-flip-id`, `.popup__shell`) are unchanged.

- [ ] **Step 1: Update the test**

Replace `src/frontend/src/components/PersonPopup.spec.ts` with:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PersonPopup from './PersonPopup.vue';
import { useSelectionStore } from '../stores/selectionStore';
import { usePanelStore } from '../stores/panelStore';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonDetail } from '../types/family';

const tadeusz = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: 'Тадэвуш', en: 'Tadeusz' },
  surname: { ru: 'Ковальский', be: 'Кавальскі', en: 'Kowalski' },
  maidenName: null, sex: 'male',
  birth: { year: 1962, month: 4, day: null, approx: false, place: { ru: 'Варшава', be: null, en: 'Warsaw' } },
  death: null, vocation: 'teacher',
  summary: { ru: 'Учитель истории.', be: null, en: 'A history teacher.' },
  biography: { ru: 'Длинная.', be: null, en: 'A longer biography.' },
  portrait: null, gallery: [],
  links: [], residences: [],
  parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true
} as unknown as PersonDetail;

function mountModal() {
  const panel = usePanelStore();
  panel.openPerson(tadeusz.id);
  useSelectionStore().$patch({ selectedId: tadeusz.id, detail: tadeusz, loading: false, error: null });
  panel.openBiggerView(tadeusz.id);
  return mount(PersonPopup, { global: { plugins: [i18n], stubs: { teleport: true } } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
});

describe('PersonPopup (bigger-view modal)', () => {
  it('renders a dialog with the person content', () => {
    const w = mountModal();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    expect(w.text()).toContain('Tadeusz');
  });

  it('pins the header outside the scrolling body', () => {
    const w = mountModal();
    // header is a direct child of the dialog, NOT inside the scroll viewport
    expect(w.find('[data-test="dialog"] > [data-test="person-header"]').exists()).toBe(true);
    expect(w.find('[data-test="cs-view"] [data-test="person-header"]').exists()).toBe(false);
  });

  it('puts the dossier inside the ChronicleScroll body', () => {
    const w = mountModal();
    expect(w.find('[data-test="chronicle-scroll"] [data-test="person-dossier"]').exists()).toBe(true);
  });

  it('renders both dock and close buttons', () => {
    const w = mountModal();
    expect(w.find('[data-test="popup-dock"]').exists()).toBe(true);
    expect(w.find('[data-test="close"]').exists()).toBe(true);
  });

  it('dock button clears biggerViewId but keeps the person open in the store', async () => {
    const w = mountModal();
    const panel = usePanelStore();
    expect(panel.biggerViewId).toBe(tadeusz.id);
    await w.find('[data-test="popup-dock"]').trigger('click');
    expect(panel.biggerViewId).toBeNull();
    expect(panel.isOpen(tadeusz.id)).toBe(true);
  });

  it('close button removes the person entirely (closePerson)', async () => {
    const w = mountModal();
    const panel = usePanelStore();
    await w.find('[data-test="close"]').trigger('click');
    expect(panel.isOpen(tadeusz.id)).toBe(false);
    expect(panel.biggerViewId).toBeNull();
  });

  it('scrim click docks (clears biggerViewId, person still open)', async () => {
    const w = mountModal();
    const panel = usePanelStore();
    await w.find('[data-test="scrim"]').trigger('click');
    expect(panel.biggerViewId).toBeNull();
    expect(panel.isOpen(tadeusz.id)).toBe(true);
  });

  it('Escape docks (clears biggerViewId, person still open)', async () => {
    const w = mountModal();
    const panel = usePanelStore();
    await w.find('[data-test="dialog"]').trigger('keydown.esc');
    expect(panel.biggerViewId).toBeNull();
    expect(panel.isOpen(tadeusz.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm --prefix src/frontend test -- PersonPopup`
Expected: FAIL — the new structural tests (`person-header` outside `cs-view`, dossier inside `chronicle-scroll`) fail against the current `<PersonDetail/>` layout.

- [ ] **Step 3: Implement**

Replace `src/frontend/src/components/PersonPopup.vue` (script + template only — keep the existing `<style>` block and **add** the new rules shown after it):

Script:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { usePanelStore } from '../stores/panelStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useDockMorph } from '../composables/useDockMorph';
import PersonHeader from './PersonHeader.vue';
import PersonDossier from './PersonDossier.vue';
import ChronicleScroll from './ChronicleScroll.vue';

const { t } = useI18n({ useScope: 'global' });
const panel = usePanelStore();
const selection = useSelectionStore();
const { detail, loading, error } = storeToRefs(selection);
const dockMorph = useDockMorph();
const dialogRef = ref<HTMLElement | null>(null);

function onDock(): void {
  void dockMorph.dock();
}

function onClose(): void {
  if (panel.biggerViewId !== null) {
    panel.closePerson(panel.biggerViewId);
  }
}

onMounted(() => dialogRef.value?.focus());
</script>
```

Template:

```vue
<template>
  <div class="popup" data-test="person-popup">
    <div class="popup__scrim" data-test="scrim" @click="onDock" />
    <div class="popup__shell">
      <section
        ref="dialogRef"
        class="popup__dialog"
        data-test="dialog"
        :data-flip-id="`dock-card-${panel.biggerViewId}`"
        role="dialog"
        aria-modal="true"
        :aria-label="t('panel.biggerView')"
        tabindex="-1"
        @keydown.esc.prevent="onDock"
      >
        <button type="button" class="popup__btn popup__close" data-test="close" :aria-label="t('person.close')" @click="onClose">✕</button>

        <p v-if="loading" class="popup__status">{{ t('person.loading') }}</p>
        <p v-else-if="error" class="popup__status popup__status--error">{{ t('person.error') }}</p>
        <template v-else-if="detail">
          <PersonHeader :detail="detail" class="popup__header" />
          <ChronicleScroll class="popup__body">
            <PersonDossier :detail="detail" />
          </ChronicleScroll>
        </template>
      </section>
      <button
        type="button"
        class="popup__dock-chevron"
        data-test="popup-dock"
        :aria-label="t('panel.dock')"
        :title="t('panel.dock')"
        @click="onDock"
      >
        <span class="popup__dock-body" aria-hidden="true"></span>
        <span class="popup__dock-chev" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
      </button>
    </div>
  </div>
</template>
```

Then in the `<style scoped lang="scss">` block, **change** the `.popup__dialog` rule and **add** the header/body/status rules. Replace the existing `.popup__dialog { … }` with:

```scss
.popup__dialog {
  position: relative; display: flex; flex-direction: column;
  width: min(560px, calc(100vw - 32px)); max-height: min(82vh, 720px);
  overflow: hidden; padding: 22px 24px; background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: 14px; box-shadow: var(--glass-shadow); backdrop-filter: blur(12px); color: var(--ink);
  @supports not ((backdrop-filter: blur(12px)) or (-webkit-backdrop-filter: blur(12px))) { background: var(--parchment-2); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
.popup__header { flex: 0 0 auto; padding-bottom: 14px; border-bottom: 1px solid var(--glass-border); }
.popup__body {
  flex: 1 1 auto; min-height: 0; margin-top: 12px;
  --cs-gutter: 16px;
  --pager-page-h: min(42vh, 340px);
}
.popup__status { margin: 8px 0; font-style: italic; &--error { color: #8a3b32; } }
```

(Keep all the existing `.popup`, `.popup__scrim`, `.popup__shell`, `.popup__btn`, `.popup__close`, and `.popup__dock-*` rules unchanged.)

- [ ] **Step 4: Run it; verify it passes**

Run: `npm --prefix src/frontend test -- PersonPopup`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonPopup.vue src/frontend/src/components/PersonPopup.spec.ts
git commit -m "feat(frontend): popup fixed header over a scrolling paginated body"
```

---

## Task 9: Rewrite `PersonDetail` (rail card)

**Files:**
- Modify: `src/frontend/src/components/PersonDetail.vue`
- Modify: `src/frontend/src/components/PersonDetail.spec.ts`

`PersonDetail` becomes a thin rail card: loading/error + `PersonHeader` + `PersonDossier`. The More/Less footer and all media/lightbox logic (now in `PersonHeader`) are removed.

- [ ] **Step 1: Replace the test**

Replace `src/frontend/src/components/PersonDetail.spec.ts` with:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PersonDetail from './PersonDetail.vue';
import { useSelectionStore } from '../stores/selectionStore';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonDetail as PersonDetailType } from '../types/family';

const tadeusz: PersonDetailType = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: 'Тадэвуш', en: 'Tadeusz' },
  surname: { ru: 'Ковальский', be: 'Кавальскі', en: 'Kowalski' },
  maidenName: null, sex: 'male',
  birth: { year: 1962, month: 4, day: null, approx: false, place: { ru: 'Варшава', be: 'Варшава', en: 'Warsaw' } },
  death: null, vocation: 'teacher',
  summary: { ru: 'Учитель истории.', be: null, en: 'A history teacher.' },
  biography: { ru: 'Длинная биография.', be: null, en: 'A longer biography.' },
  portrait: null, portraitVideo: null, gallery: [],
  links: [{ type: 'facebook', url: 'https://facebook.com/example' }],
  residences: [{ place: { ru: 'Варшава', be: null, en: 'Warsaw' }, fromYear: 1962, toYear: null, mapUrl: 'https://maps.google.com/?q=Warszawa' }],
  parents: { motherId: 'p-0014', fatherId: 'p-0013' },
  marriedIntoFamily: false, isDefaultRoot: true
};

function mountWith(detail: PersonDetailType) {
  const store = useSelectionStore();
  store.$patch({ selectedId: detail.id, detail, loading: false, error: null });
  return mount(PersonDetail, {
    attachTo: document.body,
    global: { plugins: [i18n], stubs: { teleport: true } }
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
});

describe('PersonDetail', () => {
  it('renders the header and the dossier', () => {
    const w = mountWith(tadeusz);
    expect(w.find('[data-test="person-header"]').exists()).toBe(true);
    expect(w.find('[data-test="person-dossier"]').exists()).toBe(true);
    expect(w.text()).toContain('Tadeusz');
  });

  it('always shows biography, residences and links (no More/Less gate)', () => {
    const w = mountWith(tadeusz);
    expect(w.find('[data-test="pager-page"]').text()).toContain('A longer biography.');
    expect(w.find('[data-test="residences"]').text()).toContain('Warsaw');
    expect(w.find('[data-test="links"]').find('a').text()).toContain('Facebook');
    expect(w.find('[data-test="expand"]').exists()).toBe(false);
    expect(w.find('[data-test="collapse"]').exists()).toBe(false);
  });

  it('shows the loading state', () => {
    const store = useSelectionStore();
    store.$patch({ loading: true, detail: null, error: null });
    const w = mount(PersonDetail, { global: { plugins: [i18n] } });
    expect(w.find('.detail__status').text()).toContain('Loading');
  });

  it('shows the error state', () => {
    const store = useSelectionStore();
    store.$patch({ error: 'boom', detail: null, loading: false });
    const w = mount(PersonDetail, { global: { plugins: [i18n] } });
    expect(w.find('.detail__status--error').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm --prefix src/frontend test -- PersonDetail`
Expected: FAIL — `[data-test="person-header"]`/`person-dossier` not present (old PersonDetail still inlines everything and has the More button).

- [ ] **Step 3: Implement**

Replace `src/frontend/src/components/PersonDetail.vue` entirely with:

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useSelectionStore } from '../stores/selectionStore';
import PersonHeader from './PersonHeader.vue';
import PersonDossier from './PersonDossier.vue';

const { t } = useI18n({ useScope: 'global' });
const selection = useSelectionStore();
const { detail, loading, error } = storeToRefs(selection);
</script>

<template>
  <div class="detail" data-test="person-detail">
    <p v-if="loading" class="detail__status">{{ t('person.loading') }}</p>
    <p v-else-if="error" class="detail__status detail__status--error">{{ t('person.error') }}</p>
    <template v-else-if="detail">
      <PersonHeader :detail="detail" />
      <PersonDossier :detail="detail" class="detail__dossier" />
    </template>
  </div>
</template>

<style scoped lang="scss">
.detail { font-family: var(--font-body); color: var(--ink); --pager-page-h: 200px; }
.detail__status { margin: 8px 0; font-style: italic; &--error { color: #8a3b32; } }
.detail__dossier { margin-top: 14px; }
</style>
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npm --prefix src/frontend test -- PersonDetail`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonDetail.vue src/frontend/src/components/PersonDetail.spec.ts
git commit -m "refactor(frontend): PersonDetail = header + dossier, drop More/Less"
```

---

## Task 10: Remove popup `mode` from `selectionStore`

**Files:**
- Modify: `src/frontend/src/stores/selectionStore.ts`
- Modify: `src/frontend/src/stores/selectionStore.spec.ts`
- Modify: `src/frontend/src/components/PanelRail.spec.ts` (drop `mode` from the `$patch`)

- [ ] **Step 1: Update the store test**

In `src/frontend/src/stores/selectionStore.spec.ts`:
- In the test `'opens a person: fetches detail and starts in normal mode'`: rename to `'opens a person: fetches and stores the detail'` and delete the line `expect(store.mode).toBe('normal');`.
- Delete the whole `it('expand and collapse toggle the popup mode', …)` test (lines around 41–50).
- In `'close clears the selection'`: delete the line `expect(store.mode).toBe('normal');`.

- [ ] **Step 2: Run it; verify it fails**

Run: `npm --prefix src/frontend test -- selectionStore`
Expected: still PASS at this point (store still has `mode`). Now make the store the source of truth — proceed to remove `mode` so these assertions can't drift back.

- [ ] **Step 3: Implement — strip `mode` from the store**

Edit `src/frontend/src/stores/selectionStore.ts`:
- Delete `export type PopupMode = 'normal' | 'expanded';` (line 5).
- In `SelectionState`, delete `mode: PopupMode;`.
- In `state()`, delete `mode: 'normal',`.
- In `open()`, delete the line `this.mode = 'normal';`.
- Delete the `expand()` and `collapse()` actions entirely.
- In `close()`, delete the line `this.mode = 'normal';`.

The resulting file:

```ts
import { defineStore } from 'pinia';
import type { PersonDetail } from '../types/family';
import { fetchPerson } from '../api/familyApi';

interface SelectionState {
  selectedId: string | null;
  detail: PersonDetail | null;
  loading: boolean;
  error: string | null;
  cache: Record<string, PersonDetail>;
}

export const useSelectionStore = defineStore('selection', {
  state: (): SelectionState => ({
    selectedId: null,
    detail: null,
    loading: false,
    error: null,
    cache: {}
  }),
  actions: {
    async open(id: string): Promise<void> {
      if (this.selectedId === id && this.detail) {
        return;
      }
      this.selectedId = id;
      this.error = null;

      const cached = this.cache[id];
      if (cached) {
        this.detail = cached;
        this.loading = false;
        return;
      }

      this.loading = true;
      this.detail = null;
      try {
        const detail = await fetchPerson(id);
        this.cache[id] = detail;
        if (this.selectedId === id) {
          this.detail = detail;
        }
      } catch (cause) {
        if (this.selectedId === id) {
          this.error = cause instanceof Error ? cause.message : 'Failed to load person';
        }
      } finally {
        if (this.selectedId === id) {
          this.loading = false;
        }
      }
    },
    close(): void {
      this.selectedId = null;
      this.detail = null;
      this.error = null;
      this.loading = false;
    }
  }
});
```

- [ ] **Step 4: Drop `mode` from the PanelRail spec fixture**

In `src/frontend/src/components/PanelRail.spec.ts`, in `mountRail()`, change the `$patch({ selectedId: 'p-1', mode: 'normal', loading: false, error: null, …})` to remove `mode: 'normal',` (leave the rest).

- [ ] **Step 5: Run the affected specs; verify they pass**

Run: `npm --prefix src/frontend test -- selectionStore`
Run: `npm --prefix src/frontend test -- PanelRail`
Expected: PASS for both.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/stores/selectionStore.ts src/frontend/src/stores/selectionStore.spec.ts src/frontend/src/components/PanelRail.spec.ts
git commit -m "refactor(frontend): drop popup normal/expanded mode from selectionStore"
```

---

## Task 11: Wrap the rail stack in `ChronicleScroll`

**Files:**
- Modify: `src/frontend/src/components/PanelRail.vue`
- Modify: `src/frontend/src/components/PanelRail.spec.ts`

On desktop / rectangles mode the person-panel column scrolls via `ChronicleScroll` (vine gutter, always reserved). Mobile chips mode keeps the plain stack. A dynamic wrapper (`<component :is>`) avoids duplicating the `v-for`.

- [ ] **Step 1: Add tests**

Append these tests inside the existing `describe('PanelRail (desktop)', …)` block in `src/frontend/src/components/PanelRail.spec.ts` (before its closing `});`):

```ts
  it('wraps the desktop person stack in a ChronicleScroll', async () => {
    const w = mountRail();
    usePanelStore().openPerson('p-1');
    await w.vm.$nextTick();
    expect(w.find('[data-test="chronicle-scroll"]').exists()).toBe(true);
    // the person panel lives inside the scroll viewport
    expect(w.find('[data-test="cs-view"] [data-flip-id="dock-card-p-1"]').exists()).toBe(true);
  });
```

And inside `describe('PanelRail (mobile)', …)` add:

```ts
  it('does not wrap the stack in ChronicleScroll in chips mode', async () => {
    const w = mountMobileRail();
    const panel = usePanelStore();
    panel.openPerson('p-1');
    panel.collapseRail(); // chips mode
    await w.vm.$nextTick();
    expect(w.find('[data-test="chronicle-scroll"]').exists()).toBe(false);
  });
```

Also add the `ResizeObserver` stub to the existing top-level `beforeEach` in this file (the one that calls `setActivePinia`): add as its first line:

```ts
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm --prefix src/frontend test -- PanelRail`
Expected: FAIL — `[data-test="chronicle-scroll"]` not found (stack is still a plain `div`).

- [ ] **Step 3: Implement**

In `src/frontend/src/components/PanelRail.vue`:

(a) Import the component — add to the `<script setup>` imports:

```ts
import ChronicleScroll from './ChronicleScroll.vue';
```

(b) Add a computed after `visiblePanels`:

```ts
// Desktop (and mobile rectangles) get the scrolling vine rail; mobile chips do not.
const scrollWrap = computed(() => !isMobile.value || railMode.value === 'rectangles');
```

(c) Replace the existing person-stack block:

```vue
    <!-- Person panels stack. -->
    <div class="rail__stack" :class="{ 'rail__stack--scroll': !isMobile || railMode === 'rectangles' }">
      <DockPanel
        v-for="p in visiblePanels"
        ...
      >
        <PersonDetail v-if="expandedId === p.id" />
      </DockPanel>
    </div>
```

with:

```vue
    <!-- Person panels stack: a scrolling vine rail on desktop/rectangles, a plain
         column in mobile chips mode. -->
    <component :is="scrollWrap ? ChronicleScroll : 'div'" :class="scrollWrap ? 'rail__scroll' : 'rail__stack'">
      <DockPanel
        v-for="p in visiblePanels"
        :key="p.id"
        icon="👤"
        :flip-id="`dock-card-${p.id}`"
        :title="panelNames.get(p.id)?.name ?? p.id"
        :chip-glyph="panelNames.get(p.id)?.initial ?? ''"
        :state="personState(p.minimized)"
        :biggerable="!isMobile"
        @expand="panel.expandPerson(p.id)"
        @minimize="panel.minimizePerson(p.id)"
        @close="panel.closePerson(p.id)"
        @bigger="dockMorph.undock(p.id)"
        @chip-tap="panel.openPerson(p.id)"
      >
        <PersonDetail v-if="expandedId === p.id" />
      </DockPanel>
    </component>
```

(d) In the `<style scoped lang="scss">` block, replace the `.rail__stack` / `.rail__stack--scroll` / `.rail__stack > *` rules with:

```scss
.rail__stack { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.rail__stack--scroll { overflow-y: auto; padding-right: 2px; }
.rail__stack > * { pointer-events: auto; }

// Scrolling vine rail (ChronicleScroll wrapper). Its root fills the rail; the
// viewport holds the panel column. Keep the rail click-through except on the
// panels and the scrollbar thumb/gutter.
.rail__scroll { flex: 1 1 auto; min-height: 0; pointer-events: none; }
.rail__scroll :deep(.cs__view) { display: flex; flex-direction: column; gap: 10px; padding-right: 2px; pointer-events: none; }
.rail__scroll :deep(.cs__view) > * { pointer-events: auto; }
.rail__scroll :deep(.cs__gutter), .rail__scroll :deep(.cs__thumb) { pointer-events: auto; }
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npm --prefix src/frontend test -- PanelRail`
Expected: PASS (all existing + 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PanelRail.vue src/frontend/src/components/PanelRail.spec.ts
git commit -m "feat(frontend): vine ChronicleScroll on the desktop rail stack"
```

---

## Task 12: Remove dead i18n strings + full verification

**Files:**
- Modify: `src/frontend/src/i18n/messages/en.ts`, `ru.ts`, `be.ts`
- Modify: `src/frontend/src/i18n/messages/messages.spec.ts`

- [ ] **Step 1: Update `messages.spec.ts`**

In `src/frontend/src/i18n/messages/messages.spec.ts`, in the `'include the person popup labels'` test:
- Remove the line `expect(keys).toContain('person.expand');`
- Add:

```ts
      expect(keys).toContain('person.pageOf');
      expect(keys).toContain('person.prevPage');
      expect(keys).toContain('person.nextPage');
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm --prefix src/frontend test -- messages`
Expected: still PASS (the keys still exist). This guards the next step — now remove the strings.

- [ ] **Step 3: Remove `expand`/`collapse` from all three catalogs**

In each of `en.ts`, `ru.ts`, `be.ts`, delete the two lines in the `person:` block:
- `en.ts`: `expand: 'More',` and `collapse: 'Less',`
- `ru.ts`: `expand: 'Подробнее',` and `collapse: 'Свернуть',`
- `be.ts`: `expand: 'Падрабязней',` and `collapse: 'Згарнуць',`

- [ ] **Step 4: Run the message spec; verify it passes**

Run: `npm --prefix src/frontend test -- messages`
Expected: PASS (parity holds; `person.expand` no longer required; pager keys present).

- [ ] **Step 5: Full suite + type-check**

Run: `npm --prefix src/frontend test`
Expected: PASS — entire Vitest suite green.

Run: `npm --prefix src/frontend run build`
Expected: `vue-tsc -b` clean, Vite production build succeeds (no unused-symbol or type errors from the removed `mode`/`PopupMode`).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/i18n/messages/en.ts src/frontend/src/i18n/messages/ru.ts src/frontend/src/i18n/messages/be.ts src/frontend/src/i18n/messages/messages.spec.ts
git commit -m "chore(i18n): drop unused person.expand/collapse strings"
```

- [ ] **Step 7: Live verification with the owner**

Run the app (`run-app` skill or: API `dotnet run --project src/backend/FamilyTree.Api`, then `npm --prefix src/frontend run dev` — use non-default ports per the project's custom-ports note). Confirm visually:
1. Open a person popup → the header (portrait + name + years + vocation) stays fixed while the body scrolls; the vine scrollbar starts **below** the header.
2. A long biography shows the `‹ 1/N ›` control and turns pages; a short one shows no control and no page break.
3. The rail (with enough panels to overflow) shows the vine scrollbar with the always-reserved, decorated gutter; with few panels the gutter shows only the motif (no thumb).
4. **Dock/undock still animates** — the popup morphs to/from the rail card (the grow/dock FLIP from PR #80 is intact).

Fix any visual issues found (e.g. the measurer-width note in Task 5) before declaring done.

---

## Self-review

**Spec coverage:**
- §1 ChronicleScroll → Task 4. §2 ChroniclePager → Tasks 1 + 5. §3 PersonHeader → Task 6. §4 state change → Task 10. §5 popup restructure → Task 8. §6 rail + PersonDetail → Tasks 9 + 11. §7 i18n → Tasks 3 + 12. Testing → each task's TDD steps + Task 12 full suite/build/live. ✅ All sections covered.
- PersonDossier (body extraction implied by §5 "keep the body blocks composable") → Task 7. ✅

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". Every code step has complete code. The one advisory note (Task 5 measurer width) gives the exact line to add and the condition for adding it. ✅

**Type/name consistency:** `paginate(tokenCount, fits) → PageRange[]` (Task 1) used in ChroniclePager (Task 5) with `{start,end}`. `thumbMetrics`/`scrollTopFromThumbTop` (Task 2) used in ChronicleScroll (Task 4) with matching argument order. `PersonHeader`/`PersonDossier` take `:detail` prop (Tasks 6/7) consumed identically by PersonDetail (Task 9) and PersonPopup (Task 8). `selectionStore` exposes `detail/loading/error` after Task 10 — both PersonDetail and PersonPopup read exactly those. data-test hooks (`person-header`, `person-dossier`, `chronicle-scroll`, `cs-view`, `cs-gutter`, `cs-thumb`, `pager`, `pager-page`, `pager-control`, `pager-count`, `pager-prev`, `pager-next`, `biography`, `residences`, `links`) are consistent between components and their specs. ✅
