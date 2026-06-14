<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { scrollTopFromThumbTop, thumbMetrics } from '../scroll/scrollThumb';

const viewEl = ref<HTMLElement | null>(null);
const contentEl = ref<HTMLElement | null>(null);
const gutterEl = ref<HTMLElement | null>(null);
const thumbEl = ref<HTMLElement | null>(null);

const visible = ref(false);
const thumbH = ref(0);
const thumbTop = ref(0);

// Cached scroll metrics. `measure()` reads layout (scrollHeight/clientHeight) and
// resizes the thumb; it runs only on mount and on a ResizeObserver callback,
// which fire AFTER layout — so the reads are cheap, not forced reflows.
// `reposition()` recomputes only the thumb offset from scrollTop against that
// cache, so it can run on every scroll event without reading layout. This split
// is what keeps min↔max smooth: resize-induced scroll events used to read
// scrollHeight every frame and forced a reflow each time (the dominant jank).
let scrollH = 0;
let viewH = 0;
let trackH = 0;

function measure(): void {
  const view = viewEl.value;
  const gutter = gutterEl.value;
  if (!view || !gutter) {
    return;
  }
  scrollH = view.scrollHeight;
  viewH = view.clientHeight;
  trackH = gutter.clientHeight;
  const m = thumbMetrics(view.scrollTop, scrollH, viewH, trackH);
  visible.value = m.visible;
  thumbH.value = m.height;
  thumbTop.value = m.top;
}

function reposition(): void {
  const view = viewEl.value;
  if (!view || !visible.value) {
    return;
  }
  thumbTop.value = thumbMetrics(view.scrollTop, scrollH, viewH, trackH).top;
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
  if (!dragging || !view) {
    return;
  }
  const nextTop = dragStartTop + (e.clientY - dragStartY);
  view.scrollTop = scrollTopFromThumbTop(nextTop, thumbH.value, trackH, scrollH, viewH);
  reposition();
}

function onPointerUp(e: PointerEvent): void {
  dragging = false;
  if (thumbEl.value?.releasePointerCapture) {
    thumbEl.value.releasePointerCapture(e.pointerId);
  }
}

// Observe BOTH the viewport and the content so the thumb is re-measured whenever
// there is more/less to scroll (panel expand, pagination, the min↔max animation)
// — not only on a scroll event.
//
// A size animation fires the RO every frame, and measure() reads scrollHeight of
// the (heavy) content, forcing a reflow each time — the dominant min↔max jank.
// Coalesce the RO-driven re-measure to run once after the size settles. Scroll and
// drag stay live via reposition() (cached metrics, no layout read).
let observer: ResizeObserver | null = null;
let measureTimer = 0;
function scheduleMeasure(): void {
  clearTimeout(measureTimer);
  measureTimer = window.setTimeout(measure, 150);
}
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(scheduleMeasure);
    if (viewEl.value) {
      observer.observe(viewEl.value);
    }
    if (contentEl.value) {
      observer.observe(contentEl.value);
    }
  }
});
onBeforeUnmount(() => {
  clearTimeout(measureTimer);
  observer?.disconnect();
});
</script>

<template>
  <div class="cs" data-test="chronicle-scroll">
    <div ref="viewEl" class="cs__view" data-test="cs-view" @scroll="reposition">
      <div ref="contentEl" class="cs__content"><slot /></div>
    </div>
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
.cs { position: relative; min-height: 0; display: flex; }
.cs__view {
  flex: 1 1 auto; min-width: 0;
  overflow-y: scroll; scrollbar-width: none;
  padding-right: var(--cs-gutter, 14px);
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
