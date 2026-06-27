<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutNode, FamilyUnion } from '../layout/treeLayout';
import { routeFamily, DEFAULT_ROUTE_OPTS, type Axis, type Seg, type Pt } from '../layout/familyRouting';

const props = defineProps<{
  union: FamilyUnion;
  nodeById: Map<string, LayoutNode>;
  axis: Axis;
  film: boolean;
}>();

const JR = 4; // junction diamond half-extent

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

// Descent geometry reveals with the child generation; the couple bar/junctions
// fade in once both partners are on stage (the later partner's generation).
const drawGen = computed(() => props.union.generation);
const coupleGen = computed(() =>
  parents.value.length ? Math.max(...parents.value.map(n => n.generation)) : props.union.generation
);

const descentSegs = computed<Seg[]>(() => {
  const r = route.value;
  const segs: Seg[] = [...r.parentStubs, ...r.childStubs];
  if (r.trunk) segs.push(r.trunk);
  if (r.busBar) segs.push(r.busBar);
  return segs;
});

const junctions = computed<Pt[]>(() =>
  [route.value.marriageJunction, route.value.branchJunction].filter((p): p is Pt => Boolean(p))
);

const line = (seg: Seg): string => `M ${seg.a.x} ${seg.a.y} L ${seg.b.x} ${seg.b.y}`;
const diamond = (p: Pt): string =>
  `M ${p.x} ${p.y - JR} L ${p.x + JR} ${p.y} L ${p.x} ${p.y + JR} L ${p.x - JR} ${p.y} Z`;
</script>

<template>
  <g class="oak__family" :class="{ 'oak__family--film': film }">
    <template v-for="(seg, i) in descentSegs" :key="`d${i}`">
      <path v-if="film" class="rope__shadow" :d="line(seg)" />
      <path
        class="branch__core" data-test="branch"
        :data-link-id="union.id" :data-entrance-draw="drawGen"
        :d="line(seg)"
      />
      <template v-if="film">
        <path class="rope__twist-hi" :data-entrance-fade="drawGen" :d="line(seg)" />
        <path class="rope__twist-lo" :data-entrance-fade="drawGen" :d="line(seg)" />
      </template>
    </template>

    <template v-if="route.coupleBar">
      <path v-if="film" class="rope__shadow" :d="line(route.coupleBar)" />
      <path class="branch__core branch__couple" :data-entrance-fade="coupleGen" :d="line(route.coupleBar)" />
    </template>

    <path
      v-for="(j, i) in junctions" :key="`j${i}`"
      class="oak__junction" data-test="junction"
      :data-entrance-fade="drawGen" :d="diamond(j)"
    />
  </g>
</template>

<style scoped lang="scss">
.oak__family path { fill: none; }
.branch__core { stroke: var(--bark); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.oak__junction { fill: var(--bark-dark); stroke: none; }

// Film theme: red rope colour + woven twist texture on the straight segments.
.oak__family--film {
  .branch__core { stroke: var(--rope); stroke-width: 1.5; }
  .rope__shadow { stroke: #000; stroke-opacity: 0.3; stroke-width: 2.7; transform: translate(0.4px, 1.6px); }
  .rope__twist-hi { stroke: var(--rope-twist-hi); stroke-width: 1.5; stroke-dasharray: 1.3 3.2; opacity: 0.7; }
  .rope__twist-lo { stroke: var(--rope-twist-lo); stroke-width: 1.5; stroke-dasharray: 1.3 3.2; stroke-dashoffset: 2.2; opacity: 0.5; }
  .oak__junction { fill: var(--rope-twist-lo); }
}
</style>
