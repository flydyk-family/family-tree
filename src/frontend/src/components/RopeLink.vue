<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutLink } from '../layout/treeLayout';
import { ropePath } from './oakConnectors';

const props = defineProps<{
  link: LayoutLink;
  orientation: 'vertical' | 'horizontal';
  drawGen: number;
}>();

const d = computed(() => ropePath(props.link, props.orientation));
const W = 1.5; // flat cord width (no generation taper — a "string" reads wrong tapered)
</script>

<template>
  <g class="oak__rope">
    <path class="rope__shadow" :d="d" :stroke-width="W + 1.2" />
    <path
      class="rope__core" data-test="branch"
      :data-link-id="link.id" :data-entrance-draw="drawGen"
      :d="d" :stroke-width="W" stroke-linecap="round"
    />
    <path class="rope__twist-hi" :data-entrance-fade="drawGen" :d="d" :stroke-width="W" />
    <path class="rope__twist-lo" :data-entrance-fade="drawGen" :d="d" :stroke-width="W" />
  </g>
</template>

<style scoped lang="scss">
.oak__rope path { fill: none; }
.rope__shadow { stroke: #000; stroke-opacity: 0.3; transform: translate(0.4px, 1.6px); }
.rope__core { stroke: var(--rope); }
.rope__twist-hi { stroke: var(--rope-twist-hi); stroke-dasharray: 1.3 3.2; opacity: 0.7; }
.rope__twist-lo { stroke: var(--rope-twist-lo); stroke-dasharray: 1.3 3.2; stroke-dashoffset: 2.2; opacity: 0.5; }
</style>
