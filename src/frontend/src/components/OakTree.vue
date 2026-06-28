<script setup lang="ts">
import { computed, onMounted, ref, watch, type ComponentPublicInstance } from 'vue';
import type { TreeLayout, LayoutNode } from '../layout/treeLayout';
import { defaultRootFocusBounds, defaultRootFocal } from '../layout/focusBounds';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { useUiStore } from '../stores/uiStore';
import { usePanZoom } from '../interactions/usePanZoom';
import { useMediaQuery, MOBILE_MEDIA_QUERY } from '../composables/useMediaQuery';
import { personMatchesQuery } from '../composables/useSearchMatches';
import PersonMedallion from './PersonMedallion.vue';
import type { Bounds, CenterRequest, Viewport } from '../interactions/panZoom';
import { fadeIn } from '../motion/fade';
import { branchFade } from '../motion/layoutFlip';
import type { EntranceCues } from '../motion/entranceCues';
import { hoverLift } from '../motion/interactions';
import EightiesDefs from './medallion/eighties/EightiesDefs.vue';
import FamilyConnector from './FamilyConnector.vue';
import type { Axis } from '../layout/familyRouting';

const props = defineProps<{
  layout: TreeLayout;
  selectedId?: string | null;
  orientation?: 'vertical' | 'horizontal';
  branchOrientation?: 'vertical' | 'horizontal';
  morphProgress?: number;
  centerRequest?: CenterRequest | null;
  entranceCues?: EntranceCues | null;
  ceremonyActive?: boolean;
}>();
const emit = defineEmits<{ select: [id: string]; viewport: [Viewport] }>();

const localeStore = useLocaleStore();
const ui = useUiStore();

const boundsRef = computed<Bounds>(() => props.layout.bounds);
const initialBoundsRef = computed<Bounds>(() => defaultRootFocusBounds(props.layout.nodes));
// Keep the root in view as the anchor of the (single-axis) compact fit.
const initialFocalRef = computed(() => defaultRootFocal(props.layout.nodes));
// On compact screens, focus fits keep cards readable by fitting the family's
// time axis and letting siblings overflow (see usePanZoom.familyFitMode).
const isCompact = useMediaQuery(MOBILE_MEDIA_QUERY);
const {
  svgRef,
  viewport,
  transform,
  dragMoved,
  isPanning,
  centerOnPoint,
  viewportCenterContent,
  recenterOn,
  animateFitTo,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTouchStart,
  onTouchMove,
  onTouchEnd
  // Cap the initial fit so the focused band is never enlarged past natural size;
  // on large (1080p/2K) displays this avoids an over-zoomed default view.
} = usePanZoom({ boundsRef, initialBoundsRef, initialFocalRef, maxScale: 1, compactRef: isCompact });

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

// Search navigation: glide the camera to the requested person. Watches layout
// too, so a search re-focus re-centers the target at its new coordinates
// (any layout replacement re-fires this — intended).
watch(
  [() => props.centerRequest, () => props.layout],
  ([request]) => {
    if (!request) {
      return;
    }
    const node = props.layout.nodes.find(n => n.id === request.id);
    if (node) {
      centerOnPoint({ x: node.x, y: node.y });
    }
  },
  { flush: 'post' }
);

// Hidden (inline opacity:0) until usePanZoom's onMounted fit has positioned
// the tree, then faded in by GSAP — the first paint never shows the raw
// identity transform. usePanZoom registered its onMounted first, so fit()
// has already run when this hook fires.
const viewportEl = ref<SVGGElement | null>(null);
onMounted(() => {
  if (viewportEl.value) {
    fadeIn(viewportEl.value);
  } else if (import.meta.env.DEV) {
    console.warn('[OakTree] viewportEl missing at mount — the oak stays hidden');
  }
});

function displayName(node: LayoutNode): string {
  return localize(node.person.givenName, localeStore.currentLocale);
}

function isMatch(node: LayoutNode): boolean {
  return personMatchesQuery(node.person, ui.search, localeStore.currentLocale);
}

function onNodeActivate(node: LayoutNode): void {
  // Ignore the click that ends a pan drag.
  if (dragMoved.value) {
    return;
  }
  emit('select', node.id);
}

function onNodeHover(event: PointerEvent, lifted: boolean): void {
  // The ceremony drives node transforms; don't let a hover tween fight it.
  if (props.ceremonyActive) {
    return;
  }
  // currentTarget is the node <g> the listener is bound to (never null during
  // dispatch); querySelector returns Element | null, which hoverLift handles.
  const nodeEl = event.currentTarget as Element;
  hoverLift(nodeEl.querySelector('.oak__medallion-card'), lifted);
}

const branchOpacity = computed(() => (props.morphProgress == null ? 1 : branchFade(props.morphProgress)));
const film = computed(() => ui.theme === 'eighties');

const nodeById = computed(() => new Map(props.layout.nodes.map(node => [node.id, node])));
const connectorAxis = computed<Axis>(() =>
  (props.branchOrientation ?? props.orientation ?? 'vertical') === 'horizontal' ? 'x' : 'y'
);

// The ceremony composable needs the raw refs; template-ref exposure would
// auto-unwrap them, so hand them out through a function instead.
defineExpose({
  entranceTargets: () => ({ svg: svgRef.value, viewport }),
  animateFitTo,
  viewportCenterContent,
  recenterOn
});
</script>

<template>
  <svg
    :ref="setSvgRef"
    class="oak"
    :class="{ 'oak--panning': isPanning }"
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
      <!-- inner vignette that seats each portrait into its oval (per-ellipse via objectBoundingBox) -->
      <radialGradient id="oak-vignette" cx="50%" cy="32%" r="72%">
        <stop offset="62%" stop-color="#1c1207" stop-opacity="0" />
        <stop offset="100%" stop-color="#1c1207" stop-opacity="0.42" />
      </radialGradient>
      <!-- entrance ceremony: the dawn-light head, plus its comet trace (vertical / horizontal axes) -->
      <radialGradient id="oak-dawn">
        <stop offset="0%" stop-color="#e3cf93" stop-opacity="0.5" />
        <stop offset="100%" stop-color="#e3cf93" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="oak-trace" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e3cf93" stop-opacity="0.55" />
        <stop offset="100%" stop-color="#e3cf93" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="oak-trace-h" x1="1" y1="0" x2="0" y2="0">
        <stop offset="0%" stop-color="#e3cf93" stop-opacity="0.55" />
        <stop offset="100%" stop-color="#e3cf93" stop-opacity="0" />
      </linearGradient>
      <EightiesDefs />
    </defs>

    <g ref="viewportEl" class="oak__viewport" :transform="transform" style="opacity: 0">
      <g v-if="entranceCues" class="oak__strata" aria-hidden="true" data-test="strata">
        <template v-if="entranceCues.axis === 'y'">
          <g v-for="s in entranceCues.strata" :key="s.generation" class="oak__stratum" :data-stratum-gen="s.generation">
            <line class="oak__stratum-line" :x1="layout.bounds.minX - 400" :x2="layout.bounds.maxX + 400" :y1="s.linePos" :y2="s.linePos" />
            <text class="oak__stratum-year" :x="s.crossRide" :y="s.linePos - 12" :text-anchor="s.side === 'end' ? 'end' : 'start'">{{ s.label }}</text>
          </g>
        </template>
        <template v-else>
          <g v-for="s in entranceCues.strata" :key="s.generation" class="oak__stratum" :data-stratum-gen="s.generation">
            <line class="oak__stratum-line" :x1="s.linePos" :x2="s.linePos" :y1="layout.bounds.minY - 400" :y2="layout.bounds.maxY + 400" />
            <text class="oak__stratum-year" :x="s.linePos + 12" :y="s.crossRide" text-anchor="start" dominant-baseline="middle">{{ s.label }}</text>
          </g>
        </template>

        <!-- comet tail: vertical hangs below the head; horizontal trails left of it -->
        <rect
          v-if="entranceCues.axis === 'y'"
          data-entrance-trace
          :x="entranceCues.dawnCross - 4"
          :y="entranceCues.phases[0]?.bandPrimary ?? 0"
          width="8" height="360" rx="4"
          fill="url(#oak-trace)"
        />
        <rect
          v-else
          data-entrance-trace
          :x="(entranceCues.phases[0]?.bandPrimary ?? 0) - 360"
          :y="entranceCues.dawnCross - 4"
          width="360" height="8" rx="4"
          fill="url(#oak-trace-h)"
        />

        <circle
          data-entrance-dawn
          :cx="entranceCues.axis === 'y' ? entranceCues.dawnCross : (entranceCues.phases[0]?.bandPrimary ?? 0)"
          :cy="entranceCues.axis === 'y' ? (entranceCues.phases[0]?.bandPrimary ?? 0) : entranceCues.dawnCross"
          r="150" fill="url(#oak-dawn)"
        />
        <circle
          data-entrance-star
          :cx="entranceCues.axis === 'y' ? entranceCues.dawnCross : (entranceCues.phases[0]?.bandPrimary ?? 0)"
          :cy="entranceCues.axis === 'y' ? (entranceCues.phases[0]?.bandPrimary ?? 0) : entranceCues.dawnCross"
          r="28" fill="#fffaf0"
        />
      </g>

      <g class="oak__branches" :style="{ opacity: branchOpacity }">
        <FamilyConnector
          v-for="u in layout.unions"
          :key="u.id"
          :union="u"
          :node-by-id="nodeById"
          :axis="connectorAxis"
          :film="film"
        />
      </g>

      <g class="oak__nodes">
        <g
          v-for="node in layout.nodes"
          :key="node.id"
          data-test="node"
          :data-node-id="node.id"
          :data-entrance-node="node.generation"
          role="button"
          tabindex="0"
          :aria-label="displayName(node)"
          :transform="`translate(${node.x}, ${node.y})`"
          :class="['oak__node', `oak__node--${node.role}`, { 'oak__node--selected': node.id === selectedId, 'oak__node--match': isMatch(node) }]"
          @click="onNodeActivate(node)"
          @keydown.enter.prevent="onNodeActivate(node)"
          @keydown.space.prevent="onNodeActivate(node)"
          @pointerenter="onNodeHover($event, true)"
          @pointerleave="onNodeHover($event, false)"
        >
          <PersonMedallion :node="node" :selected="node.id === selectedId" :match="isMatch(node)" />
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

  // While a pan gesture is in flight, promote the whole tree to its own
  // compositor layer so dragging translates a cached raster instead of
  // repainting every node/connector each frame. The layer is created once at
  // drag start and dropped on release.
  &--panning &__viewport { will-change: transform; }

  &__node {
    cursor: pointer;
    // Suppress the UA's rectangular focus outline for both mouse (:focus) and
    // keyboard focus; keyboard users get the gilt glow via the :focus-visible
    // :deep(.oak__frame) rule below, so accessibility is preserved.
    &:focus { outline: none; }
  }

  &__stratum-line {
    stroke: var(--ink-soft);
    stroke-width: 1;
    opacity: 0.24;
  }
  &__stratum-year {
    font-family: var(--font-display);
    font-size: 64px;
    fill: var(--gilt-deep);
    fill-opacity: 0.32;
  }
}

// The medallion lives in the PersonMedallion child; pierce scope to apply the
// keyboard-focus highlight to its frame image.
.oak__node:focus-visible :deep(.oak__frame) {
  filter: drop-shadow(0 0 4px #ffe79e) drop-shadow(0 0 9px rgba(255, 231, 158, 0.6));
}

</style>
