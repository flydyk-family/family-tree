<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { TreeLayout, LayoutNode, LayoutLink } from '../layout/treeLayout';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { usePanZoom } from '../interactions/usePanZoom';
import type { Bounds, Viewport } from '../interactions/panZoom';

const props = defineProps<{ layout: TreeLayout; selectedId?: string | null }>();
const emit = defineEmits<{ select: [id: string]; viewport: [Viewport] }>();

const localeStore = useLocaleStore();

const boundsRef = computed<Bounds>(() => props.layout.bounds);
const {
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
} = usePanZoom({ boundsRef });

// Surface the pan/zoom viewport so the year axis can apply the same vertical
// transform and stay aligned with the nodes.
watch(viewport, value => emit('viewport', value), { immediate: true });

// Hide the oak until usePanZoom's onMounted fit has positioned it, so the
// first paint never shows the tree at the raw identity transform.
const ready = ref(false);
onMounted(() => {
  ready.value = true;
});

function displayName(node: LayoutNode): string {
  return localize(node.person.givenName, localeStore.currentLocale);
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
  return Math.max(2, 12 - generation * 2.5);
}

function branchPath(link: LayoutLink): string {
  // organic vertical-ish curve from parent to child
  const midY = (link.y1 + link.y2) / 2;
  return `M ${link.x1} ${link.y1} C ${link.x1} ${midY}, ${link.x2} ${midY}, ${link.x2} ${link.y2}`;
}

function nodeRadius(node: LayoutNode): number {
  if (node.role === 'trunk') {
    return 11;
  }
  if (node.role === 'leaf') {
    return 7;
  }
  return 9;
}

const descentLinks = computed(() => props.layout.links.filter(link => link.kind === 'descent'));
const unionLinks = computed(() => props.layout.links.filter(link => link.kind === 'union'));
</script>

<template>
  <svg
    ref="svgRef"
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
          v-for="node in layout.nodes"
          :key="node.id"
          data-test="node"
          role="button"
          tabindex="0"
          :aria-label="displayName(node)"
          :transform="`translate(${node.x}, ${node.y})`"
          :class="['oak__node', `oak__node--${node.role}`, { 'oak__node--selected': node.id === selectedId }]"
          @click="onNodeActivate(node)"
          @keydown.enter.prevent="onNodeActivate(node)"
          @keydown.space.prevent="onNodeActivate(node)"
        >
          <circle :r="nodeRadius(node)" class="oak__medallion" />
          <text y="-14" text-anchor="middle" class="oak__name">{{ displayName(node) }}</text>
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
    &:focus-visible { outline: none; }
    &:focus-visible .oak__medallion { stroke: var(--leaf-deep); stroke-width: 3; }
  }
  &__node--selected .oak__medallion {
    stroke: var(--leaf-deep);
    stroke-width: 3.5;
  }

  &__branch {
    stroke: var(--bark);
  }
  &__union {
    stroke: var(--bark-dark);
    stroke-width: 2;
    stroke-dasharray: 2 3;
  }
  &__medallion {
    fill: var(--parchment-2);
    stroke: var(--ink-soft);
    stroke-width: 1.5;
  }
  &__node--leaf .oak__medallion {
    fill: var(--leaf);
    stroke: var(--leaf-deep);
  }
  &__node--trunk .oak__medallion {
    stroke-width: 2.5;
  }
  &__name {
    fill: var(--ink);
    font-size: 11px;
    font-family: Georgia, serif;
  }
}
</style>
