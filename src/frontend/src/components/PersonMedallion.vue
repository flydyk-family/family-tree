<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { LayoutNode } from '../layout/treeLayout';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatYearSpan } from '../format/lifespan';
import { mediaUrl } from '../media/mediaUrl';
import { frameGeom } from './medallion/geometry';
import { frameGold, overlayForState } from './medallion/frameAssets';
import { nameFontSize } from './medallion/nameFit';
import { fadeTo, setOpacity } from '../motion/fade';

const props = defineProps<{ node: LayoutNode; selected?: boolean; match?: boolean }>();

const localeStore = useLocaleStore();

const g = computed(() => frameGeom(props.node.role));
const givenName = computed(() => localize(props.node.person.givenName, localeStore.currentLocale));
const surname = computed(() => localize(props.node.person.surname, localeStore.currentLocale));
const fullName = computed(() => [givenName.value, surname.value].filter(s => s).join(' '));
const lifespan = computed(() => formatYearSpan(props.node.person.birthYear, props.node.person.deathYear));
const portraitHref = computed(() =>
  props.node.person.portrait ? mediaUrl('portraits', props.node.person.portrait) : null
);
const initial = computed(() => givenName.value.trim().charAt(0).toLocaleUpperCase());
const clipId = computed(() => `oak-oval-${props.node.id}`);
const nameSize = computed(() => nameFontSize(fullName.value, g.value.nameMax));

// Active state overlay (match wins over selected); null = plain gold. `overlayHref`
// keeps the last variant during fade-out so the colour doesn't pop to gold mid-fade.
const overlay = computed(() => overlayForState(props.selected === true, props.match === true));
const overlayHref = ref<string>(overlay.value ?? frameGold);
const overlayEl = ref<SVGImageElement | null>(null);
const portraitEl = ref<SVGImageElement | null>(null);

function onPortraitLoad(): void {
  fadeTo(portraitEl.value, 1);
}

// Seed the overlay's opacity at mount (visible only if already selected/matched).
// Also seed the portrait at 0 so it fades in over the dark mount on load.
onMounted(() => {
  setOpacity(overlayEl.value, overlay.value ? 1 : 0);
  if (portraitHref.value) {
    setOpacity(portraitEl.value, 0);
  }
});

// Enter/leave a highlighted state crossfades the single overlay's opacity. When a
// state is active we point the href at its variant first (and keep that href during
// fade-out so the colour doesn't pop to gold mid-fade). A selected→match swap (both
// highlighted) just re-points the href at opacity 1 — an instant colour change, not
// a crossfade; intentional, the two-image design trades that rare edge for a light DOM.
watch(overlay, next => {
  if (next) {
    overlayHref.value = next;
  }
  fadeTo(overlayEl.value, next ? 1 : 0);
});
</script>

<template>
  <g class="oak__medallion-card">
    <!-- dark mount: shows where the zoomed-out portrait doesn't reach the oval -->
    <ellipse class="oak__mount" :rx="g.ovalRx" :ry="g.ovalRy" />

    <!-- portrait (or monogram fallback), clipped to the oval -->
    <clipPath :id="clipId"><ellipse :rx="g.ovalRx" :ry="g.ovalRy" /></clipPath>
    <image
      v-if="portraitHref"
      ref="portraitEl"
      data-test="portrait"
      :href="portraitHref"
      :x="-(g.portraitZoom * g.w) / 2"
      :y="-(g.portraitZoom * g.h) / 2 + g.portraitOffsetY"
      :width="g.portraitZoom * g.w"
      :height="g.portraitZoom * g.h"
      preserveAspectRatio="xMidYMid slice"
      :clip-path="`url(#${clipId})`"
      @load="onPortraitLoad"
    />
    <text
      v-else
      class="oak__initial"
      aria-hidden="true"
      text-anchor="middle"
      :y="g.ovalRy * 0.34"
      :style="{ fontSize: `${g.ovalRx * 0.9}px` }"
    >{{ initial }}</text>

    <!-- inner vignette seats the portrait into the frame -->
    <ellipse class="oak__vignette" :rx="g.ovalRx" :ry="g.ovalRy" fill="url(#oak-vignette)" />

    <!-- frame: base gold + state overlay (lit-gold / green-gold) crossfaded -->
    <image
      class="oak__frame"
      :href="frameGold"
      :x="g.frameX" :y="g.frameY" :width="g.w" :height="g.h"
      preserveAspectRatio="none"
    />
    <image
      ref="overlayEl"
      class="oak__frame-overlay"
      :href="overlayHref"
      :x="g.frameX" :y="g.frameY" :width="g.w" :height="g.h"
      preserveAspectRatio="none"
    />

    <!-- name + years in the banner -->
    <text
      class="oak__name"
      text-anchor="middle"
      :y="g.nameY"
      :style="{ fontSize: `${nameSize}px` }"
    >{{ fullName }}</text>
    <text
      v-if="lifespan"
      class="oak__dates"
      data-test="lifespan"
      text-anchor="middle"
      :y="g.yearsY"
      :style="{ fontSize: `${g.yearsSize}px` }"
    >{{ lifespan }}</text>
  </g>
</template>

<style scoped lang="scss">
.oak__mount {
  fill: #241a0d; // dark cameo mount
}
.oak__vignette {
  pointer-events: none;
}
.oak__name {
  font-family: var(--font-display);
  font-weight: 600;
  fill: #2b2113;
}
.oak__dates {
  font-family: var(--font-body);
  fill: #5e4a26;
}
.oak__initial {
  font-family: var(--font-display);
  font-weight: 600;
  fill: var(--gilt-light);
  opacity: 0.7;
}
</style>
