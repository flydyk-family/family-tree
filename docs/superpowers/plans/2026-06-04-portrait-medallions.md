# Portrait Medallions & Era-Focused Default View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each oak node as an era-framed portrait-oval medallion (portrait image or initials) with a birth–death label below it, and open the tree framed on the two most-recent generations (excluding the newest tier).

**Architecture:** A new presentational `PersonMedallion.vue` owns the per-node visuals (oval, era frame, image/initials, name, dates); `OakTree.vue` keeps node geometry, interaction, accessibility, and a shared gilt gradient `<defs>`. A pure `initialFocusBounds(nodes)` helper feeds `usePanZoom`'s first `fit()`. A `formatYearSpan` helper formats bare year numbers. Frontend-only — backend untouched.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), SCSS design tokens, Pinia (locale store), Vitest + Vue Test Utils, Vite.

**Spec:** [`docs/superpowers/specs/2026-06-04-portrait-medallions-design.md`](../specs/2026-06-04-portrait-medallions-design.md)

**Working dir for all commands:** `src/frontend` (run `cd src/frontend` first; the repo root is the family-tree checkout). Branch: `feature-frontend-portrait-medallions` (already created off `integration`).

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `src/frontend/src/format/lifespan.ts` | add `formatYearSpan(birthYear, deathYear)`; refactor shared join core | 1 |
| `src/frontend/src/format/lifespan.spec.ts` | tests for `formatYearSpan` | 1 |
| `src/frontend/src/styles/tokens.scss` | muted-gilt token ramp | 2 |
| `src/frontend/src/layout/focusBounds.ts` | pure `initialFocusBounds(nodes, opts)` | 3 |
| `src/frontend/src/layout/focusBounds.spec.ts` | tests for `initialFocusBounds` | 3 |
| `src/frontend/src/interactions/usePanZoom.ts` | optional `initialBoundsRef`; expose `fit` | 4 |
| `src/frontend/src/interactions/usePanZoom.spec.ts` | tests for initial-fit selection | 4 |
| `src/frontend/src/components/PersonMedallion.vue` | per-node oval/frame/image/initials/name/dates | 5 |
| `src/frontend/src/components/PersonMedallion.spec.ts` | medallion tests | 5 |
| `src/frontend/src/components/OakTree.vue` | render `PersonMedallion`, gilt `<defs>`, pass `initialBoundsRef` | 6 |
| `src/frontend/src/components/OakTree.spec.ts` | ellipse-per-node assertion | 6 |
| `src/frontend/vite.config.ts` | proxy `/assets` to the API in dev | 7 |

---

## Task 1: `formatYearSpan` helper

**Files:**
- Modify: `src/frontend/src/format/lifespan.ts`
- Test: `src/frontend/src/format/lifespan.spec.ts`

- [ ] **Step 1: Write the failing tests** — append this block inside `src/frontend/src/format/lifespan.spec.ts` (after the existing `describe('formatLifespan', …)` block), and add `formatYearSpan` to the import on line 2.

Change line 2 from:

```ts
import { formatLifespan } from './lifespan';
```

to:

```ts
import { formatLifespan, formatYearSpan } from './lifespan';
```

Append:

```ts
describe('formatYearSpan', () => {
  it('renders birth and death years separated by an en dash', () => {
    expect(formatYearSpan(1762, 1828)).toBe('1762–1828');
  });

  it('leaves the death side open for a living person', () => {
    expect(formatYearSpan(1962, null)).toBe('1962–');
  });

  it('renders only the death year when the birth year is unknown', () => {
    expect(formatYearSpan(null, 1900)).toBe('–1900');
  });

  it('returns an empty string when no years are known', () => {
    expect(formatYearSpan(null, null)).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src/frontend && npx vitest run src/format/lifespan.spec.ts`
Expected: FAIL — `formatYearSpan is not a function` / import has no exported member.

- [ ] **Step 3: Implement** — replace the entire contents of `src/frontend/src/format/lifespan.ts` with:

```ts
import type { LifeEvent } from '../types/family';

function eventYear(event: LifeEvent | null): string {
  if (!event || event.year == null) {
    return '';
  }
  return `${event.approx ? '~' : ''}${event.year}`;
}

function plainYear(value: number | null): string {
  return value == null ? '' : `${value}`;
}

function join(birthText: string, deathText: string): string {
  if (birthText === '' && deathText === '') {
    return '';
  }
  return `${birthText}–${deathText}`;
}

// Locale-neutral lifespan from LifeEvent objects: "1762–1828", "~1762–~1828",
// "1962–" (living), "–1900" (unknown birth), or "" when nothing is known.
export function formatLifespan(birth: LifeEvent | null, death: LifeEvent | null): string {
  return join(eventYear(birth), eventYear(death));
}

// Same locale-neutral shape from bare year numbers (PersonSummary carries no
// approx flag, so there is no leading tilde).
export function formatYearSpan(birthYear: number | null, deathYear: number | null): string {
  return join(plainYear(birthYear), plainYear(deathYear));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src/frontend && npx vitest run src/format/lifespan.spec.ts`
Expected: PASS — all `formatLifespan` and `formatYearSpan` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/format/lifespan.ts src/frontend/src/format/lifespan.spec.ts
git commit -m "feat(frontend): add formatYearSpan for bare birth/death year numbers"
```

---

## Task 2: Muted-gilt design tokens

**Files:**
- Modify: `src/frontend/src/styles/tokens.scss`

No test (pure token declarations); verified by the typecheck/build in later tasks.

- [ ] **Step 1: Add the gilt ramp** — replace the entire contents of `src/frontend/src/styles/tokens.scss` with:

```scss
// Faded XIX-century natural palette
$bark-dark:   #6b5844;
$bark:        #7a6450;
$leaf-deep:   #7d8a5f;
$leaf:        #9ca57a;
$parchment:   #efe7d4;
$parchment-2: #f0e9d6;
$ink:         #4a3f33;
$ink-soft:    #5f5240;

// Muted "faded gilt" ramp for classic (pre-1950) portrait frames — kept
// low-chroma so it sits inside the palette.
$gilt-light:  #dcc391;
$gilt:        #b2935c;
$gilt-deep:   #7c5f38;
$gilt-sheen:  #e8d6ab;

:root {
  --bark-dark: #{$bark-dark};
  --bark: #{$bark};
  --leaf-deep: #{$leaf-deep};
  --leaf: #{$leaf};
  --parchment: #{$parchment};
  --parchment-2: #{$parchment-2};
  --ink: #{$ink};
  --ink-soft: #{$ink-soft};
  --gilt-light: #{$gilt-light};
  --gilt: #{$gilt};
  --gilt-deep: #{$gilt-deep};
  --gilt-sheen: #{$gilt-sheen};
  // Glass popup surface (§7): translucent parchment with a thin bark border.
  --glass-bg: rgba(240, 233, 214, 0.62);
  --glass-border: rgba(95, 82, 64, 0.38);
  --glass-shadow: 0 12px 40px rgba(74, 63, 51, 0.28);
  --scrim: rgba(74, 63, 51, 0.28);
}
```

- [ ] **Step 2: Verify the stylesheet still compiles** — run the existing suite (any spec that imports a component pulling tokens will fail fast if SCSS is broken).

Run: `cd src/frontend && npx vitest run src/components/PersonPopup.spec.ts`
Expected: PASS (unchanged behaviour; confirms tokens.scss compiles).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/styles/tokens.scss
git commit -m "feat(frontend): add muted-gilt palette tokens"
```

---

## Task 3: `initialFocusBounds` helper

**Files:**
- Create: `src/frontend/src/layout/focusBounds.ts`
- Test: `src/frontend/src/layout/focusBounds.spec.ts`

- [ ] **Step 1: Write the failing tests** — create `src/frontend/src/layout/focusBounds.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initialFocusBounds } from './focusBounds';
import type { LayoutNode } from './treeLayout';

function node(generation: number, x: number, y: number): LayoutNode {
  return {
    id: `g${generation}_${x}_${y}`,
    x,
    y,
    year: 1900 + generation * 25,
    role: 'branch',
    generation
  } as LayoutNode;
}

describe('initialFocusBounds', () => {
  it('frames the two most-recent generations below the newest tier', () => {
    const nodes = [
      node(2, 0, -100), // newest tier — excluded
      node(1, -10, -50),
      node(1, 20, -50),
      node(0, -30, 0),
      node(0, 40, 0),
      node(-1, 5, 60) // older — excluded
    ];

    expect(initialFocusBounds(nodes)).toEqual({ minX: -30, maxX: 40, minY: -50, maxY: 0 });
  });

  it('falls back to all nodes when there are fewer than three generations', () => {
    const nodes = [node(1, 0, -50), node(0, 10, 0)];

    expect(initialFocusBounds(nodes)).toEqual({ minX: 0, maxX: 10, minY: -50, maxY: 0 });
  });

  it('returns zero bounds for an empty node list', () => {
    expect(initialFocusBounds([])).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src/frontend && npx vitest run src/layout/focusBounds.spec.ts`
Expected: FAIL — cannot find module `./focusBounds`.

- [ ] **Step 3: Implement** — create `src/frontend/src/layout/focusBounds.ts`:

```ts
import type { LayoutNode } from './treeLayout';

export interface FocusBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface FocusBoundsOptions {
  generations?: number;
  excludeNewest?: number;
}

function boundsOf(nodes: LayoutNode[]): FocusBounds {
  if (nodes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  const xs = nodes.map(node => node.x);
  const ys = nodes.map(node => node.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

// Bounds for the initial camera: frame the `generations` most-recent generations
// after dropping the `excludeNewest` newest tier(s). If the tree has fewer than
// `excludeNewest + generations` distinct generations it is too shallow to drop a
// tier, so frame everything instead.
export function initialFocusBounds(nodes: LayoutNode[], options: FocusBoundsOptions = {}): FocusBounds {
  if (nodes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  const generations = options.generations ?? 2;
  const excludeNewest = options.excludeNewest ?? 1;

  const distinct = [...new Set(nodes.map(node => node.generation))].sort((a, b) => b - a);
  if (distinct.length < excludeNewest + generations) {
    return boundsOf(nodes);
  }

  const window = new Set(distinct.slice(excludeNewest, excludeNewest + generations));
  return boundsOf(nodes.filter(node => window.has(node.generation)));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src/frontend && npx vitest run src/layout/focusBounds.spec.ts`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/layout/focusBounds.ts src/frontend/src/layout/focusBounds.spec.ts
git commit -m "feat(frontend): add initialFocusBounds for era-focused default view"
```

---

## Task 4: `usePanZoom` initial-focus fit

**Files:**
- Modify: `src/frontend/src/interactions/usePanZoom.ts`
- Test: `src/frontend/src/interactions/usePanZoom.spec.ts`

- [ ] **Step 1: Write the failing tests** — in `src/frontend/src/interactions/usePanZoom.spec.ts`, replace the `host` helper (lines 7–19) with a version that accepts optional initial bounds:

```ts
function host(bounds: Bounds | null, initialBounds: Bounds | null = null) {
  const api: { current?: ReturnType<typeof usePanZoom> } = {};
  const Comp = defineComponent({
    setup() {
      const boundsRef = ref<Bounds | null>(bounds);
      const initialBoundsRef = ref<Bounds | null>(initialBounds);
      const pz = usePanZoom({ boundsRef, initialBoundsRef, padding: 40 });
      api.current = pz;
      return () => h('svg', { ref: pz.svgRef });
    }
  });
  const wrapper = mount(Comp);
  return { wrapper, pz: api.current! };
}
```

Then append these two tests inside the `describe('usePanZoom', …)` block (before its closing `});`):

```ts
  it('initial fit frames the provided initialBounds rather than the full bounds', () => {
    const { pz } = host(
      { minX: 0, maxX: 1000, minY: 0, maxY: 1000 },
      { minX: 0, maxX: 100, minY: 0, maxY: 100 }
    );
    (pz.svgRef.value as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      () => ({ width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;

    pz.fit();

    // fitToBounds({0..100}, {200,200}, 40): k = (200-80)/100 = 1.2; centre 50 → x = 100 - 60 = 40
    expect(pz.viewport.value).toEqual({ x: 40, y: 40, k: 1.2 });
  });

  it('initial fit falls back to the full bounds when no initialBounds is given', () => {
    const { pz } = host({ minX: 0, maxX: 1000, minY: 0, maxY: 1000 });
    (pz.svgRef.value as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      () => ({ width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;

    pz.fit();

    expect(pz.viewport.value.k).toBeCloseTo(0.12); // (200-80)/1000
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src/frontend && npx vitest run src/interactions/usePanZoom.spec.ts`
Expected: FAIL — `pz.fit is not a function` (and the `initialBoundsRef` option is not yet accepted).

- [ ] **Step 3: Implement** — make three edits to `src/frontend/src/interactions/usePanZoom.ts`:

(a) Add `initialBoundsRef` to the options interface (replace the existing `UsePanZoomOptions`):

```ts
interface UsePanZoomOptions {
  boundsRef: Ref<Bounds | null>;
  initialBoundsRef?: Ref<Bounds | null>;
  padding?: number;
  limits?: ScaleLimits;
}
```

(b) Replace the `fit` function so it prefers the initial bounds on first/auto fit:

```ts
  function fit(): void {
    const rect = rectOf();
    const bounds = options.initialBoundsRef?.value ?? options.boundsRef.value;
    if (!rect || !bounds) {
      return;
    }
    viewport.value = fitToBounds(bounds, { width: rect.width, height: rect.height }, padding);
  }
```

(c) Expose `fit` on the returned object — add `fit,` as the first entry of the returned object literal (the `return { … }` near the end):

```ts
  return {
    fit,
    svgRef,
    viewport,
    transform,
    dragMoved,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src/frontend && npx vitest run src/interactions/usePanZoom.spec.ts`
Expected: PASS — existing pan/zoom tests plus the two new fit tests.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/interactions/usePanZoom.ts src/frontend/src/interactions/usePanZoom.spec.ts
git commit -m "feat(frontend): let usePanZoom frame an initial focus bounds"
```

---

## Task 5: `PersonMedallion.vue` component

**Files:**
- Create: `src/frontend/src/components/PersonMedallion.vue`
- Test: `src/frontend/src/components/PersonMedallion.spec.ts`

- [ ] **Step 1: Write the failing tests** — create `src/frontend/src/components/PersonMedallion.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PersonMedallion from './PersonMedallion.vue';
import { useLocaleStore } from '../stores/localeStore';
import type { LayoutNode } from '../layout/treeLayout';
import type { PersonSummary } from '../types/family';

function person(overrides: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id: 'p1',
    givenName: { ru: 'Анна', be: null, en: 'Anna' },
    surname: { ru: 'Икс', be: null, en: 'X' },
    maidenName: null,
    sex: 'female',
    birthYear: 1850,
    deathYear: 1916,
    vocation: 'other',
    portrait: null,
    parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false,
    isDefaultRoot: false,
    ...overrides
  };
}

function node(nodeOverrides: Partial<LayoutNode> = {}, personOverrides: Partial<PersonSummary> = {}): LayoutNode {
  const p = person(personOverrides);
  return {
    id: p.id,
    person: p,
    x: 0,
    y: 0,
    year: p.birthYear ?? 1900,
    role: 'branch',
    generation: 0,
    ...nodeOverrides
  };
}

function mountNode(n: LayoutNode, selected = false) {
  return mount(PersonMedallion, { props: { node: n, selected } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
});

describe('PersonMedallion', () => {
  it('renders an oval medallion, not a circle', () => {
    const wrapper = mountNode(node());
    expect(wrapper.find('ellipse.oak__medallion--fill').exists()).toBe(true);
    expect(wrapper.find('circle').exists()).toBe(false);
  });

  it('shows the initial of the localized name when there is no portrait', () => {
    const wrapper = mountNode(node());
    expect(wrapper.find('.oak__initials').text()).toBe('A');
    expect(wrapper.find('[data-test="portrait"]').exists()).toBe(false);
  });

  it('renders a portrait image from the assets path when a portrait exists', () => {
    const wrapper = mountNode(node({}, { portrait: 'p-0001.jpg' }));
    const image = wrapper.find('[data-test="portrait"]');
    expect(image.exists()).toBe(true);
    expect(image.attributes('href')).toBe('/assets/portraits/p-0001.jpg');
    expect(wrapper.find('.oak__initials').exists()).toBe(false);
  });

  it('uses the engraved (modern) frame for births in 1950 or later', () => {
    const wrapper = mountNode(node({}, { birthYear: 1980 }));
    expect(wrapper.find('.oak__medallion--fill').attributes('data-era')).toBe('modern');
    expect(wrapper.find('.oak__rule-inner').exists()).toBe(true);
  });

  it('uses the gilt (classic) frame for births before 1950', () => {
    const wrapper = mountNode(node({}, { birthYear: 1900 }));
    expect(wrapper.find('.oak__medallion--fill').attributes('data-era')).toBe('classic');
    expect(wrapper.find('.oak__gilt-band').exists()).toBe(true);
  });

  it('falls back to the layout year for the frame era when birth year is unknown', () => {
    const wrapper = mountNode(node({ year: 1980 }, { birthYear: null }));
    expect(wrapper.find('.oak__medallion--fill').attributes('data-era')).toBe('modern');
  });

  it('renders the birth–death label below the medallion', () => {
    const wrapper = mountNode(node({}, { birthYear: 1850, deathYear: 1916 }));
    expect(wrapper.find('[data-test="lifespan"]').text()).toBe('1850–1916');
  });

  it('marks the medallion selected when the selected prop is set', () => {
    const wrapper = mountNode(node(), true);
    expect(wrapper.find('.oak__medallion--selected').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src/frontend && npx vitest run src/components/PersonMedallion.spec.ts`
Expected: FAIL — cannot find module `./PersonMedallion.vue`.

- [ ] **Step 3: Implement** — create `src/frontend/src/components/PersonMedallion.vue`:

```vue
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src/frontend && npx vitest run src/components/PersonMedallion.spec.ts`
Expected: PASS — all eight medallion tests green.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonMedallion.vue src/frontend/src/components/PersonMedallion.spec.ts
git commit -m "feat(frontend): add PersonMedallion portrait-oval component"
```

---

## Task 6: Integrate `PersonMedallion` into `OakTree`

**Files:**
- Modify: `src/frontend/src/components/OakTree.vue`
- Test: `src/frontend/src/components/OakTree.spec.ts`

- [ ] **Step 1: Write the failing test** — append this test inside the `describe('OakTree', …)` block of `src/frontend/src/components/OakTree.spec.ts` (before its closing `});`):

```ts
  it('renders an oval medallion (not a circle) per person', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    expect(wrapper.findAll('ellipse.oak__medallion--fill')).toHaveLength(2);
    expect(wrapper.findAll('circle')).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/frontend && npx vitest run src/components/OakTree.spec.ts`
Expected: FAIL — found `0` `ellipse.oak__medallion--fill` (OakTree still renders `<circle>`).

- [ ] **Step 3: Implement** — replace the entire contents of `src/frontend/src/components/OakTree.vue` with:

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { TreeLayout, LayoutNode, LayoutLink } from '../layout/treeLayout';
import { initialFocusBounds } from '../layout/focusBounds';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { usePanZoom } from '../interactions/usePanZoom';
import PersonMedallion from './PersonMedallion.vue';
import type { Bounds, Viewport } from '../interactions/panZoom';

const props = defineProps<{ layout: TreeLayout; selectedId?: string | null }>();
const emit = defineEmits<{ select: [id: string]; viewport: [Viewport] }>();

const localeStore = useLocaleStore();

const boundsRef = computed<Bounds>(() => props.layout.bounds);
const initialBoundsRef = computed<Bounds>(() => initialFocusBounds(props.layout.nodes));
const {
  svgRef,
  viewport,
  transform,
  dragMoved,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTouchStart,
  onTouchMove,
  onTouchEnd
} = usePanZoom({ boundsRef, initialBoundsRef });

// Surface the pan/zoom viewport so the year axis can apply the same vertical
// transform and stay aligned with the nodes.
watch(viewport, value => emit('viewport', value), { immediate: true });

// Hide the oak until usePanZoom's onMounted fit has positioned it, so the
// first paint never shows the tree at the raw identity transform.
const ready = ref(false);
onMounted(() => {
  ready.value = true;
});

function displayName(node: LayoutNode): string {
  return localize(node.person.givenName, localeStore.currentLocale);
}

function onNodeActivate(node: LayoutNode): void {
  // Ignore the click that ends a pan drag.
  if (dragMoved.value) {
    return;
  }
  emit('select', node.id);
}

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

const descentLinks = computed(() => props.layout.links.filter(link => link.kind === 'descent'));
const unionLinks = computed(() => props.layout.links.filter(link => link.kind === 'union'));
</script>

<template>
  <svg
    ref="svgRef"
    class="oak"
    data-test="oak-svg"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
    @touchstart.passive="onTouchStart"
    @touchmove.prevent="onTouchMove"
    @touchend="onTouchEnd"
  >
    <defs>
      <linearGradient id="oak-gilt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style="stop-color: var(--gilt-light)" />
        <stop offset="45%" style="stop-color: var(--gilt)" />
        <stop offset="100%" style="stop-color: var(--gilt-deep)" />
      </linearGradient>
    </defs>

    <g class="oak__viewport" :transform="transform" :style="{ opacity: ready ? 1 : 0 }">
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
          role="button"
          tabindex="0"
          :aria-label="displayName(node)"
          :transform="`translate(${node.x}, ${node.y})`"
          :class="['oak__node', `oak__node--${node.role}`, { 'oak__node--selected': node.id === selectedId }]"
          @click="onNodeActivate(node)"
          @keydown.enter.prevent="onNodeActivate(node)"
          @keydown.space.prevent="onNodeActivate(node)"
        >
          <PersonMedallion :node="node" :selected="node.id === selectedId" />
        </g>
      </g>
    </g>
  </svg>
</template>

<style scoped lang="scss">
.oak {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none; // we handle pan/pinch ourselves
  cursor: grab;
  user-select: none;

  &:active { cursor: grabbing; }

  &__viewport {
    transition: opacity 0.15s ease;
  }

  &__node {
    cursor: pointer;
    &:focus-visible { outline: none; }
  }

  &__branch {
    stroke: var(--bark);
  }
  &__union {
    stroke: var(--bark-dark);
    stroke-width: 2;
    stroke-dasharray: 2 3;
  }
}

// The medallion lives in the PersonMedallion child; pierce scope to apply the
// keyboard-focus highlight to its frame ellipses.
.oak__node:focus-visible :deep(.oak__medallion) {
  stroke: var(--leaf-deep);
  stroke-width: 3;
}
</style>
```

- [ ] **Step 4: Run the OakTree tests to verify they pass**

Run: `cd src/frontend && npx vitest run src/components/OakTree.spec.ts`
Expected: PASS — the new ellipse-per-node test plus all existing node/branch/name/locale/select/selected tests.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `cd src/frontend && npm test`
Expected: PASS — every spec green.

Run: `cd src/frontend && npm run build`
Expected: `vue-tsc` reports no type errors and the build completes (confirms the `FocusBounds`→`Bounds` structural typing and the new component compile).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/OakTree.vue src/frontend/src/components/OakTree.spec.ts
git commit -m "feat(frontend): render oak nodes as portrait medallions with focused default view"
```

---

## Task 7: Proxy `/assets` to the API in dev

**Files:**
- Modify: `src/frontend/vite.config.ts`

No automated test (dev-server config); validated by the build in Task 6 and by the manual check below.

- [ ] **Step 1: Add the proxy entry** — in `src/frontend/vite.config.ts`, replace the `proxy` block (currently only `/api`) with:

```ts
    proxy: {
      '/api': { target: 'http://localhost:5037', changeOrigin: true },
      '/assets': { target: 'http://localhost:5037', changeOrigin: true }
    }
```

- [ ] **Step 2: Verify the config still parses** — Vitest loads `vite.config.ts`, so a green run confirms it is valid.

Run: `cd src/frontend && npm test`
Expected: PASS — full suite green (no config parse error).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/vite.config.ts
git commit -m "chore(frontend): proxy /assets to the API in dev"
```

---

## Final verification (after all tasks)

- [ ] **Full suite green:** `cd src/frontend && npm test` → all specs pass.
- [ ] **Typecheck/build green:** `cd src/frontend && npm run build` → no `vue-tsc` errors.
- [ ] **Optional manual look** (not required for completion): run `npm run dev` with the backend up and confirm the oak opens framed on the recent generations, medallions show initials placeholders in ovals, modern nodes get the engraved frame and pre-1950 nodes the gilt frame, and birth–death labels sit below each node. (Portrait `<image>` is forward-wiring — seed data has no portraits, so initials are expected everywhere.)

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §3 Component split `PersonMedallion.vue` (renders name/oval/image/initials/dates; OakTree keeps `<g>`/interaction/aria; localized via locale store) | 5, 6 |
| §4 Geometry — `nodeRadii` role-scaled ovals (trunk 15×19, branch/root 12×15, leaf 10×13) | 5 |
| §5 Era frame — modern engraved ≥1950 / classic gilt <1950, fallback to `node.year`; both frame rings carry `oak__medallion` | 5 |
| §6 Portrait image (clipPath + `<image>` slice + `data-test="portrait"`) vs initials; gilt gradient in OakTree `<defs>` | 5, 6 |
| §7 Muted-gilt tokens | 2 |
| §8 `/assets/portraits/<file>` URL + `/assets` dev proxy | 5 (URL), 7 (proxy) |
| §9 `formatYearSpan` + refactor; name moved up, dates below | 1, 5 |
| §10 `initialFocusBounds` + `usePanZoom` wiring | 3, 4, 6 |
| §11 TDD: lifespan / PersonMedallion / focusBounds / OakTree | 1, 5, 3, 6 |
| §12 Conventions (script-setup, scoped SCSS tokens, data-test, descriptive `it`) | all |

No spec requirement is left without a task.

**2. Placeholder scan** — every code step contains complete file contents or exact edits; commands have exact paths and expected output. No TBD/TODO/"handle edge cases" left.

**3. Type consistency** — `initialFocusBounds(nodes)` returns `FocusBounds` (`{minX,maxX,minY,maxY}`), structurally assignable to `Bounds` (consumed by `usePanZoom`'s `initialBoundsRef: Ref<Bounds | null>` and OakTree's `computed<Bounds>`). `radiiFor(role: NodeRole)` uses the exported `NodeRole` type from `treeLayout`. `frameStyle`/`era` returns `'modern' | 'classic'`, matching the CSS class names `oak__medallion--modern|classic` and the `data-era` test assertions. `portraitHref` → `/assets/portraits/${portrait}`, matching the Task-5 test and the §8 proxy path. `formatYearSpan(birthYear, deathYear)` signature matches its call in `PersonMedallion` and its tests. `usePanZoom` now returns `fit`, used by the Task-4 tests.
