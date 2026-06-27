<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutNode, FamilyUnion } from '../layout/treeLayout';
import { routeFamily, DEFAULT_ROUTE_OPTS, type Axis, type Seg } from '../layout/familyRouting';
import { ropePath, branchPath } from './oakConnectors';

const props = defineProps<{
  union: FamilyUnion;
  nodeById: Map<string, LayoutNode>;
  axis: Axis;
  film: boolean;
}>();

const present = (ids: string[]): LayoutNode[] =>
  ids.map(id => props.nodeById.get(id)).filter((n): n is LayoutNode => Boolean(n));

const parents = computed(() => present(props.union.parentIds));
const children = computed(() => present(props.union.childIds));

const route = computed(() =>
  routeFamily(
    parents.value.map(n => ({ x: n.x, y: n.y })),
    children.value.map(n => ({ x: n.x, y: n.y })),
    props.axis,
    DEFAULT_ROUTE_OPTS
  )
);

// Every curve of a union (spouses → hub, hub → children) is revealed together in
// the family's generation phase.
const drawGen = computed(() => props.union.generation);
const orientation = computed<'vertical' | 'horizontal'>(() => (props.axis === 'x' ? 'horizontal' : 'vertical'));

const curves = computed<Seg[]>(() => [...route.value.spouseCurves, ...route.value.childCurves]);

// Film draws a sagging rope (quadratic); Classic an organic bark curve (cubic).
const d = (seg: Seg): string => (props.film ? ropePath(seg, orientation.value) : branchPath(seg, orientation.value));
</script>

<template>
  <g class="oak__family" :class="{ 'oak__family--film': film }">
    <template v-for="(seg, i) in curves" :key="i">
      <path v-if="film" class="rope__shadow" :d="d(seg)" />
      <path
        class="branch__core" data-test="branch"
        :data-link-id="union.id" :data-entrance-draw="drawGen"
        :d="d(seg)" stroke-linecap="round"
      />
      <template v-if="film">
        <path class="rope__twist-hi" :data-entrance-fade="drawGen" :d="d(seg)" />
        <path class="rope__twist-lo" :data-entrance-fade="drawGen" :d="d(seg)" />
      </template>
    </template>
  </g>
</template>

<style scoped lang="scss">
.oak__family path { fill: none; }
.branch__core { stroke: var(--bark); stroke-width: 1.5; }

// Film theme: red rope colour + woven twist texture, identical to the original
// rope connectors (kept for its pan/zoom performance).
.oak__family--film {
  .branch__core { stroke: var(--rope); }
  .rope__shadow { stroke: #000; stroke-opacity: 0.3; stroke-width: 2.7; transform: translate(0.4px, 1.6px); }
  .rope__twist-hi { stroke: var(--rope-twist-hi); stroke-width: 1.5; stroke-dasharray: 1.3 3.2; opacity: 0.7; }
  .rope__twist-lo { stroke: var(--rope-twist-lo); stroke-width: 1.5; stroke-dasharray: 1.3 3.2; stroke-dashoffset: 2.2; opacity: 0.5; }
}
</style>
