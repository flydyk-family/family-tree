<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutNode, FamilyUnion } from '../layout/treeLayout';
import { routeFamily, DEFAULT_ROUTE_OPTS, type Axis, type Seg } from '../layout/familyRouting';
import { ropePath } from './oakConnectors';

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

// Each curve is tagged spouse-vs-child: in Film the spouse→hub curves render
// heavier and brighter so the couple bond reads stronger than the descent lines.
interface Curve { seg: Seg; spouse: boolean; }
const curves = computed<Curve[]>(() => [
  ...route.value.spouseCurves.map(seg => ({ seg, spouse: true })),
  ...route.value.childCurves.map(seg => ({ seg, spouse: false }))
]);

// Spouse → hub curves bow deeper than the child descent curves, so the couple
// bond reads as a pronounced arc.
const SPOUSE_BOW = 1.7;

// Both themes use the same sagging curve (Film strokes it as a rope, Classic as
// a bark line), so the connectors read curvy in either.
const d = (seg: Seg, spouse: boolean): string =>
  ropePath(seg, orientation.value, spouse ? SPOUSE_BOW : 1);
</script>

<template>
  <g class="oak__family" :class="{ 'oak__family--film': film }">
    <template v-for="(c, i) in curves" :key="i">
      <path v-if="film" class="rope__shadow" :class="{ 'is-spouse': c.spouse }" :d="d(c.seg, c.spouse)" />
      <path
        class="branch__core" :class="{ 'is-spouse': c.spouse }" data-test="branch"
        :data-link-id="union.id" :data-entrance-draw="drawGen"
        :d="d(c.seg, c.spouse)" stroke-linecap="round"
      />
      <template v-if="film">
        <path class="rope__twist-hi" :class="{ 'is-spouse': c.spouse }" :data-entrance-fade="drawGen" :d="d(c.seg, c.spouse)" />
        <path class="rope__twist-lo" :class="{ 'is-spouse': c.spouse }" :data-entrance-fade="drawGen" :d="d(c.seg, c.spouse)" />
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

  // The couple bond: spouse → joint curves read heavier and brighter than the
  // child descent curves, so the marriage joint stands out.
  .branch__core.is-spouse { stroke: #e2473a; stroke-width: 2.6; }
  .rope__shadow.is-spouse { stroke-width: 4; }
  .rope__twist-hi.is-spouse,
  .rope__twist-lo.is-spouse { stroke-width: 2.6; opacity: 0.85; }
}
</style>
