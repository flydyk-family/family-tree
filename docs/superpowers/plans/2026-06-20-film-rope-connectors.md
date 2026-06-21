# Film Rope Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Film (`eighties`) theme, replace the inherited "oak bark" descent branches with **red string strung between the photo cards** — a thin twisted cord that sags, with a metal push-pin where each cord meets a card — and recolour the couple/union ties to match. Classic theme keeps its bark branches unchanged.

**Architecture:** A pure `ropePath()` geometry helper (sagging quadratic) feeds a small presentational `RopeLink.vue` that renders the layered cord (shadow + solid core + two dashed twist overlays). `OakTree.vue` switches its descent group between the classic single `<path>` and the Film rope per `ui.theme`; pins render in a deduped group. The cord's solid **core** carries the existing ceremony/test hooks so "Grow the tree", the morph fade, and current tests keep working.

**Tech Stack:** Vue 3 + TypeScript, SVG, GSAP entrance motion, SCSS tokens, Vitest + @vue/test-utils.

## Global Constraints

- Film theme only (`ui.theme === 'eighties'` or `:root[data-theme='eighties']`). **Classic renders exactly as today** — same `branchPath`, `branchWidth`, `--bark`. Do not repurpose `--bark` / `--bark-dark`.
- The descent **core** path must keep `data-test="branch"`, `:data-link-id`, and `:data-entrance-draw="linkGeneration(link)"` so `OakTree.spec.ts` (asserts `data-entrance-draw` == child generation per `data-link-id`) and `motion/entrance.ts` (sets `strokeDasharray`/`strokeDashoffset` on `[data-entrance-draw]`) keep working.
- **Twist dashes live only on the overlay layers, never on the core** — the ceremony overwrites the core's dash properties; a dashed core would be clobbered.
- No new npm dependencies. Frontend tests: `npm --prefix src/frontend test`. Build: `npm --prefix src/frontend run build`.
- **Open visual pick (non-blocking):** the cord colour defaults to **red** (`--rope: #b5302a`). During implementation, audition red vs rust (`#9c4a25`) / oxblood / cream against the metal backdrop and set the `--rope*` tokens accordingly — the geometry/markup is colour-independent.
- Run the app: `node scripts/dev.mjs --instance 7` (`:5180` / `:5044`).
- `LayoutLink` shape (from `src/frontend/src/layout/treeLayout.ts`): `{ id: string; kind: 'descent'|'union'; source: string; target: string; x1,y1,x2,y2: number }`. For a descent link, `(x1,y1)` is the parent-side endpoint, `(x2,y2)` the child-side.

---

### Task 1: Rope/pin tokens

**Files:**
- Modify: `src/frontend/src/styles/themes/eighties.scss` (token block)

**Interfaces:**
- Produces: `--rope`, `--rope-twist-hi`, `--rope-twist-lo`, `--pin` (consumed by `RopeLink.vue` Task 3, pins Task 5, union CSS Task 6).

- [ ] **Step 1: Add the tokens**

In the `:root[data-theme='eighties'] { … }` token block, add:

```scss
  // Film connector cord (default red string; audition rust #9c4a25 on the metal)
  --rope:          #b5302a;  // cord core + union tie
  --rope-twist-hi: #e25c52;  // twist highlight
  --rope-twist-lo: #7d1f1b;  // twist shadow
  --pin:           #c9c4b8;  // push-pin head
```

- [ ] **Step 2: Commit**

```bash
git add src/frontend/src/styles/themes/eighties.scss
git commit -m "Film theme: rope/pin design tokens"
```

---

### Task 2: `ropePath` + pin-point helpers (pure, TDD)

Extract testable geometry into a module so `OakTree.vue` stays thin.

**Files:**
- Create: `src/frontend/src/components/oakConnectors.ts`
- Test: `src/frontend/src/components/oakConnectors.spec.ts`

**Interfaces:**
- Produces:
  - `ropePath(link: LayoutLink, orientation: 'vertical'|'horizontal'): string` — a quadratic with the control point pushed toward the bottom of the screen by a sag, so the cord hangs under gravity in both orientations.
  - `ROPE_SAG = 22` (number).
  - `pinPoints(links: LayoutLink[]): Array<{ x: number; y: number; key: string }>` — one point per distinct medallion connection point (parent-side deduped by `source`; child-side keyed by `target`), so a parent with N children yields one parent pin, not N.

- [ ] **Step 1: Write the failing tests**

`oakConnectors.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ropePath, pinPoints, ROPE_SAG } from './oakConnectors';
import type { LayoutLink } from '../layout/treeLayout';

const link = (o: Partial<LayoutLink> = {}): LayoutLink => ({
  id: 'l', kind: 'descent', source: 'p', target: 'c', x1: 0, y1: 0, x2: 100, y2: 200, ...o
});

describe('ropePath', () => {
  it('is a quadratic whose control point sags below both endpoints', () => {
    const d = ropePath(link(), 'vertical');
    expect(d.startsWith('M 0 0 Q ')).toBe(true);
    // control y = max(y1,y2) + sag — below both endpoints (larger y = lower on screen)
    const ctrlY = Number(d.match(/Q\s[\d.-]+\s([\d.-]+)/)![1]);
    expect(ctrlY).toBe(200 + ROPE_SAG);
  });
  it('sags downward even in horizontal orientation (rope between two pins)', () => {
    const d = ropePath(link({ x1: 0, y1: 50, x2: 200, y2: 50 }), 'horizontal');
    const ctrlY = Number(d.match(/Q\s[\d.-]+\s([\d.-]+)/)![1]);
    expect(ctrlY).toBe(50 + ROPE_SAG);
  });
});

describe('pinPoints', () => {
  it('yields one pin per parent connection point and one per child', () => {
    const links = [
      link({ id: 'a', source: 'p', target: 'c1', x1: 10, y1: 0, x2: 0, y2: 100 }),
      link({ id: 'b', source: 'p', target: 'c2', x1: 10, y1: 0, x2: 50, y2: 100 }),
    ];
    const pts = pinPoints(links);
    // one parent pin at (10,0) + two child pins → 3, not 4
    expect(pts).toHaveLength(3);
    expect(pts.filter(p => p.x === 10 && p.y === 0)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm --prefix src/frontend test -- oakConnectors`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

`src/frontend/src/components/oakConnectors.ts`:

```ts
import type { LayoutLink } from '../layout/treeLayout';

export const ROPE_SAG = 22;

/** Cord path: a quadratic whose control point is pushed toward the bottom of the
 *  screen, so the string sags under gravity regardless of layout orientation. */
export function ropePath(link: LayoutLink, _orientation: 'vertical' | 'horizontal'): string {
  const mx = (link.x1 + link.x2) / 2;
  const my = Math.max(link.y1, link.y2) + ROPE_SAG;
  return `M ${link.x1} ${link.y1} Q ${mx} ${my} ${link.x2} ${link.y2}`;
}

/** One pin per distinct medallion connection point: parent-side deduped by
 *  `source`, child-side by `target` (so a multi-child parent shows one pin). */
export function pinPoints(links: LayoutLink[]): Array<{ x: number; y: number; key: string }> {
  const seen = new Map<string, { x: number; y: number; key: string }>();
  for (const l of links) {
    const parentKey = `s:${l.source}`;
    if (!seen.has(parentKey)) seen.set(parentKey, { x: l.x1, y: l.y1, key: parentKey });
    const childKey = `t:${l.target}`;
    if (!seen.has(childKey)) seen.set(childKey, { x: l.x2, y: l.y2, key: childKey });
  }
  return [...seen.values()];
}
```

(Orientation is accepted but unused — the sag is always downward in screen space; the parameter keeps the call site symmetric with `branchPath` and leaves room for future tuning.)

- [ ] **Step 4: Run to confirm pass**

Run: `npm --prefix src/frontend test -- oakConnectors`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/oakConnectors.ts src/frontend/src/components/oakConnectors.spec.ts
git commit -m "feat: rope path + pin-point helpers for Film connectors"
```

---

### Task 3: `RopeLink.vue` — the layered cord

A presentational component that renders one descent link as a red string. The **core** carries the ceremony/test hooks; twist overlays carry the fade hook.

**Files:**
- Create: `src/frontend/src/components/RopeLink.vue`
- Test: `src/frontend/src/components/RopeLink.spec.ts`

**Interfaces:**
- Consumes: `ropePath` (Task 2), `LayoutLink`.
- Props: `{ link: LayoutLink; orientation: 'vertical'|'horizontal'; drawGen: number }` (`drawGen` = `linkGeneration(link)`, passed by OakTree so this component stays layout-agnostic).
- Produces (DOM contract): a `<g>` containing, in order — `path.rope__shadow`, `path.rope__core[data-test="branch"][:data-link-id][:data-entrance-draw="drawGen"]`, `path.rope__twist-hi[:data-entrance-fade="drawGen"]`, `path.rope__twist-lo[:data-entrance-fade="drawGen"]`.

- [ ] **Step 1: Write the failing test**

`RopeLink.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RopeLink from './RopeLink.vue';
import type { LayoutLink } from '../layout/treeLayout';

const link: LayoutLink = { id: 'l1', kind: 'descent', source: 'p', target: 'c', x1: 0, y1: 0, x2: 80, y2: 160 };

describe('RopeLink', () => {
  it('renders shadow + core + two twist overlays sharing one path', () => {
    const w = mount(RopeLink, { props: { link, orientation: 'vertical', drawGen: 2 } });
    expect(w.find('path.rope__shadow').exists()).toBe(true);
    expect(w.find('path.rope__core').exists()).toBe(true);
    expect(w.find('path.rope__twist-hi').exists()).toBe(true);
    expect(w.find('path.rope__twist-lo').exists()).toBe(true);
  });
  it('keeps the ceremony/test hooks on the SOLID core (never on twist overlays)', () => {
    const w = mount(RopeLink, { props: { link, orientation: 'vertical', drawGen: 2 } });
    const core = w.find('path.rope__core');
    expect(core.attributes('data-test')).toBe('branch');
    expect(core.attributes('data-link-id')).toBe('l1');
    expect(core.attributes('data-entrance-draw')).toBe('2');
    expect(core.attributes('stroke-dasharray')).toBeUndefined(); // core is solid
    // twist overlays fade, not draw
    expect(w.find('path.rope__twist-hi').attributes('data-entrance-fade')).toBe('2');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm --prefix src/frontend test -- RopeLink`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the component**

`src/frontend/src/components/RopeLink.vue`:

```vue
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
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm --prefix src/frontend test -- RopeLink`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/RopeLink.vue src/frontend/src/components/RopeLink.spec.ts
git commit -m "feat: RopeLink layered cord component (core keeps ceremony hooks)"
```

---

### Task 4: Switch the OakTree descent group to ropes in Film theme

**Files:**
- Modify: `src/frontend/src/components/OakTree.vue` (`.oak__branches` group, ~lines 250-263; script ~line 31 already has `const ui = useUiStore()`)
- Test: `src/frontend/src/components/OakTree.spec.ts`

**Interfaces:**
- Consumes: `RopeLink` (Task 3), `linkGeneration` (existing, OakTree), `ui.theme`.

- [ ] **Step 1: Write the failing test**

In `OakTree.spec.ts`, add (the file already builds a layout + mounts OakTree; reuse its helpers and set the theme via the ui store before mount):

```ts
it('renders rope cords in Film theme and bark paths in Classic', async () => {
  const ui = useUiStore();
  ui.setTheme('eighties');
  const filmWrapper = mountOak(); // use the file's existing mount helper
  await filmWrapper.vm.$nextTick();
  // ropes present, classic single-path absent
  expect(filmWrapper.findAll('path.rope__core').length).toBeGreaterThan(0);
  expect(filmWrapper.find('path.oak__branch').exists()).toBe(false);
  // the core still exposes the ceremony/test contract
  const core = filmWrapper.find('path.rope__core[data-test="branch"]');
  expect(core.exists()).toBe(true);

  ui.setTheme('classic');
  const classicWrapper = mountOak();
  await classicWrapper.vm.$nextTick();
  expect(classicWrapper.find('path.oak__branch').exists()).toBe(true);
  expect(classicWrapper.find('path.rope__core').exists()).toBe(false);
});
```

(If `OakTree.spec.ts` has no reusable `mountOak`, factor the existing inline `mount(OakTree, { props: … })` into a local helper first, then use it here.)

- [ ] **Step 2: Run to confirm failure**

Run: `npm --prefix src/frontend test -- OakTree`
Expected: FAIL — `rope__core` not rendered (still bark for both themes).

- [ ] **Step 3: Wire the theme switch**

In `OakTree.vue` `<script setup>`, add the import and a flag:

```ts
import RopeLink from './RopeLink.vue';
// ui already exists: const ui = useUiStore();
const film = computed(() => ui.theme === 'eighties');
```

Replace the `.oak__branches` group (the `<g class="oak__branches">…</g>` block) with a theme switch — Film renders `RopeLink` per link, Classic keeps the existing single path:

```vue
<g class="oak__branches" :style="{ opacity: branchOpacity }">
  <template v-if="film">
    <RopeLink
      v-for="link in descentLinks"
      :key="link.id"
      :link="link"
      :orientation="branchOrientation ?? orientation ?? 'vertical'"
      :draw-gen="linkGeneration(link)"
    />
  </template>
  <template v-else>
    <path
      v-for="link in descentLinks"
      :key="link.id"
      data-test="branch"
      :data-link-id="link.id"
      :data-entrance-draw="linkGeneration(link)"
      :d="branchPath(link)"
      :stroke-width="branchWidth(link)"
      fill="none"
      stroke-linecap="round"
      class="oak__branch"
    />
  </template>
</g>
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm --prefix src/frontend test -- OakTree`
Expected: PASS (including the pre-existing `data-entrance-draw` == child-generation test, which now matches the rope core).

- [ ] **Step 5: Verify in preview**

`http://localhost:5180/` Film tree: descent connectors are red sagging cords; toggle to Classic → bark branches return.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/OakTree.vue src/frontend/src/components/OakTree.spec.ts
git commit -m "feat: render rope cords for Film descent links (bark stays on Classic)"
```

---

### Task 5: Pins at the cord/card junctions

**Files:**
- Modify: `src/frontend/src/components/OakTree.vue` (add a pins group, Film-only), `src/frontend/src/styles/themes/eighties.scss` (or RopeLink-adjacent scoped style) for `.oak__pin`
- Test: `src/frontend/src/components/OakTree.spec.ts`

**Interfaces:**
- Consumes: `pinPoints` (Task 2).

- [ ] **Step 1: Write the failing test**

In `OakTree.spec.ts`:

```ts
it('draws one pin per distinct connection point in Film theme (no stacking)', async () => {
  const ui = useUiStore();
  ui.setTheme('eighties');
  const w = mountOak();
  await w.vm.$nextTick();
  const pins = w.findAll('[data-test="pin"]');
  const expected = pinPoints(layout.links.filter(l => l.kind === 'descent')); // import pinPoints + the test layout
  expect(pins.length).toBe(expected.length);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm --prefix src/frontend test -- OakTree`
Expected: FAIL — no `[data-test="pin"]` elements.

- [ ] **Step 3: Add the pins group**

In `OakTree.vue` script:

```ts
import { pinPoints } from './oakConnectors';
const pins = computed(() => (film.value ? pinPoints(descentLinks.value) : []));
```

In the template, after `.oak__branches` (so pins sit above the cords), add a Film-only group that also takes `branchOpacity` so it fades with the morph:

```vue
<g v-if="film" class="oak__pins" :style="{ opacity: branchOpacity }" aria-hidden="true">
  <g v-for="p in pins" :key="p.key" data-test="pin" :transform="`translate(${p.x} ${p.y})`">
    <circle class="oak__pin-shadow" cx="0" cy="1" r="3.4" />
    <circle class="oak__pin-head" cx="0" cy="0" r="3.2" />
    <circle class="oak__pin-spec" cx="-1" cy="-1" r="1" />
  </g>
</g>
```

Add scoped styles in `OakTree.vue`:

```scss
.oak__pin-shadow { fill: #000; opacity: 0.4; }
.oak__pin-head { fill: var(--pin); }
.oak__pin-spec { fill: #fff; opacity: 0.7; }
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm --prefix src/frontend test -- OakTree`
Expected: PASS.

- [ ] **Step 5: Verify in preview**

Film tree: a small metal pin sits where each cord meets a card; a parent with multiple children shows a single pin at its junction (no stack).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/OakTree.vue src/frontend/src/components/OakTree.spec.ts
git commit -m "feat: deduped metal pins at Film cord/card junctions"
```

---

### Task 6: Union ties — red dashed in Film

The couple `<line class="oak__union">` keeps its element and `data-entrance-fade` hook; only its colour changes in Film. (Confirmed good as a thin red dashed tie.)

**Files:**
- Modify: `src/frontend/src/styles/themes/eighties.scss`

**Interfaces:**
- Consumes: `--rope`.

- [ ] **Step 1: Add the Film union override**

The base `.oak__union` (in `OakTree.vue` scoped style) uses `var(--bark-dark)`. Add a Film override in `eighties.scss`:

```scss
:root[data-theme='eighties'] .oak__union {
  stroke: var(--rope);
  stroke-width: 1.1;
  stroke-dasharray: 3 3;
  opacity: 0.85;
}
```

- [ ] **Step 2: Verify in preview**

Spouses are joined by a thin red dashed tie; Classic unions stay brown dashed.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/styles/themes/eighties.scss
git commit -m "Film theme: red dashed union ties"
```

---

### Task 7: Motion + reduced-motion verification

No code change expected — confirm the cord plays correctly with the existing systems, and capture any fix needed.

**Files:**
- Verify: `src/frontend/src/motion/entrance.ts` interaction; possibly `OakTree.vue` if a fix is needed.

- [ ] **Step 1: Entrance ceremony**

Run `http://localhost:5180/`, trigger "Grow the tree" (replay button). Confirm: each cord **draws on** (the solid core animates via the ceremony's dash on `[data-entrance-draw]`), then the twist overlays and pins fade in with their generation; pins do not appear before their cord. If a pin appears too early, give the pins group `:data-entrance-fade` bucketing or include it in the same fade as the link (note the fix here and implement minimally).

- [ ] **Step 2: Morph fade**

Dock/undock a person panel (or whatever triggers `morphProgress`) and confirm cords + pins fade together with `branchOpacity` (they share the group `:style`).

- [ ] **Step 3: Reduced motion**

With OS "reduce motion" on (or the app's reduced-motion path), confirm cords/pins render in their final state (no draw, no fade) — same as bark branches do today.

- [ ] **Step 4: Layout switch**

Toggle vertical↔horizontal orientation; cords re-sag downward and stay attached (ropePath is a pure function of endpoints).

- [ ] **Step 5: Commit (only if a fix was needed)**

```bash
git add -A
git commit -m "fix: rope cord motion integration (ceremony/morph/reduced-motion)"
```

---

### Task 8: Reference-doc updates

**Files:**
- Modify: `docs/reference/features/oak-tree.md`, root `README.md` / `CLAUDE.md`, `docs/reference/roadmap.md`

- [ ] **Step 1: Document the connectors**

In `docs/reference/features/oak-tree.md`, describe the Film descent rope (sagging red string, twist, flat 1.5 width, pins, red dashed union ties) vs Classic bark branches, and note the ceremony draws the core while twist/pins fade.

- [ ] **Step 2: Product one-liner**

In `README.md` / `CLAUDE.md`, extend the Film theme description to mention the red-string connectors (alongside the metal backdrop from Plan A).

- [ ] **Step 3: Roadmap**

In `docs/reference/roadmap.md`, mark the Film rope connectors implemented.

- [ ] **Step 4: Commit**

```bash
git add docs/reference/features/oak-tree.md README.md CLAUDE.md docs/reference/roadmap.md
git commit -m "docs: Film rope connectors"
```

---

## Self-Review notes

- **Spec coverage:** tokens (T1), ropePath + pin dedup (T2), RopeLink (T3), descent theme switch preserving ceremony hooks (T4), pins (T5), union ties (T6), motion/reduced-motion (T7), docs (T8). Backdrop/legibility are in **Plan A**.
- **Hook preservation** (the spec's "critical" constraint) is enforced by the Task 3/4 tests: the core keeps `data-test/​data-link-id/​data-entrance-draw` and stays solid; twist overlays carry `data-entrance-fade`.
- **Type consistency:** `ropePath(link, orientation)`, `pinPoints(links)`, `ROPE_SAG`, and `RopeLink` props `{ link, orientation, drawGen }` are used identically across T2–T5.
- **Open pick:** cord colour (red default) is the only undecided value; it's token-only and called out in Global Constraints + T1.
