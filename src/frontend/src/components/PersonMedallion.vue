<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutNode, NodeRole } from '../layout/treeLayout';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatYearSpan } from '../format/lifespan';

const props = defineProps<{ node: LayoutNode; selected?: boolean; tintIndex?: number }>();

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
    return { rx: 40, ry: 50, scrollW: 198, overlap: 32, rollW: 20, nameSize: 22, yearSize: 18 };
  }
  if (role === 'leaf') {
    return { rx: 27, ry: 33, scrollW: 158, overlap: 22, rollW: 15, nameSize: 18, yearSize: 16 };
  }
  return { rx: 33, ry: 40, scrollW: 186, overlap: 26, rollW: 17, nameSize: 19, yearSize: 17 }; // branch + root
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

  return {
    ...g, sy, givenY, surnameY, yearsY, scrollH, halfW, rollTop, rollH,
    leftRollX: -halfW - g.rollW / 2,
    rightRollX: halfW - g.rollW / 2
  };
});

const givenName = computed(() => localize(props.node.person.givenName, localeStore.currentLocale));
const surname = computed(() => localize(props.node.person.surname, localeStore.currentLocale));
const lifespan = computed(() => formatYearSpan(props.node.person.birthYear, props.node.person.deathYear));
const portraitHref = computed(() =>
  props.node.person.portrait ? `/assets/portraits/${props.node.person.portrait}` : null
);
// First letter of the localized given name, shown as a coloured-disc monogram when
// no portrait asset is available.
const initial = computed(() => givenName.value.trim().charAt(0).toLocaleUpperCase());
const tintId = computed(() => `oak-tint-${(props.tintIndex ?? 0) % 6}`);
const clipId = computed(() => `oak-clip-${props.node.id}`);
</script>

<template>
  <!-- ===== name scroll (paper-roll cartouche), drawn first so the portrait sits on top ===== -->
  <g class="oak__scroll">
    <rect
      class="oak__scroll-roll"
      :x="c.leftRollX" :y="c.rollTop" :width="c.rollW" :height="c.rollH" :rx="c.rollW / 2"
    />
    <rect
      class="oak__scroll-roll"
      :x="c.rightRollX" :y="c.rollTop" :width="c.rollW" :height="c.rollH" :rx="c.rollW / 2"
    />
    <rect
      class="oak__scroll-body"
      :x="-c.halfW" :y="c.sy" :width="c.scrollW" :height="c.scrollH" rx="4"
    />
  </g>

  <!-- ===== name + years inside the scroll ===== -->
  <text class="oak__name" text-anchor="middle" :y="c.givenY" :style="{ fontSize: `${c.nameSize}px` }">{{ givenName }}</text>
  <text v-if="surname" class="oak__surname" text-anchor="middle" :y="c.surnameY" :style="{ fontSize: `${c.nameSize}px` }">{{ surname }}</text>
  <text v-if="lifespan" class="oak__dates" data-test="lifespan" text-anchor="middle" :y="c.yearsY" :style="{ fontSize: `${c.yearSize}px` }">{{ lifespan }}</text>

  <!-- ===== portrait medallion: coloured disc straddling the scroll's top edge ===== -->
  <ellipse
    class="oak__medallion--fill"
    :rx="c.rx"
    :ry="c.ry"
    :fill="`url(#${tintId})`"
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
  <!-- monogram initial when no portrait -->
  <text
    v-else
    class="oak__initial"
    aria-hidden="true"
    text-anchor="middle"
    :y="c.ry * 0.3"
    :style="{ fontSize: `${c.rx * 0.95}px` }"
  >{{ initial }}</text>

  <!-- gilt frame ring (this ellipse carries the focus / match / selected highlight) -->
  <ellipse
    class="oak__medallion oak__gilt-band"
    :class="[`oak__medallion--${node.role}`, { 'oak__medallion--selected': selected }]"
    :rx="c.rx"
    :ry="c.ry"
  />
  <!-- fine inner engraved rule -->
  <ellipse class="oak__gilt-edge" :rx="c.rx - 4" :ry="c.ry - 4" />
</template>

<style scoped lang="scss">
// paper-roll scroll cartouche
.oak__scroll-body {
  fill: #f6eed2;
  stroke: var(--ink-soft);
  stroke-width: 0.9;
  transition: fill 0.2s ease, stroke 0.2s ease, stroke-width 0.2s ease;
}
.oak__scroll-roll {
  fill: url(#oak-roll);
  stroke: var(--bark-dark);
  stroke-width: 0.8;
  transition: stroke 0.2s ease;
}

.oak__name, .oak__surname {
  font-family: var(--font-display);
  font-weight: 600;
  fill: var(--ink);
}
.oak__dates {
  font-family: var(--font-body);
  fill: var(--ink-soft);
}

// coloured-disc monogram
.oak__initial {
  font-family: var(--font-display);
  font-weight: 600;
  fill: #fff;
  opacity: 0.55;
}

// gilt frame ring (flat gilt, engraved double-rule with the inner edge)
.oak__gilt-band {
  fill: none;
  stroke: var(--gilt);
  stroke-width: 3.4;
  transition: stroke 0.2s ease, stroke-width 0.2s ease;
}
.oak__medallion--trunk.oak__gilt-band {
  stroke-width: 4.2;
}
.oak__gilt-edge {
  fill: none;
  stroke: var(--ink);
  stroke-width: 0.8;
  opacity: 0.7;
}

// selected highlight (focus is applied by OakTree via :deep)
.oak__medallion--selected {
  stroke: var(--leaf-deep);
  stroke-width: 3.5;
}
</style>
