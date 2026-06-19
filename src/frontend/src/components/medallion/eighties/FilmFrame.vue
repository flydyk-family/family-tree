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
const gateClipId = computed(() => `film-gate-${props.node.id}`);
const holesMaskId = computed(() => `film-holes-${props.node.id}`);
// years chip sizes to its text (monospace ≈ 0.62em/char) so full spans fit
const yearsBoxW = computed(() => Math.max(42, Math.round(lifespan.value.length * g.value.yearsSize * 0.62 + 14)));

// frame metrics derived from geometry (origin-centred)
const m = computed(() => {
  const gv = g.value;
  const bodyX = gv.imgX - gv.perfW - 6;          // left celluloid edge
  const bodyW = gv.imgW + (gv.perfW + 6) * 2;    // full frame width
  const top = gv.imgY - 6;
  const h = gv.imgH + 12;
  return { bodyX, bodyW, top, h, leftPerfX: bodyX, rightPerfX: bodyX + bodyW - gv.perfW };
});
// the holes roll by a WHOLE number of perforation pitches nearest a frame height,
// so the advanced hole pattern lines up exactly with the rest pattern — no snap on
// leave — while still moving roughly in step with the photo.
const holeRoll = computed(() => Math.round(g.value.imgH / 16) * 16);
// sprocket hole rows down a strip, covering one roll-distance ABOVE the body so the
// roll always has holes entering from the top; the body clip hides any outside it.
const holeRows = computed(() => {
  const rows: number[] = [];
  const step = 16, roll = holeRoll.value;
  for (let y = m.value.top - roll - step; y < m.value.top + m.value.h + step; y += step) rows.push(y);
  return rows;
});
</script>

<template>
  <g class="film e80-card" :style="{ '--img-h': `${g.imgH}px`, '--hole-roll': `${holeRoll}px` }" :filter="selected ? 'url(#film-glow)' : undefined">
    <!-- card art — the search-match halo applies to this group only, so the
         name/years siblings below stay crisp -->
    <g class="e80-card__art">
    <!-- static drop shadow (cheap + zoom-stable — replaces a per-card filter);
         masked too so the shadow doesn't show through the transparent holes -->
    <rect class="film__shadow" :x="m.bodyX + 1.5" :y="m.top + 4" :width="m.bodyW" :height="m.h" rx="2" :mask="`url(#${holesMaskId})`" />

    <!-- dark celluloid body — masked so the sprocket holes punch through it too
         (otherwise the body would show behind the strip holes) -->
    <rect :x="m.bodyX" :y="m.top" :width="m.bodyW" :height="m.h" fill="var(--celluloid)" :mask="`url(#${holesMaskId})`" />

    <!-- portrait gate: a FIXED clipped aperture; only the inner group slides, so on
         hover the current frame pulls down through the gate and the duplicate frame
         (stacked one image-height above) enters from the top. -->
    <clipPath :id="gateClipId">
      <rect :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH" />
    </clipPath>
    <g :clip-path="`url(#${gateClipId})`">
      <g class="film__gate">
        <template v-if="portraitHref">
          <image data-test="portrait" :href="portraitHref" :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH" preserveAspectRatio="xMidYMid slice" class="film__img" />
          <image aria-hidden="true" :href="portraitHref" :x="g.imgX" :y="g.imgY - g.imgH" :width="g.imgW" :height="g.imgH" preserveAspectRatio="xMidYMid slice" class="film__img film__img--prev" />
        </template>
        <text v-else class="film__initial" text-anchor="middle" :x="0" :y="g.imgY + g.imgH * 0.58" :style="{ fontSize: `${g.imgW * 0.5}px` }">{{ fullName.charAt(0) }}</text>
      </g>
    </g>

    <!-- grain + seeded abrasion: static overlays on the window (never advance) -->
    <rect :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH" fill="url(#film-grain-tex)" class="film__grain" />
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

    <!-- TRANSPARENT sprocket holes: the strips (and the body, above) are masked
         so the holes punch through to whatever is behind the card — the canvas,
         a branch line, or (on a search match) the halo glow. White = celluloid
         kept, black holes = cut out. The hole group still rolls on hover, so the
         perforations advance in lockstep with the photo gate. maskUnits in user
         space bounds the roll to the body, replacing the old body clip. -->
    <mask :id="holesMaskId" maskUnits="userSpaceOnUse" :x="m.bodyX" :y="m.top" :width="m.bodyW" :height="m.h">
      <rect :x="m.bodyX" :y="m.top" :width="m.bodyW" :height="m.h" fill="#fff" />
      <g data-test="perf-holes" class="film__holes" fill="#000">
        <template v-for="y in holeRows" :key="`h${y}`">
          <rect :x="m.leftPerfX + g.perfW * 0.25" :y="y" :width="g.perfW * 0.5" height="9" rx="3" />
          <rect :x="m.rightPerfX + g.perfW * 0.25" :y="y" :width="g.perfW * 0.5" height="9" rx="3" />
        </template>
      </g>
    </mask>
    <g data-test="perf-strips" :mask="`url(#${holesMaskId})`">
      <rect :x="m.leftPerfX" :y="m.top" :width="g.perfW" :height="m.h" fill="var(--celluloid)" />
      <rect :x="m.rightPerfX" :y="m.top" :width="g.perfW" :height="m.h" fill="var(--celluloid)" />
    </g>

    <!-- edge printing: on the inner celluloid border, alongside the photo (not over the holes) -->
    <text class="film__edge" :transform="`translate(${g.imgX - 3} 0) rotate(-90)`" x="0" y="0" text-anchor="middle">PHOTO 400NC</text>
    <text class="film__edge" :transform="`translate(${g.imgX + g.imgW + 3} 0) rotate(90)`" x="0" y="0" text-anchor="middle">GPX · 2</text>

    <!-- bright selection edge -->
    <rect
      v-if="selected" data-test="sel-edge"
      :x="m.bodyX + 1" :y="m.top + 1" :width="m.bodyW - 2" :height="m.h - 2" rx="2"
      fill="none" stroke="var(--signal)" stroke-width="2"
    />

    </g>
    <!-- name (above) — outside .e80-card__art so the match halo never washes it -->
    <text
      class="film__name" text-anchor="middle"
      :y="g.nameY - (name.lines.length - 1) * name.lineHeight"
      :style="{ fontSize: `${name.fontSize}px` }"
    ><tspan v-for="(ln, i) in name.lines" :key="i" x="0" :dy="i === 0 ? 0 : name.lineHeight">{{ ln }}</tspan></text>
    <!-- years chip (below) -->
    <g v-if="lifespan">
      <rect class="film__years-chip" :x="-yearsBoxW / 2" :y="g.yearsY - 11" :width="yearsBoxW" height="16" rx="2" />
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
.film__name { font-family: var(--font-display); font-weight: 400; fill: var(--ink); }
.film__years-chip { fill: var(--bark-dark); stroke: var(--panel-edge); }
.film__years { font-family: var(--font-mono); font-weight: 700; fill: var(--ink-soft); }
.film__initial { font-family: var(--font-display); fill: var(--gilt-light); opacity: 0.6; }
// frame advance: a single smooth glide on hover — the film (photo gate + the
// sprocket holes, in lockstep) slides down one frame so the duplicate frame
// enters from the top; on leave it glides smoothly back up. A transition (not a
// keyframe loop) means it plays once, reverses cleanly, and never snaps.
.film__gate, .film__holes { transform-box: fill-box; transition: transform 0.7s cubic-bezier(0.33, 0, 0.2, 1); }
.film:hover .film__gate { transform: translateY(var(--img-h)); }
.film:hover .film__holes { transform: translateY(var(--hole-roll)); }
@media (prefers-reduced-motion: reduce) {
  .film__gate, .film__holes { transition: none; }
  .film:hover .film__gate, .film:hover .film__holes { transform: none; }
}
</style>
