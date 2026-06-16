<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutNode } from '../../../layout/treeLayout';
import { useLocaleStore } from '../../../stores/localeStore';
import { localize } from '../../../i18n/localize';
import { formatYearSpan } from '../../../format/lifespan';
import { mediaUrl } from '../../../media/mediaUrl';
import { nameFontSize } from '../nameFit';
import { cardGeom } from './cardGeom';
import { abrasionFor } from './abrasion';

const props = defineProps<{ node: LayoutNode; selected?: boolean; match?: boolean }>();
const localeStore = useLocaleStore();

const g = computed(() => cardGeom(props.node.role));
const fullName = computed(() => {
  const given = localize(props.node.person.givenName, localeStore.currentLocale);
  const surname = localize(props.node.person.surname, localeStore.currentLocale);
  return [given, surname].filter(s => s).join(' ');
});
const lifespan = computed(() => formatYearSpan(props.node.person.birthYear, props.node.person.deathYear));
const portraitHref = computed(() =>
  props.node.person.portrait ? mediaUrl('portraits', props.node.person.portrait) : null
);
const nameSize = computed(() => nameFontSize(fullName.value, g.value.nameMax));
const wear = computed(() => abrasionFor(props.node.id));

// frame metrics derived from geometry (origin-centred)
const m = computed(() => {
  const gv = g.value;
  const bodyX = gv.imgX - gv.perfW - 6;          // left celluloid edge
  const bodyW = gv.imgW + (gv.perfW + 6) * 2;    // full frame width
  const top = gv.imgY - 6;
  const h = gv.imgH + 12;
  return { bodyX, bodyW, top, h, leftPerfX: bodyX, rightPerfX: bodyX + bodyW - gv.perfW };
});
// sprocket hole rows down a strip
const holeRows = computed(() => {
  const rows: number[] = [];
  const step = 16, r0 = m.value.top + 6;
  for (let y = r0; y < m.value.top + m.value.h - 8; y += step) rows.push(y);
  return rows;
});
</script>

<template>
  <g class="film" :filter="selected ? 'url(#film-glow)' : undefined">
    <!-- static drop shadow (cheap + zoom-stable — replaces a per-card filter) -->
    <rect class="film__shadow" :x="m.bodyX + 1.5" :y="m.top + 4" :width="m.bodyW" :height="m.h" rx="2" />

    <!-- dark celluloid body -->
    <rect :x="m.bodyX" :y="m.top" :width="m.bodyW" :height="m.h" fill="var(--celluloid)" />

    <!-- portrait (Kodachrome grade via CSS filter on the SVG image) -->
    <image
      v-if="portraitHref"
      data-test="portrait"
      :href="portraitHref"
      :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH"
      preserveAspectRatio="xMidYMid slice"
      class="film__img"
    />
    <text
      v-else class="film__initial" text-anchor="middle"
      :x="0" :y="g.imgY + g.imgH * 0.58" :style="{ fontSize: `${g.imgW * 0.5}px` }"
    >{{ fullName.charAt(0) }}</text>

    <!-- grain (shared tiled pattern, not a per-card filter) -->
    <rect :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH" fill="url(#film-grain-tex)" class="film__grain" />

    <!-- seeded abrasion -->
    <line
      :x1="g.imgX + wear.scratchX * g.imgW" :y1="g.imgY"
      :x2="g.imgX + wear.scratchX * g.imgW" :y2="g.imgY + g.imgH"
      stroke="#fff" stroke-opacity="0.16"
    />
    <circle
      v-for="(d, i) in wear.dust" :key="i"
      :cx="g.imgX + d.x * g.imgW" :cy="g.imgY + d.y * g.imgH" r="1"
      :fill="d.dark ? '#000' : '#fff'" :opacity="d.dark ? 0.3 : 0.35"
    />

    <!-- sprocket strips with holes drawn as solid rects: the canvas is a flat
         colour, so a canvas-coloured hole reads as a punched cut-out without a
         per-card mask. A search match fills the holes a lighter grey. -->
    <g data-test="perf-strips">
      <rect :x="m.leftPerfX" :y="m.top" :width="g.perfW" :height="m.h" fill="var(--celluloid)" />
      <rect :x="m.rightPerfX" :y="m.top" :width="g.perfW" :height="m.h" fill="var(--celluloid)" />
      <g data-test="perf-holes" :fill="match ? 'var(--bark-dark)' : 'var(--canvas-bg)'">
        <template v-for="y in holeRows" :key="`h${y}`">
          <rect :x="m.leftPerfX + g.perfW * 0.25" :y="y" :width="g.perfW * 0.5" height="9" rx="3" />
          <rect :x="m.rightPerfX + g.perfW * 0.25" :y="y" :width="g.perfW * 0.5" height="9" rx="3" />
        </template>
      </g>
    </g>

    <!-- edge printing -->
    <text class="film__edge" :transform="`translate(${m.leftPerfX + g.perfW * 0.5} 0) rotate(-90)`" x="0" y="0" text-anchor="middle">PHOTO 400NC</text>
    <text class="film__edge" :transform="`translate(${m.rightPerfX + g.perfW * 0.5} 0) rotate(90)`" x="0" y="0" text-anchor="middle">GPX · 2</text>

    <!-- bright selection edge -->
    <rect
      v-if="selected" data-test="sel-edge"
      :x="m.bodyX + 1" :y="m.top + 1" :width="m.bodyW - 2" :height="m.h - 2" rx="2"
      fill="none" stroke="var(--signal)" stroke-width="2"
    />

    <!-- name (above) -->
    <text class="film__name" text-anchor="middle" :x="0" :y="g.nameY" :style="{ fontSize: `${nameSize}px` }">{{ fullName }}</text>
    <!-- years chip (below) -->
    <g v-if="lifespan">
      <rect :x="-26" :y="g.yearsY - 11" width="52" height="16" rx="2" fill="var(--bark-dark)" stroke="var(--panel-edge)" />
      <text class="film__years" data-test="lifespan" text-anchor="middle" :x="0" :y="g.yearsY" :style="{ fontSize: `${g.yearsSize}px` }">{{ lifespan }}</text>
    </g>
    <text class="film__nameval" v-show="false" data-test="card-name">{{ fullName }}</text>
  </g>
</template>

<style scoped lang="scss">
.film__shadow { fill: #000; opacity: 0.35; }
.film__img { filter: sepia(0.42) saturate(1.22) contrast(1.05) brightness(1.04) hue-rotate(-6deg); }
.film__grain { mix-blend-mode: overlay; opacity: 0.4; pointer-events: none; }
// running-film flicker on hover (the static seeded marks always show; this only
// animates the grain layer). Disabled for reduced-motion users.
.film:hover .film__grain { animation: film-flicker 0.5s steps(3) infinite; }
@keyframes film-flicker { 0% { opacity: 0.32; } 50% { opacity: 0.46; } 100% { opacity: 0.34; } }
@media (prefers-reduced-motion: reduce) { .film:hover .film__grain { animation: none; } }
.film__edge { font-family: var(--font-mono); font-weight: 700; font-size: 7px; letter-spacing: 1.5px; fill: #c9c4b4; opacity: 0.85; }
.film__name { font-family: var(--font-display); font-weight: 600; fill: var(--ink); }
.film__years { font-family: var(--font-mono); font-weight: 700; fill: var(--ink-soft); }
.film__initial { font-family: var(--font-display); fill: var(--gilt-light); opacity: 0.6; }
</style>
