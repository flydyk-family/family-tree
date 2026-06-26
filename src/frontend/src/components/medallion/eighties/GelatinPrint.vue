<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutNode } from '../../../layout/treeLayout';
import { useLocaleStore } from '../../../stores/localeStore';
import { localize } from '../../../i18n/localize';
import { formatYearSpan } from '../../../format/lifespan';
import { mediaUrl } from '../../../media/mediaUrl';
import { fitName } from '../nameFit';
import { cardGeom } from './cardGeom';
import { hoverTilt } from './hoverTilt';

const props = defineProps<{ node: LayoutNode; selected?: boolean; match?: boolean }>();
const localeStore = useLocaleStore();
const g = computed(() => cardGeom(props.node.role));
const fullName = computed(() => {
  const given = localize(props.node.person.givenName, localeStore.currentLocale);
  const surname = localize(props.node.person.surname, localeStore.currentLocale);
  return [given, surname].filter(s => s).join(' ');
});
const lifespan = computed(() => formatYearSpan(props.node.person.birthYear, props.node.person.deathYear));
const portraitHref = computed(() => props.node.person.portrait ? mediaUrl('portraits', props.node.person.portrait) : null);
const name = computed(() => fitName(fullName.value, g.value.nameMax));
// white print mount around the portrait, origin-centred
const m = computed(() => {
  const gv = g.value;
  const pad = 8, footer = 6;
  return { x: gv.imgX - pad, y: gv.imgY - pad, w: gv.imgW + pad * 2, h: gv.imgH + pad * 2 + footer };
});
const tilt = computed(() => hoverTilt(props.node.id));
// years sit just below the print and size to the text
const yearsY = computed(() => m.value.y + m.value.h + 14);
const yearsBoxW = computed(() => Math.max(42, Math.round(lifespan.value.length * g.value.yearsSize * 0.62 + 14)));
</script>

<template>
  <g class="gel e80-card" :style="{ '--hover-tilt': `${tilt.angleDeg}deg` }" :filter="selected ? 'url(#film-glow)' : undefined">
    <!-- card art — the search-match halo applies to this group only -->
    <g class="e80-card__art">
    <rect class="gel__shadow" :x="m.x + 1.5" :y="m.y + 4" :width="m.w" :height="m.h" rx="1" />
    <rect :x="m.x" :y="m.y" :width="m.w" :height="m.h" rx="1" class="gel__mount" />
    <image
      v-if="portraitHref" data-test="portrait" :href="portraitHref"
      :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH"
      preserveAspectRatio="xMidYMid slice" class="gel__img"
    />
    <text v-else class="gel__initial" text-anchor="middle" :x="0" :y="g.imgY + g.imgH * 0.58" :style="{ fontSize: `${g.imgW * 0.5}px` }">{{ fullName.charAt(0) }}</text>
    <rect v-if="selected" data-test="sel-edge" :x="m.x + 1" :y="m.y + 1" :width="m.w - 2" :height="m.h - 2" rx="1" fill="none" stroke="var(--signal)" stroke-width="2" />
    </g>
    <!-- search-match cue: a white frame around the whole card (name → years),
         slightly beyond the card edges. Filter-free (one stroked rect). -->
    <rect
      v-if="match" data-test="match-frame" class="e80-match-frame"
      :x="-(g.w / 2 + 5)" :width="g.w + 10"
      :y="g.nameY - (name.lines.length - 1) * name.lineHeight - name.fontSize - 4"
      :height="(yearsY - g.nameY) + (name.lines.length - 1) * name.lineHeight + name.fontSize + 12"
      rx="3"
    />
    <!-- name + years — outside .e80-card__art so the match halo never washes them -->
    <rect
      class="e80-name-bg" :x="-(g.nameMax / 2 + 6)"
      :y="g.nameY - (name.lines.length - 1) * name.lineHeight - name.fontSize"
      :width="g.nameMax + 12" :height="(name.lines.length - 1) * name.lineHeight + name.fontSize * 1.25"
      fill="url(#e80-name-fade)"
    />
    <text
      class="gel__name" text-anchor="middle"
      :y="g.nameY - (name.lines.length - 1) * name.lineHeight"
      :style="{ fontSize: `${name.fontSize}px` }"
    ><tspan v-for="(ln, i) in name.lines" :key="i" x="0" :dy="i === 0 ? 0 : name.lineHeight">{{ ln }}</tspan></text>
    <g v-if="lifespan">
      <rect class="gel__years-chip" :x="-yearsBoxW / 2" :y="yearsY - 11" :width="yearsBoxW" height="16" rx="2" />
      <text class="gel__years" data-test="lifespan" text-anchor="middle" :x="0" :y="yearsY" :style="{ fontSize: `${g.yearsSize}px` }">{{ lifespan }}</text>
    </g>
  </g>
</template>

<style scoped lang="scss">
.gel__shadow { fill: #000; opacity: 0.35; }
.gel__mount { fill: #f4f2ec; }
.gel__name { font-family: var(--font-display); font-weight: 400; fill: var(--ink); }
.gel__years-chip { fill: #ece9e1; stroke: #c4bfb4; }
.gel__years { font-family: var(--font-mono); font-weight: 700; fill: #2c2f33; }
.gel__initial { font-family: var(--font-display); fill: #6b7177; opacity: 0.6; }
</style>
