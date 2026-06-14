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
