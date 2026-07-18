<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { LayoutNode } from '../layout/treeLayout';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatYearSpan } from '../format/lifespan';
import { resolveMediaUrl } from '../media/mediaUrl';
import { frameGeom } from './medallion/geometry';
import { frameGold, overlayForState } from './medallion/frameAssets';
import { nameFontSize } from './medallion/nameFit';
import { useUiStore } from '../stores/uiStore';
import EightiesMedallion from './medallion/eighties/EightiesMedallion.vue';

const props = defineProps<{ node: LayoutNode; selected?: boolean; match?: boolean }>();

const localeStore = useLocaleStore();

const g = computed(() => frameGeom(props.node.role));
const givenName = computed(() => localize(props.node.person.givenName, localeStore.currentLocale));
const middleName = computed(() => localize(props.node.person.middleName, localeStore.currentLocale));
const surname = computed(() => localize(props.node.person.surname, localeStore.currentLocale));
const fullName = computed(() => [givenName.value, middleName.value, surname.value].filter(s => s).join(' '));
const lifespan = computed(() => formatYearSpan(props.node.person.birthYear, props.node.person.deathYear));
const portraitHref = computed(() => {
  const p = props.node.person;
  const ref = p.portraitThumb ?? p.portrait;
  return ref ? resolveMediaUrl(ref) : null;
});
const initial = computed(() => givenName.value.trim().charAt(0).toLocaleUpperCase());
const clipId = computed(() => `oak-oval-${props.node.id}`);
const nameSize = computed(() => nameFontSize(fullName.value, g.value.nameMax));

const ui = useUiStore();

// Active state overlay (match wins over selected); null = plain gold. Opacity is
// driven declaratively (overlayVisible) and crossfaded via a CSS transition — the
// classic medallion subtree mounts lazily (default theme is eighties) and remounts
// on every theme switch, so an imperative mount-time seed was unreliable and could
// leave a highlight stuck on. A reactive binding is correct across every (re)mount.
const overlay = computed(() => overlayForState(props.selected === true, props.match === true));
const overlayVisible = computed(() => overlay.value !== null);
// `overlayHref` keeps the last variant during fade-out so the colour doesn't pop to
// plain gold mid-transition; it only advances when a new highlighted state turns on.
const overlayHref = ref<string>(overlay.value ?? frameGold);
watch(overlay, next => {
  if (next) {
    overlayHref.value = next;
  }
});
</script>

<template>
  <EightiesMedallion
    v-if="ui.theme === 'eighties'"
    :node="node" :selected="selected" :match="match"
  />
  <g v-else class="oak__medallion-card">
    <!-- dark mount: shows where the zoomed-out portrait doesn't reach the oval -->
    <ellipse class="oak__mount" :rx="g.ovalRx" :ry="g.ovalRy" />

    <!-- portrait (or monogram fallback), clipped to the oval -->
    <clipPath :id="clipId"><ellipse :rx="g.ovalRx" :ry="g.ovalRy" /></clipPath>
    <image
      v-if="portraitHref"
      data-test="portrait"
      :href="portraitHref"
      :x="-(g.portraitZoom * g.w) / 2"
      :y="-(g.portraitZoom * g.h) / 2 + g.portraitOffsetY"
      :width="g.portraitZoom * g.w"
      :height="g.portraitZoom * g.h"
      preserveAspectRatio="xMidYMid slice"
      :clip-path="`url(#${clipId})`"
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
      class="oak__frame-overlay"
      :href="overlayHref"
      :style="{ opacity: overlayVisible ? 1 : 0 }"
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
// State overlay (lit-gold / green-gold) crossfades over the base gold frame. Opacity
// is bound declaratively in the template; the fade uses the shared `feedback` motion
// token (mirrored to CSS as --motion-feedback-ms) and is disabled under reduced motion.
.oak__frame-overlay {
  transition: opacity var(--motion-feedback-ms, 300ms) ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .oak__frame-overlay { transition: none; }
}
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
