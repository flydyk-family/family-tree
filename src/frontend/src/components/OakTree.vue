<script setup lang="ts">
import { computed, onMounted, ref, watch, type ComponentPublicInstance } from 'vue';
import type { TreeLayout, LayoutNode, LayoutLink } from '../layout/treeLayout';
import { initialFocusBounds } from '../layout/focusBounds';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { useUiStore } from '../stores/uiStore';
import { usePanZoom } from '../interactions/usePanZoom';
import PersonMedallion from './PersonMedallion.vue';
import type { Bounds, Viewport } from '../interactions/panZoom';

const props = defineProps<{ layout: TreeLayout; selectedId?: string | null; orientation?: 'vertical' | 'horizontal' }>();
const emit = defineEmits<{ select: [id: string]; viewport: [Viewport] }>();

const localeStore = useLocaleStore();
const ui = useUiStore();

const boundsRef = computed<Bounds>(() => props.layout.bounds);
const initialBoundsRef = computed<Bounds>(() => initialFocusBounds(props.layout.nodes));
const {
  fit,
  svgRef,
  viewport,
  transform,
  dragMoved,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTouchStart,
  onTouchMove,
  onTouchEnd
  // Cap the initial fit so the focused band is never enlarged past natural size;
  // on large (1080p/2K) displays this avoids an over-zoomed default view.
} = usePanZoom({ boundsRef, initialBoundsRef, maxScale: 1 });

// usePanZoom owns the <svg> ref, so wire it via a stable function ref. A bare
// string ref="svgRef" isn't recognised as a read by vue-tsc (reported unused),
// and a dynamic :ref="svgRef" would auto-unwrap to the element rather than the
// ref object — the function form populates svgRef.value correctly.
function setSvgRef(el: Element | ComponentPublicInstance | null): void {
  svgRef.value = el as SVGSVGElement | null;
}

// Surface the pan/zoom viewport so the year axis can apply the same vertical
// transform and stay aligned with the nodes.
watch(viewport, value => emit('viewport', value), { immediate: true });

// An orientation flip transposes the layout's coordinate space. Re-fit the camera
// unconditionally (even if the user has panned/zoomed) so the oak is never left offscreen.
watch(() => props.orientation, () => { fit(); }, { flush: 'post' });

// Hide the oak until usePanZoom's onMounted fit has positioned it, so the
// first paint never shows the tree at the raw identity transform.
const ready = ref(false);
onMounted(() => {
  ready.value = true;
});

function displayName(node: LayoutNode): string {
  return localize(node.person.givenName, localeStore.currentLocale);
}

function isMatch(node: LayoutNode): boolean {
  const q = ui.search.trim().toLowerCase();
  if (!q) {
    return false;
  }
  const given = localize(node.person.givenName, localeStore.currentLocale).toLowerCase();
  const surname = localize(node.person.surname, localeStore.currentLocale).toLowerCase();
  return given.includes(q) || surname.includes(q);
}

function onNodeActivate(node: LayoutNode): void {
  // Ignore the click that ends a pan drag.
  if (dragMoved.value) {
    return;
  }
  emit('select', node.id);
}

function branchWidth(link: LayoutLink): number {
  // thicker near the trunk (small absolute generation), thinner toward twigs
  const node = props.layout.nodes.find(n => n.id === link.target);
  const generation = node ? Math.abs(node.generation) : 3;
  return Math.max(0.6, 2.6 - generation * 0.6);
}

function branchPath(link: LayoutLink): string {
  if ((props.orientation ?? 'vertical') === 'horizontal') {
    // organic horizontal-ish curve from parent to child (time runs along X)
    const midX = (link.x1 + link.x2) / 2;
    return `M ${link.x1} ${link.y1} C ${midX} ${link.y1}, ${midX} ${link.y2}, ${link.x2} ${link.y2}`;
  }
  // organic vertical-ish curve from parent to child
  const midY = (link.y1 + link.y2) / 2;
  return `M ${link.x1} ${link.y1} C ${link.x1} ${midY}, ${link.x2} ${midY}, ${link.x2} ${link.y2}`;
}

const descentLinks = computed(() => props.layout.links.filter(link => link.kind === 'descent'));
const unionLinks = computed(() => props.layout.links.filter(link => link.kind === 'union'));
</script>

<template>
  <svg
    :ref="setSvgRef"
    class="oak"
    data-test="oak-svg"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
    @touchstart.passive="onTouchStart"
    @touchmove.prevent="onTouchMove"
    @touchend="onTouchEnd"
  >
    <defs>
      <!-- rolled-paper shading for the scroll cartouche ends -->
      <linearGradient id="oak-roll" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" style="stop-color: #c9bb9a" />
        <stop offset="48%" style="stop-color: #efe7d4" />
        <stop offset="100%" style="stop-color: #c2b393" />
      </linearGradient>
      <!-- portrait-disc tints, cycled per node so the oak reads as a coloured chronicle -->
      <radialGradient id="oak-tint-0" cx="40%" cy="32%" r="75%"><stop offset="0%" stop-color="#f0d9b8" /><stop offset="100%" stop-color="#b98b63" /></radialGradient>
      <radialGradient id="oak-tint-1" cx="40%" cy="32%" r="75%"><stop offset="0%" stop-color="#d9e0c2" /><stop offset="100%" stop-color="#8fa06a" /></radialGradient>
      <radialGradient id="oak-tint-2" cx="40%" cy="32%" r="75%"><stop offset="0%" stop-color="#cfd9df" /><stop offset="100%" stop-color="#7d94a3" /></radialGradient>
      <radialGradient id="oak-tint-3" cx="40%" cy="32%" r="75%"><stop offset="0%" stop-color="#f1dcae" /><stop offset="100%" stop-color="#c79a4f" /></radialGradient>
      <radialGradient id="oak-tint-4" cx="40%" cy="32%" r="75%"><stop offset="0%" stop-color="#eccdb6" /><stop offset="100%" stop-color="#b9744f" /></radialGradient>
      <radialGradient id="oak-tint-5" cx="40%" cy="32%" r="75%"><stop offset="0%" stop-color="#e0d2e0" /><stop offset="100%" stop-color="#9c84a8" /></radialGradient>
    </defs>

    <g class="oak__viewport" :transform="transform" :style="{ opacity: ready ? 1 : 0 }">
      <g class="oak__branches">
        <path
          v-for="link in descentLinks"
          :key="link.id"
          data-test="branch"
          :d="branchPath(link)"
          :stroke-width="branchWidth(link)"
          fill="none"
          stroke-linecap="round"
          class="oak__branch"
        />
      </g>

      <g class="oak__unions">
        <line
          v-for="link in unionLinks"
          :key="link.id"
          :x1="link.x1" :y1="link.y1" :x2="link.x2" :y2="link.y2"
          class="oak__union"
        />
      </g>

      <g class="oak__nodes">
        <g
          v-for="(node, index) in layout.nodes"
          :key="node.id"
          data-test="node"
          role="button"
          tabindex="0"
          :aria-label="displayName(node)"
          :transform="`translate(${node.x}, ${node.y})`"
          :class="['oak__node', `oak__node--${node.role}`, { 'oak__node--selected': node.id === selectedId, 'oak__node--match': isMatch(node) }]"
          @click="onNodeActivate(node)"
          @keydown.enter.prevent="onNodeActivate(node)"
          @keydown.space.prevent="onNodeActivate(node)"
        >
          <PersonMedallion :node="node" :selected="node.id === selectedId" :tint-index="index" />
        </g>
      </g>
    </g>
  </svg>
</template>

<style scoped lang="scss">
.oak {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none; // we handle pan/pinch ourselves
  cursor: grab;
  user-select: none;

  &:active { cursor: grabbing; }

  &__viewport {
    transition: opacity 0.15s ease;
  }

  &__node {
    cursor: pointer;
    // Suppress the UA's rectangular focus outline for both mouse (:focus) and
    // keyboard focus; keyboard users get the oval ring via the :focus-visible
    // :deep(.oak__medallion) rule below, so accessibility is preserved.
    &:focus { outline: none; }
  }

  &__branch {
    stroke: var(--bark);
  }
  &__union {
    stroke: var(--bark-dark);
    stroke-width: 1.2;
    stroke-dasharray: 2 3;
  }
}

// The medallion lives in the PersonMedallion child; pierce scope to apply the
// keyboard-focus highlight to its frame ellipses.
.oak__node:focus-visible :deep(.oak__medallion) {
  stroke: var(--leaf-deep);
  stroke-width: 3;
}

.oak__node--match :deep(.oak__medallion) { stroke: var(--leaf-bright); stroke-width: 3.5; }
</style>
