# Layout-switch glide (4b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the vertical↔horizontal orientation flip *glide* — medallions ripple to their new positions staggered by generation, branches + year axis cross-fade, and the camera re-frames — in one ~700 ms timeline, instead of snapping.

**Architecture:** "Tween the data" (approach B). A pure module (`layoutFlip.ts`) blends the two `projectLayout` results by a per-generation-staggered progress; a composable (`useLayoutMorph.ts`) drives one linear GSAP scalar `t:0→1` and exposes a reactive `displayLayout` that `OakTree` renders. The camera re-fit reuses `glideTo`; branches/axis cross-fade by opacity. State flips first (Vue keeps ownership of every transform); the morph is layered on top. Instant under reduced motion and for non-manual (responsive / first-load) changes.

**Tech Stack:** Vue 3 + TypeScript, Pinia, GSAP 3 core, Vitest. Design spec: [`docs/superpowers/specs/2026-06-14-layout-switch-glide-design.md`](../specs/2026-06-14-layout-switch-glide-design.md).

---

## File Structure

| File | Responsibility | Create/Modify |
|---|---|---|
| `src/frontend/src/motion/layoutFlip.ts` | Pure blend math: per-generation stagger, `blendLayout`, `branchFade`. No GSAP/DOM. | Create |
| `src/frontend/src/motion/layoutFlip.spec.ts` | Unit tests for the pure math. | Create |
| `src/frontend/src/composables/useLayoutMorph.ts` | Owns the scalar tween; exposes `displayLayout`, `morphProgress`, `branchOrientation`; reduced-motion + manual-only + interruption; drives camera via an injected handle. | Create |
| `src/frontend/src/composables/useLayoutMorph.spec.ts` | Behavioural tests (GSAP mocked). | Create |
| `src/frontend/src/interactions/usePanZoom.ts` | Add `animateFitTo(bounds, durationSec)` and return it. | Modify |
| `src/frontend/src/components/OakTree.vue` | Expose `animateFitTo`; render branch/union opacity from `morphProgress`; branch curve form from `branchOrientation`; remove the instant orientation re-fit watcher. | Modify |
| `src/frontend/src/components/OakTree.spec.ts` | Update for the removed watcher / new props. | Modify |
| `src/frontend/src/views/TreeView.vue` | Host `useLayoutMorph`; pass `displayLayout` + `morphProgress` + `branchOrientation` to `OakTree`; cross-fade `TimeRail`. | Modify |
| `src/frontend/src/views/TreeView.spec.ts` | Cover the wiring. | Modify |
| `docs/reference/features/oak-tree.md` | Document the layout-switch glide under Motion. | Modify |
| `docs/reference/roadmap.md` + `docs/reference/README.md` | Move the layout-switch morph from roadmap to shipped. | Modify |

---

## Task 1: Pure blend module `layoutFlip.ts`

**Files:**
- Create: `src/frontend/src/motion/layoutFlip.ts`
- Test: `src/frontend/src/motion/layoutFlip.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/motion/layoutFlip.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { blendLayout, branchFade, generationOrder, nodeProgress, STAGGER_SPAN } from './layoutFlip';
import type { TreeLayout, LayoutNode } from '../layout/treeLayout';

function node(id: string, generation: number, x: number, y: number): LayoutNode {
  return { id, generation, x, y, year: 1900 + generation * 28, role: 'branch', person: { id } as never };
}

function layout(nodes: LayoutNode[], links: TreeLayout['links'] = []): TreeLayout {
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  return { nodes, links, scale: { minYear: 1900, maxYear: 2000, pxPerYear: 14 } as never, bounds, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}

describe('generationOrder', () => {
  it('lists distinct generations oldest (most negative) first', () => {
    const nodes = [node('a', 1, 0, 0), node('b', -2, 0, 0), node('c', 0, 0, 0), node('d', -2, 0, 0)];
    expect(generationOrder(nodes)).toEqual([-2, 0, 1]);
  });
});

describe('nodeProgress', () => {
  const order = [-2, 0, 2];
  it('is 0 at t=0 and 1 at t=1 for every generation', () => {
    for (const g of order) {
      expect(nodeProgress(g, order, 0)).toBe(0);
      expect(nodeProgress(g, order, 1)).toBeCloseTo(1, 5);
    }
  });
  it('starts the oldest generation before the newest (stagger)', () => {
    // At a small t, the oldest gen (start 0) has moved; the newest (start STAGGER_SPAN) has not.
    const t = STAGGER_SPAN / 2;
    expect(nodeProgress(order[0], order, t)).toBeGreaterThan(0);
    expect(nodeProgress(order[order.length - 1], order, t)).toBe(0);
  });
});

describe('branchFade', () => {
  it('is fully visible at the ends and hidden across the middle', () => {
    expect(branchFade(0)).toBe(1);
    expect(branchFade(1)).toBe(1);
    expect(branchFade(0.5)).toBe(0);
  });
});

describe('blendLayout', () => {
  const from = layout([node('a', 0, 0, 0), node('b', 1, 100, 0)], [{ id: 'l', kind: 'descent', source: 'a', target: 'b', x1: 0, y1: 0, x2: 100, y2: 0 }]);
  const to = layout([node('a', 0, 0, 0), node('b', 1, 0, 100)], [{ id: 'l', kind: 'descent', source: 'a', target: 'b', x1: 0, y1: 0, x2: 0, y2: 100 }]);

  it('equals `from` positions at t=0', () => {
    const out = blendLayout(from, to, 0);
    expect(out.nodes.find(n => n.id === 'b')).toMatchObject({ x: 100, y: 0 });
  });
  it('equals `to` positions at t=1', () => {
    const out = blendLayout(from, to, 1);
    expect(out.nodes.find(n => n.id === 'b')).toMatchObject({ x: 0, y: 100 });
  });
  it('moves link endpoints with their blended nodes', () => {
    const out = blendLayout(from, to, 1);
    expect(out.links[0]).toMatchObject({ x2: 0, y2: 100 });
  });
  it('recomputes bounds from the blended nodes', () => {
    const out = blendLayout(from, to, 1);
    expect(out.bounds).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 100 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=forks src/motion/layoutFlip.spec.ts`
Expected: FAIL — `Failed to resolve import './layoutFlip'`.

- [ ] **Step 3: Write the implementation**

Create `src/frontend/src/motion/layoutFlip.ts`:

```ts
import type { TreeLayout, LayoutNode, LayoutLink } from '../layout/treeLayout';

// Fraction of the timeline spent staggering generation starts; the remainder
// (TRAVEL) is each node's own glide. Tunable on the owner's live review, like
// the ceremony's CEREMONY_TIME_SCALE.
export const STAGGER_SPAN = 0.15;
export const TRAVEL = 1 - STAGGER_SPAN; // 0.85
const FADE = 0.18; // cross-fade-out (start) / -in (end) fraction for branches + axis

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// power2.inOut — matches the layoutSwitch token's ease, applied per node so the
// global driver can stay linear (no double-easing).
function easeInOut2(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Distinct generations, oldest (most negative) → newest. (focus = 0, ancestors
// negative, descendants positive.)
export function generationOrder(nodes: LayoutNode[]): number[] {
  return [...new Set(nodes.map(n => n.generation))].sort((a, b) => a - b);
}

// Eased progress for a node at global linear time t. Each generation begins a
// little after the previous (the ripple); each node then eases over its
// TRAVEL-long window. 0 at t=0, 1 at t=1 for every generation.
export function nodeProgress(generation: number, order: number[], t: number): number {
  const g = order.length;
  const index = order.indexOf(generation);
  const start = g <= 1 ? 0 : STAGGER_SPAN * (index / (g - 1));
  const local = Math.min(1, Math.max(0, (t - start) / TRAVEL));
  return easeInOut2(local);
}

// Cross-fade envelope for branches/unions and the year axis: visible (1) at both
// ends, ~0 across the middle so the geometry can swap under cover.
export function branchFade(t: number): number {
  if (t <= 0 || t >= 1) return 1;
  if (t < FADE) return 1 - t / FADE;
  if (t > 1 - FADE) return (t - (1 - FADE)) / FADE;
  return 0;
}

// Blend two same-topology projections (vertical/horizontal of the same base) at
// global time t. Node positions lerp by their per-generation-staggered progress;
// link endpoints follow their blended nodes; bounds recomputed from them.
export function blendLayout(from: TreeLayout, to: TreeLayout, t: number): TreeLayout {
  const order = generationOrder(to.nodes);
  const fromById = new Map(from.nodes.map(n => [n.id, n]));
  const nodes: LayoutNode[] = to.nodes.map(toNode => {
    const fromNode = fromById.get(toNode.id) ?? toNode;
    const p = nodeProgress(toNode.generation, order, t);
    return { ...toNode, x: lerp(fromNode.x, toNode.x, p), y: lerp(fromNode.y, toNode.y, p) };
  });
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links: LayoutLink[] = to.links.map(link => {
    const s = byId.get(link.source);
    const tgt = byId.get(link.target);
    return { ...link, x1: s?.x ?? link.x1, y1: s?.y ?? link.y1, x2: tgt?.x ?? link.x2, y2: tgt?.y ?? link.y2 };
  });
  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  return { ...to, nodes, links, bounds, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --pool=forks src/motion/layoutFlip.spec.ts`
Expected: PASS (4 describes, all green).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/motion/layoutFlip.ts src/frontend/src/motion/layoutFlip.spec.ts
git commit -m "feat(motion): pure layout-flip blend (stagger, blendLayout, branchFade)"
```

---

## Task 2: Camera helper `animateFitTo` in `usePanZoom`

**Files:**
- Modify: `src/frontend/src/interactions/usePanZoom.ts`

This adds an explicit-bounds animated fit so the morph can re-frame to the *new*
orientation's focus band (the existing `fit()` fits the component's own bounds,
which during a morph are mid-blend).

- [ ] **Step 1: Add the method**

In `src/frontend/src/interactions/usePanZoom.ts`, add `Bounds` to the import from `./panZoom` if not already present (it is imported as a type — confirm `Bounds` is in the import list; it is). Then add this function next to `fit()` (after the `fit` definition, before `onWheel`):

```ts
  // Animated fit to an EXPLICIT bounds (the morph passes the new orientation's
  // focus band). durationSec <= 0 (or reduced motion, handled in glideTo) snaps.
  function animateFitTo(bounds: Bounds, durationSec: number): void {
    const rect = rectOf();
    if (!rect) {
      return;
    }
    const target = fitToBounds(bounds, { width: rect.width, height: rect.height }, padding, options.maxScale ?? Infinity);
    cancelGlide();
    glide = glideTo(viewport, target, { duration: durationSec });
  }
```

- [ ] **Step 2: Return it**

In the returned object at the bottom of `usePanZoom`, add `animateFitTo,` next to `fit,`:

```ts
  return {
    fit,
    animateFitTo,
    svgRef,
    viewport,
    // ...unchanged
```

- [ ] **Step 3: Type-check**

Run: `npx vue-tsc --noEmit -p src/frontend/tsconfig.app.json` (from repo root) — or `npm --prefix src/frontend run build`.
Expected: no new errors. (`Bounds` and `fitToBounds` are already imported.)

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/interactions/usePanZoom.ts
git commit -m "feat(panzoom): animateFitTo(bounds, duration) for explicit-bounds glide"
```

---

## Task 3: The morph composable `useLayoutMorph`

**Files:**
- Create: `src/frontend/src/composables/useLayoutMorph.ts`
- Test: `src/frontend/src/composables/useLayoutMorph.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/composables/useLayoutMorph.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

const mocks = vi.hoisted(() => {
  const tween = { progress: vi.fn(() => tween), kill: vi.fn() };
  return { tween, to: vi.fn(() => mocks.tween) };
});
vi.mock('gsap', () => ({ default: { to: mocks.to } }));

import { useLayoutMorph } from './useLayoutMorph';
import { projectLayout } from '../layout/projection';
import type { TreeLayout } from '../layout/treeLayout';

function baseLayoutFixture(): TreeLayout {
  const nodes = [
    { id: 'a', generation: -1, x: -100, y: 0, year: 1872, role: 'root' as const, person: { id: 'a' } as never },
    { id: 'b', generation: 0, x: 0, y: 100, year: 1900, role: 'trunk' as const, person: { id: 'b' } as never }
  ];
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  return { nodes, links: [], scale: { minYear: 1872, maxYear: 1900, pxPerYear: 14 } as never, bounds, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}

function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') && reduced, media: q, addEventListener() {}, removeEventListener() {} }));
}

let scope: ReturnType<typeof effectScope>;
function run(fn: () => unknown) { scope = effectScope(); return scope.run(fn); }

beforeEach(() => stubMatchMedia(false));
afterEach(() => { scope?.stop(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('useLayoutMorph', () => {
  it('runs one layoutSwitch tween on an explicit toggle and glides the camera', async () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    const orientationExplicit = ref(true);
    const animateFitTo = vi.fn();
    const oak = ref({ animateFitTo });

    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit, oak }));
    orientation.value = 'horizontal';
    await nextTick();

    expect(mocks.to).toHaveBeenCalledTimes(1);
    expect(mocks.to.mock.calls[0][1]).toMatchObject({ t: 1, ease: 'none' });
    expect(animateFitTo).toHaveBeenCalledTimes(1);
    expect(animateFitTo.mock.calls[0][1]).toBeGreaterThan(0); // glide duration
  });

  it('does NOT tween on a responsive (non-explicit) change but still re-fits instantly', async () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    const orientationExplicit = ref(false);
    const animateFitTo = vi.fn();
    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit, oak: ref({ animateFitTo }) }));

    orientation.value = 'horizontal';
    await nextTick();

    expect(mocks.to).not.toHaveBeenCalled();
    expect(animateFitTo).toHaveBeenCalledWith(expect.anything(), 0); // snap
  });

  it('snaps (no tween) under reduced motion', async () => {
    stubMatchMedia(true);
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak: ref({ animateFitTo: vi.fn() }) }));

    orientation.value = 'horizontal';
    await nextTick();

    expect(mocks.to).not.toHaveBeenCalled();
  });

  it('finishes an in-flight morph before starting the next (rapid toggle)', async () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak: ref({ animateFitTo: vi.fn() }) }));

    orientation.value = 'horizontal';
    await nextTick();
    orientation.value = 'vertical';
    await nextTick();

    expect(mocks.tween.progress).toHaveBeenCalledWith(1);
    expect(mocks.tween.kill).toHaveBeenCalled();
    expect(mocks.to).toHaveBeenCalledTimes(2);
  });

  it('displayLayout equals the settled projection when idle', () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('horizontal');
    const out = run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak: ref({ animateFitTo: vi.fn() }) })) as ReturnType<typeof useLayoutMorph>;
    expect(out.displayLayout.value).toEqual(projectLayout(base.value!, 'horizontal'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --pool=forks src/composables/useLayoutMorph.spec.ts`
Expected: FAIL — `Failed to resolve import './useLayoutMorph'`.

- [ ] **Step 3: Write the implementation**

Create `src/frontend/src/composables/useLayoutMorph.ts`:

```ts
import { computed, ref, watch, type Ref } from 'vue';
import gsap from 'gsap';
import type { TreeLayout } from '../layout/treeLayout';
import type { Orientation } from '../stores/uiStore';
import type { Bounds } from '../interactions/panZoom';
import { projectLayout } from '../layout/projection';
import { initialFocusBounds } from '../layout/focusBounds';
import { blendLayout } from '../motion/layoutFlip';
import { motionTokens } from '../motion/tokens';
import { prefersReducedMotion } from '../motion/reducedMotion';

// OakTree exposes this so the morph can re-frame the camera with the SVG rect.
export interface CameraHandle {
  animateFitTo(bounds: Bounds, durationSec: number): void;
}

export interface LayoutMorphOptions {
  baseLayout: Ref<TreeLayout | null>;       // unprojected
  orientation: Ref<Orientation>;
  orientationExplicit: Ref<boolean>;        // false for responsive/first-load
  oak: Ref<CameraHandle | null>;
}

function other(o: Orientation): Orientation {
  return o === 'vertical' ? 'horizontal' : 'vertical';
}

export function useLayoutMorph(options: LayoutMorphOptions) {
  const { baseLayout, orientation, orientationExplicit, oak } = options;

  const settledLayout = computed<TreeLayout | null>(() =>
    baseLayout.value ? projectLayout(baseLayout.value, orientation.value) : null
  );

  const progress = ref(0);
  const morphing = ref(false);
  let from: TreeLayout | null = null;
  let to: TreeLayout | null = null;
  let inFlight: gsap.core.Tween | null = null;

  function finishInFlight(): void {
    if (inFlight) {
      inFlight.progress(1).kill();
      inFlight = null;
    }
  }

  const displayLayout = computed<TreeLayout | null>(() => {
    if (morphing.value && from && to) {
      return blendLayout(from, to, progress.value);
    }
    return settledLayout.value;
  });

  // While fading out (first half) keep the OLD orientation's branch curve form;
  // after the hidden midpoint use the new form. orientation.value is already the
  // new value (state-first), so the old one is its opposite.
  const branchOrientation = computed<Orientation>(() =>
    morphing.value && progress.value < 0.5 ? other(orientation.value) : orientation.value
  );

  watch(orientation, (next, prev) => {
    if (!baseLayout.value) {
      return;
    }
    const toLayout = projectLayout(baseLayout.value, next);
    const motion = orientationExplicit.value && !prefersReducedMotion();

    // Re-frame the camera: glide when animating, snap (duration 0) otherwise.
    // glideTo also snaps under reduced motion as a backstop.
    oak.value?.animateFitTo(initialFocusBounds(toLayout.nodes), motion ? motionTokens.layoutSwitch.duration : 0);

    finishInFlight();
    if (!motion) {
      morphing.value = false; // displayLayout falls through to settledLayout
      return;
    }
    from = projectLayout(baseLayout.value, prev);
    to = toLayout;
    progress.value = 0;
    morphing.value = true;
    const proxy = { t: 0 };
    inFlight = gsap.to(proxy, {
      t: 1,
      duration: motionTokens.layoutSwitch.duration,
      ease: 'none', // linear; per-node easing lives in layoutFlip
      onUpdate: () => { progress.value = proxy.t; },
      onComplete: () => { morphing.value = false; inFlight = null; progress.value = 0; }
    });
  });

  return { displayLayout, morphProgress: progress, branchOrientation, morphing };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --pool=forks src/composables/useLayoutMorph.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/composables/useLayoutMorph.ts src/frontend/src/composables/useLayoutMorph.spec.ts
git commit -m "feat(motion): useLayoutMorph — staggered layout-flip glide + camera re-fit"
```

---

## Task 4: `OakTree` — render the morph, expose the camera, drop the snap watcher

**Files:**
- Modify: `src/frontend/src/components/OakTree.vue`
- Test: `src/frontend/src/components/OakTree.spec.ts`

- [ ] **Step 1: Add props for the morph**

In `OakTree.vue` `defineProps`, add `morphProgress` and `branchOrientation`:

```ts
const props = defineProps<{
  layout: TreeLayout;
  selectedId?: string | null;
  orientation?: 'vertical' | 'horizontal';
  branchOrientation?: 'vertical' | 'horizontal';
  morphProgress?: number;
  centerRequest?: CenterRequest | null;
  entranceCues?: EntranceCues | null;
}>();
```

- [ ] **Step 2: Import `branchFade`**

Add to the imports near `import { fadeIn } from '../motion/fade';`:

```ts
import { branchFade } from '../motion/layoutFlip';
```

- [ ] **Step 3: Destructure `animateFitTo` and expose it; remove the snap watcher**

In the `usePanZoom({...})` destructure, add `animateFitTo`:

```ts
const {
  fit,
  animateFitTo,
  svgRef,
  // ...rest unchanged
} = usePanZoom({ boundsRef, initialBoundsRef, maxScale: 1 });
```

Delete the instant re-fit watcher (the camera re-fit is now owned by `useLayoutMorph`):

```ts
// REMOVE these lines:
// An orientation flip transposes the layout's coordinate space. Re-fit the camera
// unconditionally (even if the user has panned/zoomed) so the oak is never left offscreen.
watch(() => props.orientation, () => { fit(); }, { flush: 'post' });
```

Extend `defineExpose` so the morph can reach the camera:

```ts
defineExpose({
  entranceTargets: () => ({ svg: svgRef.value, viewport }),
  animateFitTo
});
```

- [ ] **Step 4: Cross-fade branches + unions; use `branchOrientation` for curve form**

Add a computed for the cross-fade opacity (near `descentLinks`/`unionLinks`):

```ts
const branchOpacity = computed(() => (props.morphProgress == null ? 1 : branchFade(props.morphProgress)));
```

Update `branchPath` to read the morph-aware orientation (falls back to `orientation`):

```ts
function branchPath(link: LayoutLink): string {
  const o = props.branchOrientation ?? props.orientation ?? 'vertical';
  if (o === 'horizontal') {
    const midX = (link.x1 + link.x2) / 2;
    return `M ${link.x1} ${link.y1} C ${midX} ${link.y1}, ${midX} ${link.y2}, ${link.x2} ${link.y2}`;
  }
  const midY = (link.y1 + link.y2) / 2;
  return `M ${link.x1} ${link.y1} C ${link.x1} ${midY}, ${link.x2} ${midY}, ${link.x2} ${link.y2}`;
}
```

Bind the opacity on the two groups in the template:

```html
<g class="oak__branches" :style="{ opacity: branchOpacity }">
```
```html
<g class="oak__unions" :style="{ opacity: branchOpacity }">
```

- [ ] **Step 5: Update the OakTree test for the removed watcher**

In `src/frontend/src/components/OakTree.spec.ts`, find any test asserting that changing `orientation` calls `fit()` (e.g. names containing "orientation" + "fit"/"re-fit"). Replace its expectation: changing `orientation` should **no longer** trigger an internal `fit()` (the camera is now driven externally via `animateFitTo`). If such a test exists, change it to assert that `animateFitTo` is exposed and that branch geometry follows `branchOrientation`. Concretely add:

```ts
it('exposes animateFitTo for the layout-morph camera re-fit', () => {
  const wrapper = mountOak(); // existing helper in this spec
  expect(typeof (wrapper.vm as unknown as { animateFitTo: unknown }).animateFitTo).toBe('function');
});

it('fades the branch group via morphProgress', async () => {
  const wrapper = mountOak({ morphProgress: 0.5 });
  expect(wrapper.find('.oak__branches').attributes('style')).toContain('opacity: 0');
});
```

Adjust `mountOak` to accept and pass the new props if it doesn't already (spread `props` into the component mount options). If the removed watcher had a dedicated test, delete that test.

- [ ] **Step 6: Run the OakTree tests**

Run: `npx vitest run --pool=forks src/components/OakTree.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/OakTree.vue src/frontend/src/components/OakTree.spec.ts
git commit -m "feat(oak): render layout-flip morph (branch cross-fade, exposed animateFitTo)"
```

---

## Task 5: `TreeView` wiring + `TimeRail` cross-fade

**Files:**
- Modify: `src/frontend/src/views/TreeView.vue`
- Test: `src/frontend/src/views/TreeView.spec.ts`

- [ ] **Step 1: Host the composable**

In `TreeView.vue`, import it and the fade helper near the other motion imports:

```ts
import { useLayoutMorph } from '../composables/useLayoutMorph';
import { branchFade } from '../motion/layoutFlip';
```

After `oakRef` is declared (it is declared for the entrance: `const oakRef = ref<InstanceType<typeof OakTree> | null>(null);`), add:

```ts
const { displayLayout, morphProgress, branchOrientation } = useLayoutMorph({
  baseLayout,
  orientation: computed(() => ui.orientation),
  orientationExplicit: computed(() => ui.orientationExplicit),
  oak: oakRef
});
```

> Note: `oakRef` is declared *after* `baseLayout`/`layout` today. Move the `oakRef`
> declaration up so it precedes this `useLayoutMorph` call (it has no other
> ordering dependency). `displayLayout` mirrors `layout` when idle, so existing
> uses of `layout` (entrance, TimeRail scale, guards) stay valid.

- [ ] **Step 2: Feed the morph to OakTree and cross-fade the rail**

Change the `OakTree` element to pass `displayLayout` and the morph props:

```html
<OakTree
  ref="oakRef"
  :layout="displayLayout ?? layout"
  :selected-id="selectedId"
  :orientation="ui.orientation"
  :branch-orientation="branchOrientation"
  :morph-progress="morphProgress"
  :center-request="centerRequest"
  :entrance-cues="entranceCues"
  @select="onSelect"
  @viewport="onViewport"
/>
```

Update the `TimeRail` opacity to also dip during the morph (combine with the
entrance fade it already has):

```html
<TimeRail
  class="tree-view__rail"
  :scale="layout.scale"
  :viewport="oakViewport"
  :orientation="ui.orientation"
  :style="{ opacity: entranceActive ? 0 : branchFade(morphProgress), transition: 'opacity var(--motion-fade-ms) ease' }"
/>
```

- [ ] **Step 3: Add the wiring test**

In `src/frontend/src/views/TreeView.spec.ts`, add a test that an explicit toggle
drives a morph. Mock GSAP the same way as `useLayoutMorph.spec` (hoisted `to`),
or assert at the DOM level that `OakTree` receives a `morph-progress` prop and the
rail opacity reacts. Minimal DOM-level assertion:

```ts
it('passes morph props to OakTree', () => {
  const wrapper = mountTreeView(); // existing helper
  const oak = wrapper.findComponent({ name: 'OakTree' });
  expect(oak.props()).toHaveProperty('morphProgress');
  expect(oak.props()).toHaveProperty('branchOrientation');
});
```

If `mountTreeView` doesn't set a component name, match by the `data-test="oak-svg"`
ancestor or by `findComponent(OakTree)` with the imported component.

- [ ] **Step 4: Run TreeView tests**

Run: `npx vitest run --pool=forks src/views/TreeView.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/TreeView.vue src/frontend/src/views/TreeView.spec.ts
git commit -m "feat(tree): wire layout-switch glide (displayLayout + rail cross-fade)"
```

---

## Task 6: Full verification, live check & docs

**Files:**
- Modify: `docs/reference/features/oak-tree.md`
- Modify: `docs/reference/roadmap.md`, `docs/reference/README.md`

- [ ] **Step 1: Full suite + type-check/build**

Run: `npx vitest run --pool=forks` (from `src/frontend`)
Expected: all green (≈ +14 new tests).
Run: `npm run build` (from `src/frontend`)
Expected: vue-tsc clean, build succeeds.

- [ ] **Step 2: Live check (custom port — never the defaults)**

Start the dev server on a custom port (e.g. 5210) per the `run-app` skill, open it, and toggle orientation with the `OrientationToggle`. Confirm:
- medallions glide (oldest generation begins first), no snap;
- branches + the time rail cross-fade (no branches stretching mid-flight);
- camera re-frames to the new orientation;
- rapid double-toggle settles cleanly (no stranded nodes);
- with OS "reduce motion" on, the switch is instant.

Note: the headless preview reports a 0×0 viewport (forces mobile/chips and breaks `fit`), so judge the glide in a real browser, not the headless preview snapshot.

- [ ] **Step 3: Sync the reference docs**

In [`docs/reference/features/oak-tree.md`](../../reference/features/oak-tree.md), under **Motion**, add a row/section describing the layout-switch glide: per-generation staggered node glide on a manual orientation toggle, branch/union + year-axis cross-fade, camera re-fit, ~700 ms `layoutSwitch` token; instant under reduced motion and for responsive/first-load changes. Remove the line stating `morph`/`layoutSwitch` tokens are "defined and unused" for `layoutSwitch` (it is now used; `morph` remains used by the dock).

In [`docs/reference/roadmap.md`](../../reference/roadmap.md) and the live-vs-roadmap callout in [`docs/reference/README.md`](../../reference/README.md), move the vertical↔horizontal layout-switch morph from roadmap to shipped.

- [ ] **Step 4: Commit docs**

```bash
git add docs/reference
git commit -m "docs: layout-switch glide shipped (reference sync)"
```

- [ ] **Step 5: Push & open PR (do NOT self-merge)**

```bash
git push -u origin feat/layout-switch-glide
gh pr create --base main --title "Glide the oak between vertical and horizontal layouts" --body "<summary + test notes>"
```

Owner reviews and merges. Expect a live-review tuning pass on `STAGGER_SPAN` / `TRAVEL` / `FADE` (the feel), mirroring the 4a flow.

---

## Self-Review

**Spec coverage** — every spec section maps to a task:
- Per-generation glide + stagger math → Task 1 (`nodeProgress`, `blendLayout`) + Task 3 (driver).
- Branch/union cross-fade → Task 1 (`branchFade`) + Task 4 (group opacity, `branchOrientation`).
- Year-axis cross-fade → Task 5 (rail opacity).
- Camera re-fit → Task 2 (`animateFitTo`) + Task 3 (invocation) + Task 4 (expose).
- Manual-toggle-only guard → Task 3 (`orientationExplicit` gate; first-load is the watcher's non-firing initial state since `watch` is not `immediate`).
- Reduced motion → Task 3 (`prefersReducedMotion`) + `glideTo` backstop.
- Interruption → Task 3 (`finishInFlight`).
- Tests → Tasks 1, 3, 4, 5; live check → Task 6.

**Placeholder scan** — no TBD/TODO; all code blocks are complete; the only `<summary>` placeholder is the PR body text in Task 6 Step 5, which is authored at PR time.

**Type consistency** — `animateFitTo(bounds, durationSec)` matches across `usePanZoom` (Task 2), the `CameraHandle` interface and call site (Task 3), and the `defineExpose` (Task 4). `displayLayout`/`morphProgress`/`branchOrientation` names match between `useLayoutMorph`'s return (Task 3) and `TreeView`/`OakTree` consumption (Tasks 4–5). `blendLayout`/`branchFade`/`nodeProgress`/`generationOrder` names match between `layoutFlip.ts` (Task 1) and its consumers (Tasks 3–4).
