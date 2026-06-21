<script setup lang="ts">
import { computed, onMounted, ref, watch, type ComponentPublicInstance } from 'vue';
import type { TreeLayout, LayoutNode, LayoutLink } from '../layout/treeLayout';
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
import RopeLink from './RopeLink.vue';
import { pinPoints } from './oakConnectors';

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

function branchWidth(link: LayoutLink): number {
  // thicker near the trunk (small absolute generation), thinner toward twigs
  const node = props.layout.nodes.find(n => n.id === link.target);
  const generation = node ? Math.abs(node.generation) : 3;
  return Math.max(0.6, 2.6 - generation * 0.6);
}

const branchOpacity = computed(() => (props.morphProgress == null ? 1 : branchFade(props.morphProgress)));
const film = computed(() => ui.theme === 'eighties');
const pins = computed(() => (film.value ? pinPoints(descentLinks.value, (id) => generationById.value.get(id) ?? 0) : []));

function branchPath(link: LayoutLink): string {
  const o = props.branchOrientation ?? props.orientation ?? 'vertical';
  if (o === 'horizontal') {
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

// Entrance hooks: a link is revealed by the ceremony phase of the generation
// it grows INTO — the child's generation for descent; for a union, the LATER
// of the two partners' generations (mirrors entranceCues' bucketing, so the
// data attribute always matches the phase selector).
const generationById = computed(() => new Map(props.layout.nodes.map(node => [node.id, node.generation])));
function linkGeneration(link: LayoutLink): number {
  const targetGen = generationById.value.get(link.target) ?? 0;
  if (link.kind === 'union') {
    return Math.max(generationById.value.get(link.source) ?? 0, targetGen);
  }
  return targetGen;
}

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
        <template v-if="film">
          <RopeLink
            v-for="link in descentLinks"
            :key="link.id"
            :link="link"
            :orientation="branchOrientation ?? orientation ?? 'vertical'"
            :draw-gen="linkGeneration(link)"
          />
        </template>
        <template v-else>
          <path
            v-for="link in descentLinks"
            :key="link.id"
            data-test="branch"
            :data-link-id="link.id"
            :data-entrance-draw="linkGeneration(link)"
            :d="branchPath(link)"
            :stroke-width="branchWidth(link)"
            fill="none"
            stroke-linecap="round"
            class="oak__branch"
          />
        </template>
      </g>

      <g v-if="film" class="oak__pins" :style="{ opacity: branchOpacity }" aria-hidden="true">
        <g v-for="p in pins" :key="p.key" data-test="pin" :data-entrance-fade="p.fadeGen" :transform="`translate(${p.x} ${p.y})`">
          <circle class="oak__pin-shadow" cx="0" cy="1" r="3.4" />
          <circle class="oak__pin-head" cx="0" cy="0" r="3.2" />
          <circle class="oak__pin-spec" cx="-1" cy="-1" r="1" />
        </g>
      </g>

      <g class="oak__unions" :style="{ opacity: branchOpacity }">
        <line
          v-for="link in unionLinks"
          :key="link.id"
          :x1="link.x1" :y1="link.y1" :x2="link.x2" :y2="link.y2"
          :data-entrance-fade="linkGeneration(link)"
          class="oak__union"
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

  &__pin-shadow { fill: #000; opacity: 0.4; }
  &__pin-head { fill: var(--pin); }
  &__pin-spec { fill: #fff; opacity: 0.7; }

  &__branch {
    stroke: var(--bark);
  }
  &__union {
    stroke: var(--bark-dark);
    stroke-width: 1.2;
    stroke-dasharray: 2 3;
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
