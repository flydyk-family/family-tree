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
  // Wrap the probe at the real page column width so its measured height matches
  // what the visible page will render — otherwise it shrinks to content (one long
  // line), under-measures, and pagination never triggers (text gets clipped).
  measure.style.width = page.clientWidth + 'px';
  measure.textContent = tokens.value.slice(start, end).join('');
  return measure.scrollHeight <= page.clientHeight;
}

// The page box (width × height) the current pagination was measured against.
// Re-paginating is only needed when that box actually changes.
let pagedW = -1;
let pagedH = -1;
function repaginate(): void {
  const page = pageEl.value;
  if (page) {
    pagedW = page.clientWidth;
    pagedH = page.clientHeight;
  }
  pages.value = paginate(tokens.value.length, fits);
  if (current.value > pages.value.length - 1) {
    current.value = Math.max(0, pages.value.length - 1);
  }
}

const total = computed(() => pages.value.length);
const showControl = computed(() => total.value > 1);
const pageText = computed(() => {
  // With a single page, show the full text verbatim — no slicing needed and the
  // mock end-index in tests may not cover all tokens.
  if (total.value <= 1) {
    return props.text.replace(/^\s+/, '');
  }
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

// Run an initial paginate at setup time (refs are null → fits always returns true,
// so the real DOM measurement is deferred to onMounted). In tests the mock
// overrides paginate, so the correct page ranges are available for the first
// render without waiting for a Vue flush. Tests must configure the paginate mock
// BEFORE mount(), since this setup-time call fires immediately.
repaginate();

// Re-paginating runs a measure-heavy binary search, so a size animation that
// fires the RO every frame caused a per-frame "repagination storm" (the dominant
// source of min↔max jank). Coalesce RO-driven re-paginations to run once after
// the size settles; the mount and text-change paths stay immediate so the first
// render is correct.
let observer: ResizeObserver | null = null;
let repaginateTimer = 0;

// Whether a (measure-heavy) repagination is worth running. Skip when the pager is
// collapsed (height 0 — a minimized rail panel: it re-paginates on expand) and
// when the page box is unchanged since the last pagination (a height-only min↔max
// that clips the body without resizing the pager). Both keep min↔max free.
function shouldRepaginate(): boolean {
  const page = pageEl.value;
  if (!page || page.clientHeight === 0) {
    return false;
  }
  return page.clientWidth !== pagedW || page.clientHeight !== pagedH;
}
function scheduleRepaginate(): void {
  clearTimeout(repaginateTimer);
  repaginateTimer = window.setTimeout(() => {
    if (shouldRepaginate()) {
      repaginate();
    }
  }, 120);
}
// Defer the first (measure-heavy) pagination off the critical path so its forced
// reflows never block the panel's expand animation. The setup-time call already
// rendered a single-page fallback, so the body stays correct until this runs.
let cancelDefer: (() => void) | null = null;
function deferRepaginate(): void {
  const run = () => {
    if (shouldRepaginate()) {
      repaginate();
    }
  };
  if (typeof requestIdleCallback === 'function') {
    const h = requestIdleCallback(run, { timeout: 200 });
    cancelDefer = () => cancelIdleCallback(h);
  } else {
    const h = window.setTimeout(run, 32);
    cancelDefer = () => clearTimeout(h);
  }
}
onMounted(() => {
  deferRepaginate();
  if (typeof ResizeObserver !== 'undefined' && pageEl.value) {
    observer = new ResizeObserver(scheduleRepaginate);
    observer.observe(pageEl.value);
  }
});
onBeforeUnmount(() => {
  cancelDefer?.();
  clearTimeout(repaginateTimer);
  observer?.disconnect();
});
watch(() => props.text, () => { current.value = 0; repaginate(); });
</script>

<template>
  <div class="pager" data-test="pager">
    <div ref="pageEl" class="pager__page" data-test="pager-page" aria-live="polite" aria-atomic="true">{{ pageText }}</div>
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
// height predicts the real page height. Width is set to pageEl.clientWidth in
// fits() at measure time (the static rule below only fixes typography).
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
