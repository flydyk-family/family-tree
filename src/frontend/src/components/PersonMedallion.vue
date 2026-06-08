<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutNode, NodeRole } from '../layout/treeLayout';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatYearSpan } from '../format/lifespan';

const props = defineProps<{ node: LayoutNode; selected?: boolean }>();

const localeStore = useLocaleStore();

interface Geom {
  rx: number;
  ry: number;
  scrollW: number;
  overlap: number; // how far the portrait dips into the scroll's top edge
  rollW: number;
  nameSize: number;
  yearSize: number;
}

function geomFor(role: NodeRole): Geom {
  if (role === 'trunk') {
    return { rx: 40, ry: 50, scrollW: 160, overlap: 32, rollW: 20, nameSize: 16, yearSize: 13 };
  }
  if (role === 'leaf') {
    return { rx: 27, ry: 33, scrollW: 128, overlap: 22, rollW: 15, nameSize: 13, yearSize: 11 };
  }
  return { rx: 33, ry: 40, scrollW: 150, overlap: 26, rollW: 17, nameSize: 14, yearSize: 12 }; // branch + root
}

// All card coordinates derive from the role geometry. The portrait is centred at
// the node origin (0,0); the scroll hangs below it. The scroll height is computed
// from the text layout so the years line always keeps a bottom margin.
const c = computed(() => {
  const g = geomFor(props.node.role);
  const sy = g.ry - g.overlap; // scroll top edge (portrait bottom = ry overlaps it)
  const givenY = g.ry + g.nameSize + 2; // first text baseline, just clear of the portrait
  const surnameY = givenY + g.nameSize + 3;
  const yearsY = surnameY + g.yearSize + 5;
  const scrollH = Math.round(yearsY + g.yearSize * 0.35 + 7 - sy); // small bottom margin: text sits low in the scroll
  const halfW = g.scrollW / 2;
  const rollTop = sy - 4;
  const rollH = scrollH + 8;

  const roll = (cx: number) => {
    const k = g.rollW * 0.32;
    return {
      x: cx - g.rollW / 2,
      curlTop: `M ${cx - k} ${rollTop + g.rollW * 0.42} A ${k} ${k} 0 0 1 ${cx + k} ${rollTop + g.rollW * 0.42}`,
      curlBot: `M ${cx - k} ${rollTop + rollH - g.rollW * 0.42} A ${k} ${k} 0 0 0 ${cx + k} ${rollTop + rollH - g.rollW * 0.42}`
    };
  };

  return { ...g, sy, givenY, surnameY, yearsY, scrollH, halfW, rollTop, rollH, leftRoll: roll(-halfW), rightRoll: roll(halfW) };
});

const givenName = computed(() => localize(props.node.person.givenName, localeStore.currentLocale));
const surname = computed(() => localize(props.node.person.surname, localeStore.currentLocale));
const lifespan = computed(() => formatYearSpan(props.node.person.birthYear, props.node.person.deathYear));
const portraitHref = computed(() =>
  props.node.person.portrait ? `/assets/portraits/${props.node.person.portrait}` : null
);
const era = computed<'modern' | 'classic'>(() => {
  const year = props.node.person.birthYear ?? props.node.year;
  return year >= 1950 ? 'modern' : 'classic';
});
const clipId = computed(() => `oak-clip-${props.node.id}`);
</script>

<template>
  <!-- ===== name scroll (paper-roll cartouche), drawn first so the portrait sits on top ===== -->
  <g class="oak__scroll">
    <rect
      class="oak__scroll-roll"
      :x="c.leftRoll.x" :y="c.rollTop" :width="c.rollW" :height="c.rollH" :rx="c.rollW / 2"
    />
    <rect
      class="oak__scroll-roll"
      :x="c.rightRoll.x" :y="c.rollTop" :width="c.rollW" :height="c.rollH" :rx="c.rollW / 2"
    />
    <rect
      class="oak__scroll-body"
      :x="-c.halfW" :y="c.sy" :width="c.scrollW" :height="c.scrollH" rx="5"
    />
    <rect class="oak__scroll-seam" :x="-c.halfW + 2" :y="c.sy" width="6" :height="c.scrollH" />
    <rect class="oak__scroll-seam" :x="c.halfW - 8" :y="c.sy" width="6" :height="c.scrollH" />
    <path class="oak__scroll-curl" :d="c.leftRoll.curlTop" />
    <path class="oak__scroll-curl" :d="c.leftRoll.curlBot" />
    <path class="oak__scroll-curl" :d="c.rightRoll.curlTop" />
    <path class="oak__scroll-curl" :d="c.rightRoll.curlBot" />
  </g>

  <!-- ===== name + years inside the scroll ===== -->
  <text class="oak__name" text-anchor="middle" :y="c.givenY" :style="{ fontSize: `${c.nameSize}px` }">{{ givenName }}</text>
  <text v-if="surname" class="oak__surname" text-anchor="middle" :y="c.surnameY" :style="{ fontSize: `${c.nameSize}px` }">{{ surname }}</text>
  <text v-if="lifespan" class="oak__dates" data-test="lifespan" text-anchor="middle" :y="c.yearsY" :style="{ fontSize: `${c.yearSize}px` }">{{ lifespan }}</text>

  <!-- ===== portrait medallion, straddling the scroll's top edge ===== -->
  <ellipse
    class="oak__medallion oak__medallion--fill"
    :class="[`oak__medallion--${node.role}`, `oak__medallion--${era}`]"
    :data-era="era"
    :rx="c.rx"
    :ry="c.ry"
  />

  <template v-if="portraitHref">
    <clipPath :id="clipId">
      <ellipse :rx="c.rx" :ry="c.ry" />
    </clipPath>
    <image
      data-test="portrait"
      :href="portraitHref"
      :x="-c.rx"
      :y="-c.ry"
      :width="c.rx * 2"
      :height="c.ry * 2"
      preserveAspectRatio="xMidYMid slice"
      :clip-path="`url(#${clipId})`"
    />
  </template>
  <!-- cameo silhouette when no portrait -->
  <g v-if="!portraitHref" class="oak__cameo" aria-hidden="true">
    <circle :cx="0" :cy="-c.ry * 0.18" :r="c.rx * 0.34" />
    <path :d="`M ${-c.rx*0.58} ${c.ry*0.6} C ${-c.rx*0.58} ${c.ry*0.1} ${-c.rx*0.3} ${-c.ry*0.06} 0 ${-c.ry*0.06} C ${c.rx*0.3} ${-c.ry*0.06} ${c.rx*0.58} ${c.ry*0.1} ${c.rx*0.58} ${c.ry*0.6} Z`" />
  </g>
  <!-- vignette for depth -->
  <ellipse class="oak__vignette" :rx="c.rx" :ry="c.ry" />

  <!-- classic (pre-1950) faded gilt bevel -->
  <template v-if="era === 'classic'">
    <ellipse class="oak__gilt-sheen" :rx="c.rx + 1.5" :ry="c.ry + 1.5" />
    <ellipse
      class="oak__medallion oak__gilt-band"
      :class="{ 'oak__medallion--selected': selected }"
      :rx="c.rx"
      :ry="c.ry"
    />
    <ellipse class="oak__gilt-edge" :rx="c.rx - 2.5" :ry="c.ry - 2.5" />
  </template>
  <!-- modern (1950+) engraved double-rule -->
  <template v-else>
    <ellipse
      class="oak__medallion oak__rule-outer"
      :class="{ 'oak__medallion--selected': selected }"
      :rx="c.rx"
      :ry="c.ry"
    />
    <ellipse class="oak__rule-inner" :rx="c.rx - 3.5" :ry="c.ry - 3.5" />
  </template>

  <!-- keystone ornament at top of frame -->
  <path class="oak__keystone" aria-hidden="true" :d="`M 0 ${-c.ry - 4} l 5 5 l -5 5 l -5 -5 Z`" />
</template>

<style scoped lang="scss">
// paper-roll scroll cartouche
.oak__scroll-body {
  fill: var(--panel);
  stroke: var(--bark);
  stroke-width: 1;
}
.oak__scroll-roll {
  fill: url(#oak-roll);
  stroke: var(--bark-dark);
  stroke-width: 1;
}
.oak__scroll-curl {
  fill: none;
  stroke: var(--bark-dark);
  stroke-width: 0.8;
  opacity: 0.65;
}
.oak__scroll-seam {
  fill: var(--bark-dark);
  opacity: 0.08;
}

.oak__name, .oak__surname {
  font-family: var(--font-display);
  font-weight: 600;
  fill: var(--ink);
}
.oak__dates {
  font-family: var(--font-body);
  font-style: italic;
  fill: var(--ink-soft);
}
.oak__cameo {
  fill: rgba(58, 42, 22, 0.46);
}
.oak__vignette {
  fill: url(#oak-vignette);
}
.oak__keystone {
  fill: url(#oak-gild);
  stroke: var(--gilt-deep);
  stroke-width: 0.5;
}

.oak__medallion--fill {
  fill: var(--parchment-2);
  stroke: none;
}
.oak__medallion--leaf.oak__medallion--fill {
  fill: var(--leaf);
}

// modern engraved double-rule
.oak__rule-outer {
  fill: none;
  stroke: var(--ink-soft);
  stroke-width: 2;
}
.oak__medallion--trunk.oak__rule-outer {
  stroke-width: 2.5;
}
.oak__rule-inner {
  fill: none;
  stroke: var(--bark);
  stroke-width: 1;
}

// classic faded gilt bevel
.oak__gilt-band {
  fill: none;
  stroke: url(#oak-gild);
  stroke-width: 5;
}
.oak__medallion--trunk.oak__gilt-band {
  stroke-width: 6;
}
.oak__gilt-sheen {
  fill: none;
  stroke: var(--gilt-sheen);
  stroke-width: 1;
  opacity: 0.7;
}
.oak__gilt-edge {
  fill: none;
  stroke: var(--ink);
  stroke-width: 1;
}

// selected highlight (focus is applied by OakTree via :deep)
.oak__medallion--selected {
  stroke: var(--leaf-deep);
  stroke-width: 3.5;
}
</style>
