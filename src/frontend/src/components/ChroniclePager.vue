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
// height predicts the real page height. Width is inherited from the flow.
// TODO(Task 12): if live verification shows breaks ignoring width, set
// measure.style.width = pageEl.clientWidth + 'px' at the top of fits().
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
