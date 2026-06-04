<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutNode, NodeRole } from '../layout/treeLayout';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatYearSpan } from '../format/lifespan';

const props = defineProps<{ node: LayoutNode; selected?: boolean }>();

const localeStore = useLocaleStore();

interface Radii {
  rx: number;
  ry: number;
}

function radiiFor(role: NodeRole): Radii {
  if (role === 'trunk') {
    return { rx: 15, ry: 19 };
  }
  if (role === 'leaf') {
    return { rx: 10, ry: 13 };
  }
  return { rx: 12, ry: 15 }; // branch + root
}

const radii = computed(() => radiiFor(props.node.role));
const name = computed(() => localize(props.node.person.givenName, localeStore.currentLocale));
const initial = computed(() => name.value.charAt(0).toUpperCase());
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
  <text class="oak__name" text-anchor="middle" :y="-(radii.ry + 6)">{{ name }}</text>

  <!-- placeholder surface / layer behind a portrait -->
  <ellipse
    class="oak__medallion oak__medallion--fill"
    :class="[`oak__medallion--${node.role}`, `oak__medallion--${era}`]"
    :data-era="era"
    :rx="radii.rx"
    :ry="radii.ry"
  />

  <!-- portrait, clipped to the oval -->
  <template v-if="portraitHref">
    <clipPath :id="clipId">
      <ellipse :rx="radii.rx" :ry="radii.ry" />
    </clipPath>
    <image
      data-test="portrait"
      :href="portraitHref"
      :x="-radii.rx"
      :y="-radii.ry"
      :width="radii.rx * 2"
      :height="radii.ry * 2"
      preserveAspectRatio="xMidYMid slice"
      :clip-path="`url(#${clipId})`"
    />
  </template>
  <!-- initials placeholder (the common path — seed data has no portraits) -->
  <text
    v-else-if="initial"
    class="oak__initials"
    text-anchor="middle"
    :y="radii.ry * 0.34"
    :style="{ fontSize: `${radii.rx * 1.05}px` }"
  >{{ initial }}</text>

  <!-- classic (pre-1950) faded gilt bevel, drawn on top of the portrait -->
  <template v-if="era === 'classic'">
    <ellipse class="oak__gilt-sheen" :rx="radii.rx + 1.5" :ry="radii.ry + 1.5" />
    <ellipse
      class="oak__medallion oak__gilt-band"
      :class="{ 'oak__medallion--selected': selected }"
      :rx="radii.rx"
      :ry="radii.ry"
    />
    <ellipse class="oak__gilt-edge" :rx="radii.rx - 2.5" :ry="radii.ry - 2.5" />
  </template>
  <!-- modern (1950+) engraved double-rule -->
  <template v-else>
    <ellipse
      class="oak__medallion oak__rule-outer"
      :class="{ 'oak__medallion--selected': selected }"
      :rx="radii.rx"
      :ry="radii.ry"
    />
    <ellipse class="oak__rule-inner" :rx="radii.rx - 3.5" :ry="radii.ry - 3.5" />
  </template>

  <!-- birth–death below -->
  <text
    v-if="lifespan"
    class="oak__dates"
    data-test="lifespan"
    text-anchor="middle"
    :y="radii.ry + 14"
  >{{ lifespan }}</text>
</template>

<style scoped lang="scss">
.oak__name {
  fill: var(--ink);
  font-size: 11px;
  font-family: Georgia, serif;
}

.oak__dates {
  fill: var(--ink-soft);
  font-size: 9px;
  font-family: Georgia, serif;
}

.oak__initials {
  fill: var(--ink-soft);
  font-family: Georgia, serif;
  font-weight: 600;
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
  stroke: url(#oak-gilt);
  stroke-width: 4;
}
.oak__medallion--trunk.oak__gilt-band {
  stroke-width: 5;
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
