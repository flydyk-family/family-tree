<script setup lang="ts">
import { computed } from 'vue';
import type { TreeLayout, LayoutNode, LayoutLink } from '../layout/treeLayout';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';

const props = defineProps<{ layout: TreeLayout }>();

const localeStore = useLocaleStore();

function displayName(node: LayoutNode): string {
  return localize(node.person.givenName, localeStore.currentLocale);
}

const PADDING = 60;

const viewBox = computed(() => {
  const { bounds } = props.layout;
  const x = bounds.minX - PADDING;
  const y = bounds.minY - PADDING;
  const width = bounds.maxX - bounds.minX + PADDING * 2;
  const height = bounds.maxY - bounds.minY + PADDING * 2;
  return `${x} ${y} ${width} ${height}`;
});

function branchWidth(link: LayoutLink): number {
  // thicker near the trunk (small absolute generation), thinner toward twigs
  const node = props.layout.nodes.find(n => n.id === link.target);
  const generation = node ? Math.abs(node.generation) : 3;
  return Math.max(2, 12 - generation * 2.5);
}

function branchPath(link: LayoutLink): string {
  // organic vertical-ish curve from parent to child
  const midY = (link.y1 + link.y2) / 2;
  return `M ${link.x1} ${link.y1} C ${link.x1} ${midY}, ${link.x2} ${midY}, ${link.x2} ${link.y2}`;
}

function nodeRadius(node: LayoutNode): number {
  if (node.role === 'trunk') {
    return 11;
  }
  if (node.role === 'leaf') {
    return 7;
  }
  return 9;
}

const descentLinks = computed(() => props.layout.links.filter(link => link.kind === 'descent'));
const unionLinks = computed(() => props.layout.links.filter(link => link.kind === 'union'));
</script>

<template>
  <svg class="oak" :viewBox="viewBox" preserveAspectRatio="xMidYMid meet">
    <g class="oak__branches">
      <path
        v-for="link in descentLinks"
        :key="link.id"
        data-test="branch"
        :d="branchPath(link)"
        :stroke-width="branchWidth(link)"
        fill="none"
        stroke-linecap="round"
        class="oak__branch"
      />
    </g>

    <g class="oak__unions">
      <line
        v-for="link in unionLinks"
        :key="link.id"
        :x1="link.x1" :y1="link.y1" :x2="link.x2" :y2="link.y2"
        class="oak__union"
      />
    </g>

    <g class="oak__nodes">
      <g
        v-for="node in layout.nodes"
        :key="node.id"
        data-test="node"
        :transform="`translate(${node.x}, ${node.y})`"
        :class="['oak__node', `oak__node--${node.role}`]"
      >
        <circle :r="nodeRadius(node)" class="oak__medallion" />
        <text y="-14" text-anchor="middle" class="oak__name">{{ displayName(node) }}</text>
      </g>
    </g>
  </svg>
</template>

<style scoped lang="scss">
.oak {
  width: 100%;
  height: 100%;
  display: block;

  &__branch {
    stroke: var(--bark);
  }
  &__union {
    stroke: var(--bark-dark);
    stroke-width: 2;
    stroke-dasharray: 2 3;
  }
  &__medallion {
    fill: var(--parchment-2);
    stroke: var(--ink-soft);
    stroke-width: 1.5;
  }
  &__node--leaf .oak__medallion {
    fill: var(--leaf);
    stroke: var(--leaf-deep);
  }
  &__node--trunk .oak__medallion {
    stroke-width: 2.5;
  }
  &__name {
    fill: var(--ink);
    font-size: 11px;
    font-family: Georgia, serif;
  }
}
</style>
