<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutNode } from '../../../layout/treeLayout';
import { useLocaleStore } from '../../../stores/localeStore';
import { localize } from '../../../i18n/localize';
import { formatYearSpan } from '../../../format/lifespan';
import { mediaUrl } from '../../../media/mediaUrl';
import { fitName } from '../nameFit';
import { cardGeom } from './cardGeom';
import { abrasionFor } from './abrasion';

// Edge-print film frame for 1990+ births: solid dark celluloid borders with NO
// sprocket holes, slightly wider top/bottom margins, stock name centred up each
// side strip, and frame-number marks in the four corners.
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
const name = computed(() => fitName(fullName.value, g.value.nameMax));
const wear = computed(() => abrasionFor(props.node.id));
const yearsBoxW = computed(() => Math.max(42, Math.round(lifespan.value.length * g.value.yearsSize * 0.62 + 14)));

// frame metrics — wider top/bottom borders, solid side strips (no holes)
const m = computed(() => {
  const gv = g.value;
  const sideW = gv.perfW + 6;     // solid celluloid side strip
  const vB = 10;                  // top/bottom border — bigger than the holed frame's 6, not as tall as a full strip
  const bodyX = gv.imgX - sideW;
  const bodyW = gv.imgW + sideW * 2;
  const top = gv.imgY - vB;
  const h = gv.imgH + vB * 2;
  return {
    sideW, bodyX, bodyW, top, h,
    bottom: top + h,
    leftStripCx: gv.imgX - sideW / 2,            // centre of the left strip
    rightStripCx: gv.imgX + gv.imgW + sideW / 2, // centre of the right strip
    topLabelY: gv.imgY - 2.5,                    // corner marks: in the border, just clear of the photo
    botLabelY: gv.imgY + gv.imgH + 6,
    nameY: top - 4,                              // name floats above the frame
    yearsY: top + h + 16                         // years chip below the frame
  };
});
</script>

<template>
  <g class="film film--edge e80-card" :filter="selected ? 'url(#film-glow)' : undefined">
    <!-- card art — the search-match halo applies to this group only, so the
         name/years siblings below stay crisp -->
    <g class="e80-card__art">
    <!-- static drop shadow -->
    <rect class="film__shadow" :x="m.bodyX + 1.5" :y="m.top + 4" :width="m.bodyW" :height="m.h" rx="2" />

    <!-- dark celluloid body (search match → a touch lighter, the only feedback) -->
    <rect
      data-test="edge-body"
      :x="m.bodyX" :y="m.top" :width="m.bodyW" :height="m.h"
      :fill="match ? '#1b1d21' : 'var(--celluloid)'"
    />

    <!-- portrait (Kodachrome grade) -->
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

    <!-- grain (shared tiled pattern) -->
    <rect :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH" fill="url(#film-grain-tex)" class="film__grain" />

    <!-- seeded abrasion: long scratch (~30%) + dust + occasional hairline -->
    <line
      v-if="wear.scratchX !== null"
      :x1="g.imgX + wear.scratchX * g.imgW" :y1="g.imgY"
      :x2="g.imgX + wear.scratchX * g.imgW" :y2="g.imgY + g.imgH"
      stroke="#fff" stroke-opacity="0.16"
    />
    <circle
      v-for="(d, i) in wear.dust" :key="i"
      :cx="g.imgX + d.x * g.imgW" :cy="g.imgY + d.y * g.imgH" r="1"
      :fill="d.dark ? '#000' : '#fff'" :opacity="d.dark ? 0.3 : 0.35"
    />
    <line
      v-if="wear.tinyScratch" data-test="tiny-scratch"
      :x1="g.imgX + wear.tinyScratch.x * g.imgW" :y1="g.imgY + wear.tinyScratch.y0 * g.imgH"
      :x2="g.imgX + wear.tinyScratch.x * g.imgW" :y2="g.imgY + wear.tinyScratch.y1 * g.imgH"
      stroke="#fff" stroke-opacity="0.12"
    />

    <!-- edge printing: centred up each solid side strip -->
    <text class="film__edge" :transform="`translate(${m.leftStripCx} 0) rotate(-90)`" x="0" y="0" text-anchor="middle">PHOTO 400NC</text>
    <text class="film__edge" :transform="`translate(${m.rightStripCx} 0) rotate(90)`" x="0" y="0" text-anchor="middle">GPX · 2</text>

    <!-- frame-number marks in the four corners -->
    <g data-test="edge-corners">
      <text class="film__fnum" :x="m.bodyX + 6" :y="m.topLabelY" text-anchor="start">45A</text>
      <text class="film__fnum" :x="m.bodyX + m.bodyW - 6" :y="m.topLabelY" text-anchor="end">025</text>
      <text class="film__fnum" :x="m.bodyX + 6" :y="m.botLabelY" text-anchor="start">45</text>
      <text class="film__fnum" :x="m.bodyX + m.bodyW - 6" :y="m.botLabelY" text-anchor="end">→</text>
    </g>

    <!-- bright selection edge -->
    <rect
      v-if="selected" data-test="sel-edge"
      :x="m.bodyX + 1" :y="m.top + 1" :width="m.bodyW - 2" :height="m.h - 2" rx="2"
      fill="none" stroke="var(--signal)" stroke-width="2"
    />

    </g>
    <!-- name (above) — outside .e80-card__art so the match halo never washes it -->
    <rect
      class="e80-name-bg" :x="-(g.nameMax / 2 + 6)"
      :y="m.nameY - (name.lines.length - 1) * name.lineHeight - name.fontSize"
      :width="g.nameMax + 12" :height="(name.lines.length - 1) * name.lineHeight + name.fontSize * 1.25"
      fill="url(#e80-name-fade)"
    />
    <text
      class="film__name" text-anchor="middle"
      :y="m.nameY - (name.lines.length - 1) * name.lineHeight"
      :style="{ fontSize: `${name.fontSize}px` }"
    ><tspan v-for="(ln, i) in name.lines" :key="i" x="0" :dy="i === 0 ? 0 : name.lineHeight">{{ ln }}</tspan></text>
    <!-- years chip (below) -->
    <g v-if="lifespan">
      <rect class="film__years-chip" :x="-yearsBoxW / 2" :y="m.yearsY - 11" :width="yearsBoxW" height="16" rx="2" />
      <text class="film__years" data-test="lifespan" text-anchor="middle" :x="0" :y="m.yearsY" :style="{ fontSize: `${g.yearsSize}px` }">{{ lifespan }}</text>
    </g>
    <text class="film__nameval" v-show="false" data-test="card-name">{{ fullName }}</text>
  </g>
</template>

<style scoped lang="scss">
.film__shadow { fill: #000; opacity: 0.35; }
.film__img { filter: sepia(0.42) saturate(1.22) contrast(1.05) brightness(1.04) hue-rotate(-6deg); }
.film__grain { mix-blend-mode: overlay; opacity: 0.4; pointer-events: none; }
.film:hover .film__grain { animation: film-flicker 0.5s steps(3) infinite; }
@keyframes film-flicker { 0% { opacity: 0.32; } 50% { opacity: 0.46; } 100% { opacity: 0.34; } }
@media (prefers-reduced-motion: reduce) { .film:hover .film__grain { animation: none; } }
.film__edge { font-family: var(--font-mono); font-weight: 700; font-size: 7px; letter-spacing: 1.5px; fill: #c9c4b4; opacity: 0.85; }
.film__fnum { font-family: var(--font-mono); font-weight: 700; font-size: 6.5px; letter-spacing: 1px; fill: #c9c4b4; opacity: 0.8; }
.film__name { font-family: var(--font-display); font-weight: 400; fill: var(--ink); }
.film__years-chip { fill: var(--bark-dark); stroke: var(--panel-edge); }
.film__years { font-family: var(--font-mono); font-weight: 700; fill: var(--ink-soft); }
.film__initial { font-family: var(--font-display); fill: var(--gilt-light); opacity: 0.6; }
</style>
