# Rectangular Family Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-(parent→child) diagonal "rope" connectors with orthogonal (right-angle) routing that joins each couple into one trunk feeding a sibling bus bar, removing branch tangle.

**Architecture:** `buildLayout` emits an ID-only `unions` topology model (no coordinates). A pure `familyRouting.ts` module derives the orthogonal segments + junction points from the *current* node positions and a time-axis param, so both orientations and the orientation-morph "just work". A new `FamilyConnector.vue` renders themed segments + junction nodes per union. The change is sequenced additive-then-remove so the typed tree stays green after every task.

**Tech Stack:** Vue 3 + TypeScript, Vitest + @vue/test-utils, SVG, SCSS design tokens.

## Global Constraints

- **Frontend dir:** all `npm` commands run from `src/frontend`. Node ≥ 20.19 (system Node 22 satisfies this).
- **TS conventions:** TSDoc/JSDoc (`/** … */`) for doc comments; concise inline `//` for non-obvious "why". No rambling comment blocks.
- **Tests:** Vitest. Unit-test names are descriptive `it('…')` strings (the C# `When/Should` rule does NOT apply to frontend).
- **Themes:** `ui.theme === 'eighties'` is the **Film** theme (red rope); anything else is **Classic** (bark). The connector component receives a `film: boolean` prop, never reads the store.
- **Orientation axis:** `'y'` = vertical (time ↓), `'x'` = horizontal (time →). Derived from `branchOrientation ?? orientation ?? 'vertical'`.
- **Entrance hooks:** the ceremony selects DOM by `[data-entrance-draw="<generation>"]` and `[data-entrance-fade="<generation>"]` (see `motion/entrance.ts:117`). Descent geometry carries `data-entrance-draw`; the couple bar and junction beads carry `data-entrance-fade`.
- **Commit style:** end commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push or open a PR (owner reviews).
- **Spec:** `docs/superpowers/specs/2026-06-27-rectangular-family-connectors-design.md`.

---

## File Structure

- **Create** `src/frontend/src/layout/familyRouting.ts` — pure (T,S) geometry; one responsibility: turn parent/child points into orthogonal segments + junctions.
- **Create** `src/frontend/src/layout/familyRouting.spec.ts` — unit tests for the geometry.
- **Create** `src/frontend/src/components/FamilyConnector.vue` — themed SVG rendering of one union's route.
- **Create** `src/frontend/src/components/FamilyConnector.spec.ts` — component tests.
- **Modify** `src/frontend/src/layout/treeLayout.ts` — add `FamilyUnion` type + `unions` field (Task 1); remove `links`/`LayoutLink` (Task 6).
- **Modify** `src/frontend/src/components/OakTree.vue` — render `FamilyConnector`s; drop old branch/union rendering.
- **Modify** `src/frontend/src/motion/entranceCues.ts` — build draw/fade buckets from `unions`.
- **Modify** `src/frontend/src/layout/projection.ts` & `src/frontend/src/motion/layoutFlip.ts` — drop link-endpoint recompute (Task 6).
- **Delete** `src/frontend/src/components/oakConnectors.ts`, `oakConnectors.spec.ts`, `RopeLink.vue`, `RopeLink.spec.ts` (Task 6).
- **Modify** specs: `treeLayout.spec.ts`, `OakTree.spec.ts`, `entranceCues.spec.ts`, `projection.spec.ts`, `layoutFlip.spec.ts`.
- **Modify** docs: `docs/reference/` connector section; `CLAUDE.md` overview line.

---

## Task 1: Add the `unions` topology model to the layout

**Files:**
- Modify: `src/frontend/src/layout/treeLayout.ts`
- Test: `src/frontend/src/layout/treeLayout.spec.ts`

**Interfaces:**
- Produces: `interface FamilyUnion { id: string; parentIds: string[]; childIds: string[]; generation: number; }` and `TreeLayout.unions: FamilyUnion[]`. `generation` = max generation among present children; for a childless union, the max generation among present partners.
- Note: keep the existing `links: LayoutLink[]` field for now (removed in Task 6) so dependents keep compiling.

- [ ] **Step 1: Write the failing test**

Add to `src/frontend/src/layout/treeLayout.spec.ts` (the file already has a `graph` with `focus`, `spouse`, `child`, union `u` between `focus`+`spouse` with child `child` — reuse it):

```ts
  it('emits an ID-only union with present parents, children and the descent generation', () => {
    const u = layout.unions.find(x => x.id === 'u')!;
    expect(u.parentIds.sort()).toEqual(['focus', 'spouse']);
    expect(u.childIds).toEqual(['child']);
    // child is one generation below the focus (gen 0) → descent generation 1
    expect(u.generation).toBe(1);
  });

  it('omits unions whose nodes are all absent from the layout', () => {
    expect(layout.unions.every(x => x.parentIds.length > 0 || x.childIds.length > 0)).toBe(true);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/layout/treeLayout.spec.ts`
Expected: FAIL — `layout.unions` is `undefined`.

- [ ] **Step 3: Add the type and field**

In `src/frontend/src/layout/treeLayout.ts`, after the `LayoutLink` interface add:

```ts
/** ID-only family-union topology: which present people form a couple and their
 *  present children. Coordinates are intentionally absent — connector geometry is
 *  derived from live node positions at render time so it survives projection/morph. */
export interface FamilyUnion {
  id: string;
  parentIds: string[];
  childIds: string[];
  /** Generation the connector grows INTO — max child generation present, or (for a
   *  childless union) the later partner's generation. Drives the entrance reveal. */
  generation: number;
}
```

Add `unions: FamilyUnion[];` to the `TreeLayout` interface (next to `links`).

In `finishLayout`, after the existing `links` loop (just before the `const xs = …` bounds block), build the unions from `graph.unions` using `nodeById` and `genOf`-equivalent (`node.generation`):

```ts
  const genById = new Map(nodes.map(node => [node.id, node.generation]));
  const unions: FamilyUnion[] = [];
  for (const union of graph.unions) {
    const parentIds = union.partnerIds.filter(id => nodeById.has(id));
    const childIds = union.childIds.filter(id => nodeById.has(id));
    if (parentIds.length === 0 && childIds.length === 0) {
      continue;
    }
    const childGens = childIds.map(id => genById.get(id)!);
    const parentGens = parentIds.map(id => genById.get(id)!);
    const generation = childGens.length
      ? Math.max(...childGens)
      : Math.max(0, ...parentGens);
    unions.push({ id: union.id, parentIds, childIds, generation });
  }
```

Add `unions,` to the returned object literal.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/layout/treeLayout.spec.ts`
Expected: PASS (all existing + the 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/layout/treeLayout.ts src/frontend/src/layout/treeLayout.spec.ts
git commit -m "Add ID-only union topology model to the layout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Pure orthogonal routing geometry

**Files:**
- Create: `src/frontend/src/layout/familyRouting.ts`
- Test: `src/frontend/src/layout/familyRouting.spec.ts`

**Interfaces:**
- Produces:
  - `interface Pt { x: number; y: number }`
  - `interface Seg { a: Pt; b: Pt }`
  - `type Axis = 'y' | 'x'`
  - `interface RouteOpts { coupleDrop: number; childRise: number }`
  - `const DEFAULT_ROUTE_OPTS: RouteOpts` (`{ coupleDrop: 26, childRise: 26 }`)
  - `interface FamilyRoute { parentStubs: Seg[]; coupleBar: Seg | null; trunk: Seg | null; busBar: Seg | null; childStubs: Seg[]; marriageJunction: Pt | null; branchJunction: Pt | null }`
  - `function routeFamily(parents: Pt[], children: Pt[], axis: Axis, opts?: RouteOpts): FamilyRoute`

- [ ] **Step 1: Write the failing tests**

Create `src/frontend/src/layout/familyRouting.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { routeFamily, DEFAULT_ROUTE_OPTS } from './familyRouting';

const O = DEFAULT_ROUTE_OPTS;

describe('routeFamily (vertical axis, time = y)', () => {
  const parents = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const children = [{ x: 20, y: 200 }, { x: 80, y: 220 }];
  const r = routeFamily(parents, children, 'y');

  it('drops a stub from each parent to the couple bar', () => {
    expect(r.parentStubs).toHaveLength(2);
    // each stub keeps the parent x and ends at coupleT = max(parentY) + coupleDrop
    expect(r.parentStubs[0].a).toEqual({ x: 0, y: 0 });
    expect(r.parentStubs[0].b).toEqual({ x: 0, y: O.coupleDrop });
    expect(r.parentStubs[1].b).toEqual({ x: 100, y: O.coupleDrop });
  });

  it('joins the two parents with a horizontal couple bar at the marriage point', () => {
    expect(r.coupleBar).toEqual({ a: { x: 0, y: O.coupleDrop }, b: { x: 100, y: O.coupleDrop } });
    expect(r.marriageJunction).toEqual({ x: 50, y: O.coupleDrop });
  });

  it('drops a single trunk from the marriage point to the bus bar', () => {
    const busY = Math.min(200, 220) - O.childRise; // 174
    expect(r.trunk).toEqual({ a: { x: 50, y: O.coupleDrop }, b: { x: 50, y: busY } });
    expect(r.branchJunction).toEqual({ x: 50, y: busY });
  });

  it('spreads a bus bar across the children and the trunk centre', () => {
    const busY = 174;
    // spans min(midS=50, childXs=20,80)=20 .. max(...)=80
    expect(r.busBar).toEqual({ a: { x: 20, y: busY }, b: { x: 80, y: busY } });
  });

  it('drops a stub from the bus bar to each child', () => {
    const busY = 174;
    expect(r.childStubs).toHaveLength(2);
    expect(r.childStubs[0]).toEqual({ a: { x: 20, y: busY }, b: { x: 20, y: 200 } });
    expect(r.childStubs[1]).toEqual({ a: { x: 80, y: busY }, b: { x: 80, y: 220 } });
  });
});

describe('routeFamily edge cases', () => {
  it('omits the couple bar for a single parent but still drops a trunk', () => {
    const r = routeFamily([{ x: 0, y: 0 }], [{ x: 0, y: 200 }], 'y');
    expect(r.coupleBar).toBeNull();
    expect(r.parentStubs).toHaveLength(1);
    expect(r.marriageJunction).toEqual({ x: 0, y: O.coupleDrop });
    expect(r.trunk).not.toBeNull();
  });

  it('renders only the couple bar for a childless union', () => {
    const r = routeFamily([{ x: 0, y: 0 }, { x: 100, y: 0 }], [], 'y');
    expect(r.coupleBar).not.toBeNull();
    expect(r.trunk).toBeNull();
    expect(r.busBar).toBeNull();
    expect(r.childStubs).toHaveLength(0);
    expect(r.branchJunction).toBeNull();
  });

  it('clamps the bus bar so the trunk never inverts when a child predates the couple', () => {
    const r = routeFamily([{ x: 0, y: 100 }, { x: 100, y: 100 }], [{ x: 50, y: 0 }], 'y');
    const coupleY = 100 + O.coupleDrop;
    expect(r.branchJunction!.y).toBe(coupleY); // busT clamped up to coupleT
  });

  it('mirrors onto the horizontal axis (time = x)', () => {
    const r = routeFamily([{ x: 0, y: 0 }, { x: 0, y: 100 }], [{ x: 200, y: 50 }], 'x');
    // couple bar runs along Y (spread) at coupleX = max(parentX)+drop
    expect(r.coupleBar).toEqual({ a: { x: O.coupleDrop, y: 0 }, b: { x: O.coupleDrop, y: 100 } });
    expect(r.marriageJunction).toEqual({ x: O.coupleDrop, y: 50 });
    // trunk runs along X to the bus at busX = childX - rise
    expect(r.trunk!.b).toEqual({ x: 200 - O.childRise, y: 50 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/layout/familyRouting.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/frontend/src/layout/familyRouting.ts`:

```ts
/** Orthogonal family-connector geometry. Works in abstract (time T, spread S)
 *  coordinates so one routine serves both orientations:
 *   - axis 'y' (vertical): T = y (down = later), S = x.
 *   - axis 'x' (horizontal): T = x (right = later), S = y.
 *  Coordinates are read from live node positions, so the result survives
 *  orientation projection and the orientation-morph. */

export interface Pt { x: number; y: number; }
export interface Seg { a: Pt; b: Pt; }
export type Axis = 'y' | 'x';

export interface RouteOpts {
  /** T offset from the latest parent to the couple bar. */
  coupleDrop: number;
  /** T offset before the earliest child to the sibling bus bar. */
  childRise: number;
}

export const DEFAULT_ROUTE_OPTS: RouteOpts = { coupleDrop: 26, childRise: 26 };

export interface FamilyRoute {
  parentStubs: Seg[];
  coupleBar: Seg | null;
  trunk: Seg | null;
  busBar: Seg | null;
  childStubs: Seg[];
  marriageJunction: Pt | null;
  branchJunction: Pt | null;
}

const tOf = (p: Pt, axis: Axis): number => (axis === 'y' ? p.y : p.x);
const sOf = (p: Pt, axis: Axis): number => (axis === 'y' ? p.x : p.y);
const pt = (t: number, s: number, axis: Axis): Pt => (axis === 'y' ? { x: s, y: t } : { x: t, y: s });
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Build the orthogonal route for one union from its present parents and children. */
export function routeFamily(
  parents: Pt[],
  children: Pt[],
  axis: Axis,
  opts: RouteOpts = DEFAULT_ROUTE_OPTS
): FamilyRoute {
  const route: FamilyRoute = {
    parentStubs: [], coupleBar: null, trunk: null, busBar: null,
    childStubs: [], marriageJunction: null, branchJunction: null
  };
  if (parents.length === 0 && children.length === 0) {
    return route;
  }

  // Couple / marriage point. With parents present it sits just past the latest
  // parent along T; with none (both partners absent) it anchors on the children.
  let coupleT: number;
  let midS: number;
  if (parents.length > 0) {
    const parentS = parents.map(p => sOf(p, axis));
    coupleT = Math.max(...parents.map(p => tOf(p, axis))) + opts.coupleDrop;
    midS = mean(parentS);
    for (const p of parents) {
      route.parentStubs.push({ a: p, b: pt(coupleT, sOf(p, axis), axis) });
    }
    if (parents.length >= 2) {
      route.coupleBar = { a: pt(coupleT, Math.min(...parentS), axis), b: pt(coupleT, Math.max(...parentS), axis) };
    }
    route.marriageJunction = pt(coupleT, midS, axis);
  } else {
    coupleT = Math.min(...children.map(c => tOf(c, axis))) - opts.childRise;
    midS = mean(children.map(c => sOf(c, axis)));
  }

  if (children.length === 0) {
    return route;
  }

  const childT = children.map(c => tOf(c, axis));
  const childS = children.map(c => sOf(c, axis));
  // Bus sits just before the earliest child, but never above the couple bar.
  const busT = Math.max(coupleT, Math.min(...childT) - opts.childRise);

  if (parents.length > 0) {
    route.trunk = { a: pt(coupleT, midS, axis), b: pt(busT, midS, axis) };
  }
  route.branchJunction = pt(busT, midS, axis);

  // Bus spans the children and the trunk centre so the trunk always meets it.
  route.busBar = {
    a: pt(busT, Math.min(midS, ...childS), axis),
    b: pt(busT, Math.max(midS, ...childS), axis)
  };
  for (const c of children) {
    route.childStubs.push({ a: pt(busT, sOf(c, axis), axis), b: c });
  }
  return route;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- src/layout/familyRouting.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/layout/familyRouting.ts src/frontend/src/layout/familyRouting.spec.ts
git commit -m "Add pure orthogonal family-routing geometry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Themed `FamilyConnector` component

**Files:**
- Create: `src/frontend/src/components/FamilyConnector.vue`
- Test: `src/frontend/src/components/FamilyConnector.spec.ts`

**Interfaces:**
- Consumes: `FamilyUnion` (Task 1), `routeFamily` / `DEFAULT_ROUTE_OPTS` / `Axis` / `Seg` / `Pt` (Task 2), `LayoutNode` (existing).
- Produces: a Vue component with props `{ union: FamilyUnion; nodeById: Map<string, LayoutNode>; axis: Axis; film: boolean }`. Renders descent `<path class="branch__core" data-test="branch" data-entrance-draw>`; a couple bar `<path class="branch__couple" data-entrance-fade>`; junction beads `<path class="oak__junction" data-test="junction" data-entrance-fade>`. In film mode each descent segment also gets `.rope__shadow` + two `.rope__twist-*` overlays.

- [ ] **Step 1: Write the failing tests**

Create `src/frontend/src/components/FamilyConnector.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FamilyConnector from './FamilyConnector.vue';
import type { FamilyUnion, LayoutNode } from '../layout/treeLayout';

function node(id: string, x: number, y: number, generation = 0): LayoutNode {
  return {
    id, x, y, year: 1900 + generation * 30, generation, role: 'branch',
    person: {
      id, givenName: { ru: id, be: null, en: id }, surname: { ru: 'X', be: null, en: 'X' },
      maidenName: null, sex: 'male', birthYear: 1900, deathYear: null, vocation: 'other',
      portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
      marriedIntoFamily: false, isDefaultRoot: false
    }
  };
}

const nodeById = new Map<string, LayoutNode>([
  ['p1', node('p1', 0, 0, 0)],
  ['p2', node('p2', 100, 0, 0)],
  ['c1', node('c1', 20, 200, 1)],
  ['c2', node('c2', 80, 220, 1)]
]);
const union: FamilyUnion = { id: 'u', parentIds: ['p1', 'p2'], childIds: ['c1', 'c2'], generation: 1 };

describe('FamilyConnector', () => {
  it('renders a descent branch core per descent segment with the child-generation draw hook', () => {
    const w = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: false } });
    const cores = w.findAll('path.branch__core[data-test="branch"]');
    // 2 parent stubs + trunk + bus bar + 2 child stubs = 6 descent segments
    expect(cores).toHaveLength(6);
    cores.forEach(c => expect(c.attributes('data-entrance-draw')).toBe('1'));
  });

  it('renders a couple bar that fades with the later partner generation', () => {
    const w = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: false } });
    const couple = w.find('path.branch__couple');
    expect(couple.exists()).toBe(true);
    expect(couple.attributes('data-entrance-fade')).toBe('0');
  });

  it('renders a marriage and a branch junction bead', () => {
    const w = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: false } });
    expect(w.findAll('path.oak__junction[data-test="junction"]')).toHaveLength(2);
  });

  it('adds rope shadow + twist overlays in the film theme', () => {
    const plain = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: false } });
    expect(plain.find('path.rope__twist-hi').exists()).toBe(false);
    const film = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: true } });
    expect(film.find('path.rope__shadow').exists()).toBe(true);
    expect(film.find('path.rope__twist-hi').exists()).toBe(true);
    expect(film.find('path.rope__twist-lo').exists()).toBe(true);
  });

  it('skips absent nodes without crashing', () => {
    const sparse: FamilyUnion = { id: 'u2', parentIds: ['p1', 'ghost'], childIds: ['c1'], generation: 1 };
    const w = mount(FamilyConnector, { props: { union: sparse, nodeById, axis: 'y', film: false } });
    // one present parent → no couple bar
    expect(w.find('path.branch__couple').exists()).toBe(false);
    expect(w.findAll('path.branch__core[data-test="branch"]').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/components/FamilyConnector.spec.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the component**

Create `src/frontend/src/components/FamilyConnector.vue`:

```vue
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
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- src/components/FamilyConnector.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/FamilyConnector.vue src/frontend/src/components/FamilyConnector.spec.ts
git commit -m "Add themed FamilyConnector for orthogonal routing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Render connectors in OakTree (drop old branch/union drawing)

**Files:**
- Modify: `src/frontend/src/components/OakTree.vue`
- Test: `src/frontend/src/components/OakTree.spec.ts`

**Interfaces:**
- Consumes: `FamilyConnector` (Task 3), `layout.unions` (Task 1), `Axis` (Task 2).
- Note: `layout.links` still exists (removed in Task 6); this task stops *rendering* it. Keep the `branchOpacity` morph group.

- [ ] **Step 1: Update the component**

In `src/frontend/src/components/OakTree.vue` `<script setup>`:

1. Replace the `RopeLink` import with:
```ts
import FamilyConnector from './FamilyConnector.vue';
import type { Axis } from '../layout/familyRouting';
```
2. Remove `branchPath`, `descentLinks`, `unionLinks`, and the `linkGeneration`/`branchWidth` helpers **only if now unused** (keep `generationById` — still used). Add:
```ts
const nodeById = computed(() => new Map(props.layout.nodes.map(node => [node.id, node])));
const connectorAxis = computed<Axis>(() =>
  (props.branchOrientation ?? props.orientation ?? 'vertical') === 'horizontal' ? 'x' : 'y'
);
```
   (Note: `LayoutLink` import and `ropePath` are removed; `RopeLink` import removed.)

3. In `<template>`, replace the entire `<g class="oak__branches">…</g>` block **and** the `<g class="oak__unions">…</g>` block with a single group:
```html
      <g class="oak__branches" :style="{ opacity: branchOpacity }">
        <FamilyConnector
          v-for="u in layout.unions"
          :key="u.id"
          :union="u"
          :node-by-id="nodeById"
          :axis="connectorAxis"
          :film="film"
        />
      </g>
```

4. Remove the now-unused `.oak__branch` and `.oak__union` SCSS rules from the `<style>` block (the connector owns its styling). Leave the `--bark`/`--bark-dark` tokens (defined globally).

- [ ] **Step 2: Update the OakTree tests**

In `src/frontend/src/components/OakTree.spec.ts`:

- The test "renders an svg with a node element per person and a branch per descent link" (≈ line 45): the branch count is no longer per descent link. Replace its branch assertion with a per-union presence check:
```ts
    expect(wrapper.findAll('[data-test="node"]').length).toBe(graph.people.length);
    // one connector group per present union, each emitting ≥1 descent branch
    expect(wrapper.findAll('.oak__family').length).toBe(layout.unions.length);
    expect(wrapper.findAll('[data-test="branch"]').length).toBeGreaterThan(0);
```
- The test "tags branches, unions and nodes with their entrance generation" (≈ line 225): it currently looks up `layout.links` by `data-link-id`. Replace the branch portion to assert each branch's `data-entrance-draw` equals its union's `generation`:
```ts
    const unionById = new Map(layout.unions.map(u => [u.id, u]));
    wrapper.findAll('[data-test="branch"]').forEach(branch => {
      const u = unionById.get(branch.attributes('data-link-id')!)!;
      expect(branch.attributes('data-entrance-draw')).toBe(String(u.generation));
    });
```
  Keep the node assertions as-is.
- The test "fades the branch and union groups via morphProgress" (≈ line 285): there is no longer an `.oak__unions` group. Drop the `.oak__unions` expectation and keep only:
```ts
    expect(wrapper.find('.oak__branches').attributes('style')).toContain('opacity: 0');
```
- If a test asserts a horizontal era line via `.oak__union` `x1===x2` (≈ line 255), that test targets `.oak__stratum-line` / era lines, not unions — leave stratum/era assertions untouched. Only remove assertions that reference `.oak__union`/`.oak__branch` connector elements.

- [ ] **Step 3: Run the OakTree tests**

Run: `npm test -- src/components/OakTree.spec.ts`
Expected: PASS.

- [ ] **Step 4: Type-check the whole frontend**

Run: `npm run build`
Expected: PASS (vue-tsc clean; `layout.links` still exists so projection/layoutFlip/entranceCues still compile).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/OakTree.vue src/frontend/src/components/OakTree.spec.ts
git commit -m "Render FamilyConnectors in OakTree, retire diagonal branches

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Build entrance draw/fade buckets from unions

**Files:**
- Modify: `src/frontend/src/motion/entranceCues.ts`
- Test: `src/frontend/src/motion/entranceCues.spec.ts`

**Interfaces:**
- Consumes: `layout.unions` (Task 1).
- Produces: unchanged `GenerationPhase.drawLinkIds` / `fadeLinkIds` shape, now populated from unions. Draw bucket keyed by `union.generation`; fade bucket keyed by the later partner's generation (only when ≥1 parent present). IDs are `"${union.id}:d"` (draw) and `"${union.id}:u"` (fade) — used only for bookkeeping, not DOM selection (the ceremony selects by `data-entrance-*` generation).

- [ ] **Step 1: Update the test**

In `src/frontend/src/motion/entranceCues.spec.ts`, replace the test "draws each descent link in its target generation phase and fades unions in their band" with:

```ts
  it('buckets each union descent draw by its generation and the couple fade by the later partner', () => {
    const genOf = new Map(layout.nodes.map(n => [n.id, n.generation]));
    const byId = new Map(layout.unions.map(u => [u.id, u]));
    for (const phase of cues.phases) {
      for (const id of phase.drawLinkIds) {
        const u = byId.get(id.replace(/:d$/, ''))!;
        expect(u.generation).toBe(phase.generation);
      }
      for (const id of phase.fadeLinkIds) {
        const u = byId.get(id.replace(/:u$/, ''))!;
        const partnerGen = Math.max(...u.parentIds.map(pid => genOf.get(pid)!));
        expect(partnerGen).toBe(phase.generation);
      }
    }
    // every union with children contributes a draw id; every 2-parent union a fade id
    const draws = cues.phases.flatMap(p => p.drawLinkIds).sort();
    const expectedDraws = layout.unions.filter(u => u.childIds.length).map(u => `${u.id}:d`).sort();
    expect(draws).toEqual(expectedDraws);
    const fades = cues.phases.flatMap(p => p.fadeLinkIds).sort();
    const expectedFades = layout.unions.filter(u => u.parentIds.length >= 2).map(u => `${u.id}:u`).sort();
    expect(fades).toEqual(expectedFades);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/motion/entranceCues.spec.ts`
Expected: FAIL — still bucketing from `layout.links`.

- [ ] **Step 3: Update the implementation**

In `src/frontend/src/motion/entranceCues.ts`, replace the `for (const link of layout.links) { … }` block (≈ lines 99-110) with a union-driven version:

```ts
  const drawByGen = new Map<number, string[]>();
  const fadeByGen = new Map<number, string[]>();
  for (const union of layout.unions) {
    if (union.childIds.length) {
      // descent reveals with the children's generation
      const list = drawByGen.get(union.generation) ?? [];
      list.push(`${union.id}:d`);
      drawByGen.set(union.generation, list);
    }
    if (union.parentIds.length >= 2) {
      // the couple bar appears only once both partners are on stage
      const coupleGen = Math.max(...union.parentIds.map(id => genOf.get(id) ?? 0));
      const list = fadeByGen.get(coupleGen) ?? [];
      list.push(`${union.id}:u`);
      fadeByGen.set(coupleGen, list);
    }
  }
```

(`genOf` is already defined just above as `new Map(layout.nodes.map(node => [node.id, node.generation]))`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/motion/entranceCues.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/motion/entranceCues.ts src/frontend/src/motion/entranceCues.spec.ts
git commit -m "Derive entrance draw/fade buckets from unions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Remove the `links` model and the dead rope code

**Files:**
- Modify: `src/frontend/src/layout/treeLayout.ts`, `projection.ts`, `motion/layoutFlip.ts`
- Delete: `src/frontend/src/components/oakConnectors.ts`, `oakConnectors.spec.ts`, `RopeLink.vue`, `RopeLink.spec.ts`
- Test: `src/frontend/src/layout/treeLayout.spec.ts`, `projection.spec.ts`, `motion/layoutFlip.spec.ts`

**Interfaces:**
- Removes: `LayoutLink`, `TreeLayout.links`, the descent/union link emission in `finishLayout`. `projection.ts` and `layoutFlip.ts` stop mapping link endpoints (nodes only).

- [ ] **Step 1: Delete the superseded files**

```bash
git rm src/frontend/src/components/oakConnectors.ts \
       src/frontend/src/components/oakConnectors.spec.ts \
       src/frontend/src/components/RopeLink.vue \
       src/frontend/src/components/RopeLink.spec.ts
```

- [ ] **Step 2: Strip `links` from the layout**

In `src/frontend/src/layout/treeLayout.ts`:
- Delete the `LayoutLink` interface.
- Remove `links: LayoutLink[];` from `TreeLayout`.
- In `finishLayout`, delete the `const links: LayoutLink[] = [];` block and its `for (const union of graph.unions) { … }` descent/union emission loop. Keep the new `unions` builder from Task 1. Remove `links,` from the returned object.
- `nodeById` is still needed by the `unions` builder — keep it.

- [ ] **Step 3: Update treeLayout tests**

In `src/frontend/src/layout/treeLayout.spec.ts`, remove/replace the three `layout.links`-based assertions:
- "emits descent links from parents to children and a union link between partners" → already covered by the Task 1 union test; delete this `it(...)`.
- In the siblings test (≈ line 103), replace `sib.links.some(l => l.kind === 'descent' && l.source === 'father' && l.target === 'brother')` with:
```ts
    expect(sib.unions.some(u => u.parentIds.includes('father') && u.childIds.includes('brother'))).toBe(true);
```
- In the full-tree test (≈ lines 213-216), replace the union/descent link assertions with:
```ts
    expect(full.unions.some(u => u.id === 'u-gf' && u.parentIds.length === 2)).toBe(true);
    expect(full.unions.some(u => u.parentIds.includes('focus') && u.childIds.includes('child'))).toBe(true);
```

- [ ] **Step 4: Drop link mapping from projection & morph**

In `src/frontend/src/layout/projection.ts`:
- Remove the `LayoutLink` import and the `const links: LayoutLink[] = layout.links.map(…)` block.
- Remove `links` from the returned object (the spread `...layout` already carries `unions` unchanged, which is correct — unions hold no coordinates).

In `src/frontend/src/motion/layoutFlip.ts`:
- In `blendLayout`, remove the `LayoutLink` import usage and the `const links: LayoutLink[] = to.links.map(…)` block; remove `links` from the returned object (the `...to` spread carries `unions`).

- [ ] **Step 5: Update projection & layoutFlip tests**

In `src/frontend/src/layout/projection.spec.ts`:
- Delete the test "horizontal: link endpoints follow projected node coordinates" (links no longer exist). Node-coordinate and bounds tests remain and still validate projection.

In `src/frontend/src/motion/layoutFlip.spec.ts`:
- The `layout()` helper takes a `links` arg and the test passes link arrays (≈ lines 11-14, 62-63) and asserts `out.links[0]` (≈ line 75). Change the helper to drop the `links` parameter, stop passing link arrays, and replace the `out.links[0]` assertion with a node-position check that already exists in that test (assert the blended `node('b')` reached `{ x: 0, y: 100 }` at `t = 1`):
```ts
    expect(out.nodes.find(n => n.id === 'b')).toMatchObject({ x: 0, y: 100 });
```

- [ ] **Step 6: Type-check + full test run**

Run: `npm run build && npm test`
Expected: PASS — no references to `links`/`LayoutLink`/`RopeLink`/`oakConnectors` remain. If the type-check flags a leftover import, remove it.

- [ ] **Step 7: Commit**

```bash
git add -A src/frontend/src
git commit -m "Remove the links model and superseded rope connectors

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Documentation

**Files:**
- Modify: `docs/reference/` (the connector/visualization page), `CLAUDE.md`

- [ ] **Step 1: Find the connector reference doc**

Run: `grep -rln "rope\|connector\|red-string\|branch" docs/reference`
Open the matching file(s) and locate the connector/visualization description.

- [ ] **Step 2: Update the reference**

Rewrite the connector description to: connectors are **orthogonal (right-angle)** routes — each couple's lines drop to a shared marriage junction, merge into one trunk, which descends to a sibling **bus bar** that every child hangs from; **junction beads** mark the marriage point and the children-branch point; **Film** renders them as red rope with a woven twist texture, **Classic** as bark strokes; routing works in both orientations and during the orientation morph. Note the tunables (`coupleDrop`, `childRise`) live in `src/frontend/src/layout/familyRouting.ts`.

- [ ] **Step 3: Update the CLAUDE.md overview line**

In `CLAUDE.md`, in the project-overview paragraph, change the Film theme's "red-string rope connectors" phrase to describe rectangular routing through union junction nodes (Film keeps the red colour + rope texture on straight orthogonal segments). Keep it to the existing sentence's style.

- [ ] **Step 4: Commit**

```bash
git add docs/reference CLAUDE.md
git commit -m "Document rectangular family connectors

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Full verification (build, test, live preview)

**Files:** none (verification only).

- [ ] **Step 1: Green build + tests**

Run (from `src/frontend`): `npm run build && npm test`
Expected: type-check clean; all suites PASS.

- [ ] **Step 2: Launch the app**

Use the `run-app` skill (or `node scripts/dev.mjs` from repo root) to start the API + dev server on non-default ports. Open the preview.

- [ ] **Step 3: Verify Classic theme, vertical**

Confirm: couples join into one trunk that spreads to a bus bar; children hang from the bus with vertical stubs; junction beads render at the marriage and children-branch points; **no diagonal fan-out crossings**. Capture a screenshot.

- [ ] **Step 4: Verify Film theme, vertical**

Toggle to Film. Confirm the same topology with red rope colour + twist texture on the straight segments; red junction beads. Capture a screenshot.

- [ ] **Step 5: Verify horizontal orientation**

Toggle orientation. Confirm the structure mirrors 90° (parents left, children right, bus bar vertical) in both themes, and the orientation-morph stays smooth (no snapping connectors). Capture a screenshot.

- [ ] **Step 6: Verify the entrance ceremony**

Trigger "Grow the tree" (replay). Confirm connectors draw in per generation (descent draws with each child generation; couple bars fade in) and nothing is left invisible.

- [ ] **Step 7: Final commit (if any preview-driven constant tweaks)**

If `coupleDrop`/`childRise`/junction size needed tuning during preview, edit `DEFAULT_ROUTE_OPTS` / `JR`, re-run `npm test`, and commit:

```bash
git add -A
git commit -m "Tune connector spacing from live preview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** topology model (T1), pure routing both axes + degenerate cases (T2), themed renderer + junction nodes + both themes (T3), OakTree wiring + morph group (T4), entrance hooks (T3 attrs + T5 buckets), cleanup of `links`/rope code (T6), docs (T7), both-orientation + both-theme + ceremony verification (T8). All spec sections map to a task.
- **Type consistency:** `FamilyUnion` fields (`id`/`parentIds`/`childIds`/`generation`) are used identically in T1, T3, T4, T5. `routeFamily` signature and `FamilyRoute` field names match between T2, T3. `Axis` (`'y'|'x'`) consistent across T2-T4. Connector CSS/`data-test` hooks (`branch__core`, `branch__couple`, `oak__junction`, `data-test="branch"`/`"junction"`) match between T3 component and T4/T3 tests.
- **Additive-then-remove:** `links` survives through T5 so projection/layoutFlip/entranceCues compile; T6 removes it only after all consumers are migrated. Every task ends green.
