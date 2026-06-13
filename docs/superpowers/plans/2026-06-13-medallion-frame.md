# Medallion Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the procedural scroll-cartouche person card with the supplied baroque **gilt-oval + parchment-banner** artwork — portrait as a dark-mounted cameo, full name on one line, and per-state gilt recolour (selected = lit gold, search-match = green-gold) delivered as a crossfade.

**Architecture:** The frame is one optimised SVG committed in three colour variants (gold / lit-gold / green-gold). `PersonMedallion.vue` is rewritten to layer, per node: a dark mount ellipse → portrait `<image>` clipped to the oval → vignette ellipse → base gold frame `<image>` → a state-overlay frame `<image>` whose opacity crossfades on selection/match → name + years `<text>` in the banner. Pure helpers (geometry, name-fit, asset selection) are split into `src/components/medallion/` for isolated testing; the oval centre stays at the node origin so time-axis alignment is unchanged.

**Tech Stack:** Vue 3 + TypeScript + Vite, Vitest + @vue/test-utils, GSAP (via the existing `src/motion/` layer), SCSS design tokens.

**Spec:** [`docs/superpowers/specs/2026-06-13-medallion-frame-design.md`](../specs/2026-06-13-medallion-frame-design.md)

> **Conventions for every task:** run frontend commands from `src/frontend/`. Single-file test run: `npx vitest run <path>`. Full suite: `npx vitest run`. Type-checked build: `npm run build`. Reduced-motion and GSAP are mocked in tests exactly as shown — don't let a tween reach jsdom.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/frontend/src/assets/medallion/frame-gold.svg` | Base artwork (the optimised SVG, imported as a URL). |
| `src/frontend/src/assets/medallion/frame-selected.svg` | Gilt recoloured to lit gold (selected). |
| `src/frontend/src/assets/medallion/frame-match.svg` | Gilt recoloured to green-gold (search-match). |
| `src/frontend/scripts/gen-medallion-frames.mjs` | Generates the two recoloured variants from the base (single source of the colour map). |
| `src/frontend/src/components/medallion/frameAssets.ts` | Imports the three frame URLs; `overlayForState()` chooses the overlay variant. |
| `src/frontend/src/components/medallion/geometry.ts` | `frameGeom(role)` — per-role frame size + oval/banner geometry, oval centred at origin. |
| `src/frontend/src/components/medallion/nameFit.ts` | `nameFontSize()` — one-line name auto-fit heuristic. |
| `src/frontend/src/motion/fade.ts` | Add `fadeTo()` + `setOpacity()` for the overlay crossfade. |
| `src/frontend/src/components/PersonMedallion.vue` | Rewritten medallion (layers above). |
| `src/frontend/src/components/OakTree.vue` | Swap defs (drop scroll/tint gradients, add vignette gradient); focus-visible glow. |
| `src/frontend/src/layout/treeLayout.ts` | Update `CARD_HALF_WIDTH` to the new framed footprint. |

---

## Task 1: Bring the frame artwork into the repo (three colour variants)

**Files:**
- Create: `src/frontend/src/assets/medallion/frame-gold.svg` (copied from the owner's source)
- Create: `src/frontend/scripts/gen-medallion-frames.mjs`
- Create (generated): `src/frontend/src/assets/medallion/frame-selected.svg`, `frame-match.svg`

- [ ] **Step 1: Copy the base artwork into the repo**

Run (from repo root):
```bash
mkdir -p src/frontend/src/assets/medallion
cp "/c/Users/perov/OneDrive/Фотографии/family/medalion1-vector1-less-colors-minimized.svg" \
   src/frontend/src/assets/medallion/frame-gold.svg
```
(Windows path: `C:\Users\perov\OneDrive\Фотографии\family\medalion1-vector1-less-colors-minimized.svg`.)

- [ ] **Step 2: Confirm the gilt fills are present (the colour map depends on them)**

Run (from repo root):
```bash
grep -oiE '#(f7bb50|cb9137|7a4d1c|edd5a6)' src/frontend/src/assets/medallion/frame-gold.svg | sort -u
```
Expected: all four of `#cb9137 #edd5a6 #f7bb50 #7a4d1c` (case-insensitive). The first three are the gilt tones we recolour; `#edd5a6` (parchment) is left untouched.

- [ ] **Step 3: Write the variant generator**

Create `src/frontend/scripts/gen-medallion-frames.mjs`:
```js
// Generates the two recoloured frame variants from frame-gold.svg.
// The state colour map lives ONLY here (spec §3.4). Re-run after editing the map.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../src/assets/medallion/', import.meta.url));
const gold = readFileSync(dir + 'frame-gold.svg', 'utf8');

// gilt: light #f7bb50 · mid #cb9137 · deep #7a4d1c  (parchment/brown/black untouched)
const VARIANTS = {
  'frame-selected.svg': { '#f7bb50': '#ffe79e', '#cb9137': '#eac266', '#7a4d1c': '#a2792f' }, // lit gold
  'frame-match.svg':    { '#f7bb50': '#d6c45e', '#cb9137': '#9c9a3f', '#7a4d1c': '#586322' }  // green-gold
};

for (const [file, map] of Object.entries(VARIANTS)) {
  let svg = gold;
  for (const [from, to] of Object.entries(map)) svg = svg.replaceAll(from, to);
  writeFileSync(dir + file, svg);
  console.log('wrote', file);
}
```

- [ ] **Step 4: Generate the variants**

Run (from `src/frontend/`):
```bash
node scripts/gen-medallion-frames.mjs
```
Expected: `wrote frame-selected.svg` / `wrote frame-match.svg`.

- [ ] **Step 5: Verify the recolour took (and parchment is untouched)**

Run (from `src/frontend/`):
```bash
grep -c '#ffe79e' src/assets/medallion/frame-selected.svg   # > 0 (lit gold present)
grep -c '#f7bb50' src/assets/medallion/frame-selected.svg   # 0 (old gilt gone)
grep -c '#d6c45e' src/assets/medallion/frame-match.svg      # > 0 (green-gold present)
grep -c '#edd5a6' src/assets/medallion/frame-match.svg      # > 0 (parchment kept)
```
Expected: the four counts are `>0`, `0`, `>0`, `>0`.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/assets/medallion src/frontend/scripts/gen-medallion-frames.mjs
git commit -m "feat(medallion): add gilt frame artwork in gold/selected/match variants"
```

---

## Task 2: Frame asset module + state selection

**Files:**
- Create: `src/frontend/src/components/medallion/frameAssets.ts`
- Test: `src/frontend/src/components/medallion/frameAssets.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/components/medallion/frameAssets.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { frameGold, frameSelected, frameMatch, overlayForState } from './frameAssets';

describe('overlayForState', () => {
  it('returns no overlay for a normal node', () => {
    expect(overlayForState(false, false)).toBeNull();
  });
  it('returns the lit-gold variant when selected', () => {
    expect(overlayForState(true, false)).toBe(frameSelected);
  });
  it('returns the green-gold variant when a search match', () => {
    expect(overlayForState(false, true)).toBe(frameMatch);
  });
  it('lets match (green-gold) win when both selected and match', () => {
    expect(overlayForState(true, true)).toBe(frameMatch);
  });
  it('exposes three distinct frame URLs', () => {
    expect(new Set([frameGold, frameSelected, frameMatch]).size).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `src/frontend/`): `npx vitest run src/components/medallion/frameAssets.spec.ts`
Expected: FAIL — cannot resolve `./frameAssets`.

- [ ] **Step 3: Write the implementation**

Create `src/frontend/src/components/medallion/frameAssets.ts`:
```ts
import frameGoldUrl from '../../assets/medallion/frame-gold.svg?url';
import frameSelectedUrl from '../../assets/medallion/frame-selected.svg?url';
import frameMatchUrl from '../../assets/medallion/frame-match.svg?url';

export const frameGold = frameGoldUrl;
export const frameSelected = frameSelectedUrl;
export const frameMatch = frameMatchUrl;

// Which recoloured overlay to show over the base gold frame. Search-match
// (green-gold) wins over selected (lit gold) so found people stay distinguishable.
// Returns null when the node is plain gold.
export function overlayForState(selected: boolean, match: boolean): string | null {
  if (match) return frameMatch;
  if (selected) return frameSelected;
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `src/frontend/`): `npx vitest run src/components/medallion/frameAssets.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/medallion/frameAssets.ts src/frontend/src/components/medallion/frameAssets.spec.ts
git commit -m "feat(medallion): frame asset URLs + per-state overlay selection"
```

---

## Task 3: Frame geometry (per-role sizes, oval centred at origin)

**Files:**
- Create: `src/frontend/src/components/medallion/geometry.ts`
- Test: `src/frontend/src/components/medallion/geometry.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/components/medallion/geometry.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { frameGeom } from './geometry';

describe('frameGeom', () => {
  it('keeps the owner-tuned 1362:1648 frame ratio', () => {
    const g = frameGeom('trunk');
    expect(g.h / g.w).toBeCloseTo(1648 / 1362, 3);
  });

  it('positions the frame so the oval centre sits on the node origin (0,0)', () => {
    const g = frameGeom('branch');
    // oval centre = frame top-left + (49.8% w, 42% h)
    expect(g.frameX + 0.498 * g.w).toBeCloseTo(0, 6);
    expect(g.frameY + 0.42 * g.h).toBeCloseTo(0, 6);
  });

  it('derives the oval radii from the locked 30%/35% clip', () => {
    const g = frameGeom('trunk');
    expect(g.ovalRx).toBeCloseTo(0.30 * g.w, 6);
    expect(g.ovalRy).toBeCloseTo(0.35 * g.h, 6);
  });

  it('zooms the portrait out for smaller roles (trunk 80% > leaf 60%)', () => {
    expect(frameGeom('trunk').portraitZoom).toBe(0.80);
    expect(frameGeom('branch').portraitZoom).toBe(0.70);
    expect(frameGeom('leaf').portraitZoom).toBe(0.60);
  });

  it('scales trunk larger than leaf', () => {
    expect(frameGeom('trunk').w).toBeGreaterThan(frameGeom('leaf').w);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `src/frontend/`): `npx vitest run src/components/medallion/geometry.spec.ts`
Expected: FAIL — cannot resolve `./geometry`.

- [ ] **Step 3: Write the implementation**

Create `src/frontend/src/components/medallion/geometry.ts`:
```ts
import type { NodeRole } from '../../layout/treeLayout';

// The native artwork is 1362x1548; the container is deliberately taller
// (1362x1648, owner-tuned) so the frame draws stretched ~6.5% vertically.
const FRAME_RATIO = 1648 / 1362; // h / w

// Locked oval clip: ellipse(30% 35% at 49.8% 42%) — fractions of the frame box.
const OVAL_CX_F = 0.498;
const OVAL_CY_F = 0.42;
const OVAL_RX_F = 0.30;
const OVAL_RY_F = 0.35;

// Banner one-line name band (fractions of the frame box) — tuned live in Task 9.
const NAME_CY_F = 0.865;
const YEARS_DY_F = 0.075;

export interface FrameGeom {
  role: NodeRole;
  w: number;
  h: number;
  frameX: number;        // frame image top-left (oval centre lands on origin)
  frameY: number;
  ovalRx: number;        // oval radii: clip + dark mount + vignette
  ovalRy: number;
  portraitZoom: number;  // portrait width as a fraction of the frame width
  portraitOffsetY: number; // the locked "-14%" vertical pan, in user units
  nameY: number;
  yearsY: number;
  nameMax: number;       // usable one-line name width
  yearsSize: number;
}

const W_BY_ROLE: Record<NodeRole, number> = { trunk: 200, branch: 186, root: 186, leaf: 158 };
const ZOOM_BY_ROLE: Record<NodeRole, number> = { trunk: 0.80, branch: 0.70, root: 0.70, leaf: 0.60 };

export function frameGeom(role: NodeRole): FrameGeom {
  const w = W_BY_ROLE[role];
  const h = w * FRAME_RATIO;
  const frameX = -OVAL_CX_F * w;
  const frameY = -OVAL_CY_F * h;
  return {
    role, w, h, frameX, frameY,
    ovalRx: OVAL_RX_F * w,
    ovalRy: OVAL_RY_F * h,
    portraitZoom: ZOOM_BY_ROLE[role],
    portraitOffsetY: -0.14 * h,
    nameY: frameY + NAME_CY_F * h,
    yearsY: frameY + (NAME_CY_F + YEARS_DY_F) * h,
    nameMax: 0.82 * w,
    yearsSize: 0.054 * w
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `src/frontend/`): `npx vitest run src/components/medallion/geometry.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/medallion/geometry.ts src/frontend/src/components/medallion/geometry.spec.ts
git commit -m "feat(medallion): per-role frame geometry with oval centred at origin"
```

---

## Task 4: One-line name auto-fit

**Files:**
- Create: `src/frontend/src/components/medallion/nameFit.ts`
- Test: `src/frontend/src/components/medallion/nameFit.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/components/medallion/nameFit.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { nameFontSize } from './nameFit';

const MAX = 164; // ~0.82 * 200 (trunk)

describe('nameFontSize', () => {
  it('caps short names at the maximum size', () => {
    expect(nameFontSize('Ян', MAX)).toBeCloseTo(MAX * 0.093, 5);
  });
  it('shrinks long names below the cap', () => {
    expect(nameFontSize('Александр Воронцов-Вельяминов', MAX)).toBeLessThan(MAX * 0.093);
  });
  it('never drops below the floor, even for absurd names', () => {
    expect(nameFontSize('x'.repeat(80), MAX)).toBeCloseTo(MAX * 0.056, 5);
  });
  it('is monotonic: a longer name is never larger', () => {
    expect(nameFontSize('Станислав Ковальский', MAX))
      .toBeLessThanOrEqual(nameFontSize('Ян Лис', MAX));
  });
  it('treats an empty name as length 1 (no divide-by-zero)', () => {
    expect(nameFontSize('', MAX)).toBeCloseTo(MAX * 0.093, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `src/frontend/`): `npx vitest run src/components/medallion/nameFit.spec.ts`
Expected: FAIL — cannot resolve `./nameFit`.

- [ ] **Step 3: Write the implementation**

Create `src/frontend/src/components/medallion/nameFit.ts`:
```ts
// One-line name font size (px) so `name` roughly fits `maxWidth` px in Cinzel.
// Cinzel glyphs average ~0.58em wide; clamp to a legible band relative to the
// banner width. Tuned against the live oak in Task 9.
const CAP_F = 0.093;   // ≈ the trunk "7.6cqw" feel
const FLOOR_F = 0.056; // ≈ the "4.6cqw" floor
const AVG_GLYPH = 0.58;

export function nameFontSize(name: string, maxWidth: number): number {
  const len = Math.max(1, name.length);
  const byWidth = maxWidth / (len * AVG_GLYPH);
  return Math.max(maxWidth * FLOOR_F, Math.min(maxWidth * CAP_F, byWidth));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `src/frontend/`): `npx vitest run src/components/medallion/nameFit.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/medallion/nameFit.ts src/frontend/src/components/medallion/nameFit.spec.ts
git commit -m "feat(medallion): one-line name auto-fit heuristic"
```

---

## Task 5: Overlay crossfade motion helpers

**Files:**
- Modify: `src/frontend/src/motion/fade.ts`
- Test: `src/frontend/src/motion/fade.spec.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/frontend/src/motion/fade.spec.ts` (and add `fadeTo, setOpacity` to the import on line 2 and `to` to the gsap mock on line 4–5):

Change line 2 to:
```ts
import { fadeIn, fadeTo, setOpacity } from './fade';
```
Change lines 4–5 to:
```ts
const { fromTo, set, to } = vi.hoisted(() => ({ fromTo: vi.fn(), set: vi.fn(), to: vi.fn() }));
vi.mock('gsap', () => ({ default: { fromTo, set, to } }));
```
Add `to.mockReset();` inside the `beforeEach` (after `set.mockReset();`). Then add these tests before the final `});`:
```ts
describe('fadeTo', () => {
  it('tweens opacity with the feedback token', () => {
    stubMatchMedia(false);
    const el = document.createElement('div');
    fadeTo(el, 1);
    expect(to).toHaveBeenCalledWith(
      el,
      expect.objectContaining({ opacity: 1, duration: 0.3, ease: 'power1.out', overwrite: 'auto' })
    );
    expect(set).not.toHaveBeenCalled();
  });

  it('sets opacity instantly under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    const el = document.createElement('div');
    fadeTo(el, 0);
    expect(set).toHaveBeenCalledWith(el, { opacity: 0 });
    expect(to).not.toHaveBeenCalled();
  });
});

describe('setOpacity', () => {
  it('sets opacity immediately with no tween', () => {
    const el = document.createElement('div');
    setOpacity(el, 0);
    expect(set).toHaveBeenCalledWith(el, { opacity: 0 });
    expect(to).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `src/frontend/`): `npx vitest run src/motion/fade.spec.ts`
Expected: FAIL — `fadeTo`/`setOpacity` are not exported.

- [ ] **Step 3: Add the implementation**

Append to `src/frontend/src/motion/fade.ts`:
```ts
// Tween an element to a target opacity (overlay crossfade). Instant under reduced motion.
export function fadeTo(el: Element, opacity: number): void {
  if (prefersReducedMotion()) {
    gsap.set(el, { opacity });
    return;
  }
  gsap.to(el, {
    opacity,
    duration: motionTokens.feedback.duration,
    ease: motionTokens.feedback.ease,
    overwrite: 'auto'
  });
}

// Set opacity immediately (no tween) — used to seed the overlay at mount.
export function setOpacity(el: Element, opacity: number): void {
  gsap.set(el, { opacity });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `src/frontend/`): `npx vitest run src/motion/fade.spec.ts`
Expected: PASS (all fade tests, including the new three).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/motion/fade.ts src/frontend/src/motion/fade.spec.ts
git commit -m "feat(motion): fadeTo + setOpacity for medallion overlay crossfade"
```

---

## Task 6: Rewrite `PersonMedallion.vue`

**Files:**
- Modify (full rewrite): `src/frontend/src/components/PersonMedallion.vue`
- Modify (full rewrite): `src/frontend/src/components/PersonMedallion.spec.ts`

> The vignette gradient `#oak-vignette` it references is added to `OakTree.vue` in Task 7; component tests mount `PersonMedallion` standalone so the missing def is harmless (the ellipse just renders un-filled in jsdom). The full-suite gate is Task 9.

- [ ] **Step 1: Replace the test file**

Replace the entire contents of `src/frontend/src/components/PersonMedallion.spec.ts` with:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PersonMedallion from './PersonMedallion.vue';
import { useLocaleStore } from '../stores/localeStore';
import { frameGold, frameSelected, frameMatch } from './medallion/frameAssets';
import type { LayoutNode } from '../layout/treeLayout';
import type { PersonSummary } from '../types/family';

const { fadeToMock, setOpacityMock } = vi.hoisted(() => ({ fadeToMock: vi.fn(), setOpacityMock: vi.fn() }));
vi.mock('../motion/fade', () => ({ fadeTo: fadeToMock, setOpacity: setOpacityMock, fadeIn: vi.fn() }));

function person(overrides: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id: 'p1',
    givenName: { ru: 'Анна', be: null, en: 'Anna' },
    surname: { ru: 'Икс', be: null, en: 'X' },
    maidenName: null, sex: 'female', birthYear: 1850, deathYear: 1916,
    vocation: 'other', portrait: null, portraitVideo: null,
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false,
    ...overrides
  };
}
function node(nodeOverrides: Partial<LayoutNode> = {}, personOverrides: Partial<PersonSummary> = {}): LayoutNode {
  const p = person(personOverrides);
  return { id: p.id, person: p, x: 0, y: 0, year: p.birthYear ?? 1900, role: 'branch', generation: 0, ...nodeOverrides };
}
function mountNode(n: LayoutNode, props: Record<string, unknown> = {}) {
  return mount(PersonMedallion, { props: { node: n, ...props } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  fadeToMock.mockReset();
  setOpacityMock.mockReset();
});

describe('PersonMedallion', () => {
  it('draws the base gold frame and a dark portrait mount', () => {
    const wrapper = mountNode(node());
    expect(wrapper.find('image.oak__frame').attributes('href')).toBe(frameGold);
    expect(wrapper.find('ellipse.oak__mount').exists()).toBe(true);
    expect(wrapper.find('circle').exists()).toBe(false);
  });

  it('renders a portrait image from the media path when a portrait exists', () => {
    const wrapper = mountNode(node({}, { portrait: 'p-0001.jpg' }));
    const image = wrapper.find('[data-test="portrait"]');
    expect(image.exists()).toBe(true);
    expect(image.attributes('href')).toBe('/media/portraits/p-0001.jpg');
    expect(wrapper.find('.oak__initial').exists()).toBe(false);
  });

  it('falls back to the given-name initial when there is no portrait', () => {
    const wrapper = mountNode(node());
    expect(wrapper.find('.oak__initial').text()).toBe('A');
    expect(wrapper.find('[data-test="portrait"]').exists()).toBe(false);
  });

  it('renders the full name on one line', () => {
    const wrapper = mountNode(node());
    expect(wrapper.find('.oak__name').text()).toBe('Anna X');
  });

  it('renders the birth–death label', () => {
    const wrapper = mountNode(node({}, { birthYear: 1850, deathYear: 1916 }));
    expect(wrapper.find('[data-test="lifespan"]').text()).toBe('1850–1916');
  });

  it('shows the lit-gold overlay when selected', () => {
    const wrapper = mountNode(node(), { selected: true });
    expect(wrapper.find('image.oak__frame-overlay').attributes('href')).toBe(frameSelected);
  });

  it('shows the green-gold overlay when a search match (match wins over selected)', () => {
    const wrapper = mountNode(node(), { selected: true, match: true });
    expect(wrapper.find('image.oak__frame-overlay').attributes('href')).toBe(frameMatch);
  });

  it('seeds the overlay opacity at mount (hidden when normal)', () => {
    mountNode(node());
    expect(setOpacityMock).toHaveBeenCalledWith(expect.anything(), 0);
  });

  it('crossfades the overlay in when selection turns on', async () => {
    const wrapper = mountNode(node());
    fadeToMock.mockReset();
    await wrapper.setProps({ selected: true });
    await nextTick();
    expect(fadeToMock).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('crossfades the overlay out when the state clears', async () => {
    const wrapper = mountNode(node(), { match: true });
    fadeToMock.mockReset();
    await wrapper.setProps({ match: false });
    await nextTick();
    expect(fadeToMock).toHaveBeenCalledWith(expect.anything(), 0);
  });

  it('does not crossfade when an unrelated prop changes', async () => {
    const wrapper = mountNode(node());
    fadeToMock.mockReset();
    await wrapper.setProps({ tintIndex: 3 });
    await nextTick();
    expect(fadeToMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `src/frontend/`): `npx vitest run src/components/PersonMedallion.spec.ts`
Expected: FAIL — old template has no `.oak__frame` / `.oak__mount` / `.oak__frame-overlay`.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/frontend/src/components/PersonMedallion.vue` with:
```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { LayoutNode } from '../layout/treeLayout';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatYearSpan } from '../format/lifespan';
import { mediaUrl } from '../media/mediaUrl';
import { frameGeom } from './medallion/geometry';
import { frameGold, overlayForState } from './medallion/frameAssets';
import { nameFontSize } from './medallion/nameFit';
import { fadeTo, setOpacity } from '../motion/fade';

// `tintIndex` is retained (unused) so OakTree's call site stays type-valid until
// Task 7 removes both the prop and the pass.
const props = defineProps<{ node: LayoutNode; selected?: boolean; match?: boolean; tintIndex?: number }>();

const localeStore = useLocaleStore();

const g = computed(() => frameGeom(props.node.role));
const givenName = computed(() => localize(props.node.person.givenName, localeStore.currentLocale));
const surname = computed(() => localize(props.node.person.surname, localeStore.currentLocale));
const fullName = computed(() => [givenName.value, surname.value].filter(s => s).join(' '));
const lifespan = computed(() => formatYearSpan(props.node.person.birthYear, props.node.person.deathYear));
const portraitHref = computed(() =>
  props.node.person.portrait ? mediaUrl('portraits', props.node.person.portrait) : null
);
const initial = computed(() => givenName.value.trim().charAt(0).toLocaleUpperCase());
const clipId = computed(() => `oak-oval-${props.node.id}`);
const nameSize = computed(() => nameFontSize(fullName.value, g.value.nameMax));

// Active state overlay (match wins over selected); null = plain gold. `overlayHref`
// keeps the last variant during fade-out so the colour doesn't pop to gold mid-fade.
const overlay = computed(() => overlayForState(props.selected === true, props.match === true));
const overlayHref = ref<string>(overlay.value ?? frameGold);
const overlayEl = ref<SVGImageElement | null>(null);

onMounted(() => {
  if (overlayEl.value) {
    setOpacity(overlayEl.value, overlay.value ? 1 : 0);
  }
});

watch(overlay, next => {
  if (!overlayEl.value) {
    return;
  }
  if (next) {
    overlayHref.value = next;
    fadeTo(overlayEl.value, 1);
  } else {
    fadeTo(overlayEl.value, 0); // keep last href; opacity hides it
  }
});
</script>

<template>
  <g class="oak__medallion-card">
    <!-- dark mount: shows where the zoomed-out portrait doesn't reach the oval -->
    <ellipse class="oak__mount" :rx="g.ovalRx" :ry="g.ovalRy" />

    <!-- portrait (or monogram fallback), clipped to the oval -->
    <clipPath :id="clipId"><ellipse :rx="g.ovalRx" :ry="g.ovalRy" /></clipPath>
    <image
      v-if="portraitHref"
      data-test="portrait"
      :href="portraitHref"
      :x="-(g.portraitZoom * g.w) / 2"
      :y="-(g.portraitZoom * g.h) / 2 + g.portraitOffsetY"
      :width="g.portraitZoom * g.w"
      :height="g.portraitZoom * g.h"
      preserveAspectRatio="xMidYMid slice"
      :clip-path="`url(#${clipId})`"
    />
    <text
      v-else
      class="oak__initial"
      aria-hidden="true"
      text-anchor="middle"
      :y="g.ovalRy * 0.34"
      :style="{ fontSize: `${g.ovalRx * 0.9}px` }"
    >{{ initial }}</text>

    <!-- inner vignette seats the portrait into the frame -->
    <ellipse class="oak__vignette" :rx="g.ovalRx" :ry="g.ovalRy" fill="url(#oak-vignette)" />

    <!-- frame: base gold + state overlay (lit-gold / green-gold) crossfaded -->
    <image
      class="oak__frame"
      :href="frameGold"
      :x="g.frameX" :y="g.frameY" :width="g.w" :height="g.h"
      preserveAspectRatio="none"
    />
    <image
      ref="overlayEl"
      class="oak__frame-overlay"
      :href="overlayHref"
      :x="g.frameX" :y="g.frameY" :width="g.w" :height="g.h"
      preserveAspectRatio="none"
    />

    <!-- name + years in the banner -->
    <text
      class="oak__name"
      text-anchor="middle"
      :y="g.nameY"
      :style="{ fontSize: `${nameSize}px` }"
    >{{ fullName }}</text>
    <text
      v-if="lifespan"
      class="oak__dates"
      data-test="lifespan"
      text-anchor="middle"
      :y="g.yearsY"
      :style="{ fontSize: `${g.yearsSize}px` }"
    >{{ lifespan }}</text>
  </g>
</template>

<style scoped lang="scss">
.oak__mount {
  fill: #241a0d; // dark cameo mount
}
.oak__vignette {
  pointer-events: none;
}
.oak__name {
  font-family: var(--font-display);
  font-weight: 600;
  fill: #2b2113;
}
.oak__dates {
  font-family: var(--font-body);
  fill: #5e4a26;
}
.oak__initial {
  font-family: var(--font-display);
  font-weight: 600;
  fill: var(--gilt-light);
  opacity: 0.7;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `src/frontend/`): `npx vitest run src/components/PersonMedallion.spec.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Type-check the component**

Run (from `src/frontend/`): `npm run build`
Expected: build succeeds (no vue-tsc errors). *If the build fails because OakTree still references removed PersonMedallion internals, that is fixed in Task 7 — but the component + its passing props should type-check; address any error before continuing.*

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/PersonMedallion.vue src/frontend/src/components/PersonMedallion.spec.ts
git commit -m "feat(medallion): render the gilt frame, cameo portrait and one-line name"
```

---

## Task 7: OakTree defs, vignette gradient, focus glow, spec fixes

**Files:**
- Modify: `src/frontend/src/components/OakTree.vue` (defs `158:159`, the node `<g>` `192:198`, styles `234:239`)
- Modify: `src/frontend/src/components/OakTree.spec.ts` (lines 50, 56, 90)

- [ ] **Step 1: Update the OakTree spec to the new medallion**

In `src/frontend/src/components/OakTree.spec.ts`:
- Line 51 — change `expect(names()).toContain('Anna');` to `expect(names()).toContain('Anna X');`
- Line 56 — change `expect(names()).toContain('Анна');` to `expect(names()).toContain('Анна Икс');`
- Lines 90–92 — replace the `oak__medallion--fill` assertion block with:
```ts
    expect(wrapper.findAll('ellipse.oak__mount')).toHaveLength(2);
    // The medallion is built from ellipses + frame <image>s + <text>; no circles anywhere.
    expect(wrapper.findAll('circle')).toHaveLength(0);
```

- [ ] **Step 2: Run the OakTree spec to verify it fails**

Run (from `src/frontend/`): `npx vitest run src/components/OakTree.spec.ts`
Expected: FAIL — `.oak__mount` not found / name mismatch (the new defs/grad aren't in OakTree yet).

- [ ] **Step 3: Replace the OakTree defs**

In `src/frontend/src/components/OakTree.vue`, replace the entire `<defs>…</defs>` block (currently the `oak-roll` linear gradient and the six `oak-tint-*` radial gradients, lines ~145–159) with:
```html
    <defs>
      <!-- inner vignette that seats each portrait into its oval (per-ellipse via objectBoundingBox) -->
      <radialGradient id="oak-vignette" cx="50%" cy="32%" r="72%">
        <stop offset="62%" stop-color="#1c1207" stop-opacity="0" />
        <stop offset="100%" stop-color="#1c1207" stop-opacity="0.42" />
      </radialGradient>
    </defs>
```

- [ ] **Step 4: Drop the now-unused tint-index pass**

In `src/frontend/src/components/OakTree.vue`, change the `<PersonMedallion … />` line (~198) from:
```html
          <PersonMedallion :node="node" :selected="node.id === selectedId" :match="isMatch(node)" :tint-index="index" />
```
to:
```html
          <PersonMedallion :node="node" :selected="node.id === selectedId" :match="isMatch(node)" />
```
The `v-for` index is no longer read; change `v-for="(node, index) in layout.nodes"` to `v-for="node in layout.nodes"` on the node `<g>` (~186).

- [ ] **Step 5: Remove `tintIndex` from the component prop**

In `src/frontend/src/components/PersonMedallion.vue`, change the `defineProps` line to drop `tintIndex` and its comment:
```ts
const props = defineProps<{ node: LayoutNode; selected?: boolean; match?: boolean }>();
```
Then in `PersonMedallion.spec.ts`, replace the "does not crossfade when an unrelated prop changes" test body's `await wrapper.setProps({ tintIndex: 3 });` with `await wrapper.setProps({ node: { ...node(), x: 99 } });` (an unrelated reactive change).

- [ ] **Step 6: Point the keyboard-focus glow at the new frame**

In `src/frontend/src/components/OakTree.vue`, replace the focus-visible rule (lines ~236–239):
```scss
.oak__node:focus-visible :deep(.oak__medallion) {
  stroke: var(--leaf-deep);
  stroke-width: 3;
}
```
with a lit-gold glow on the frame:
```scss
.oak__node:focus-visible :deep(.oak__frame) {
  filter: drop-shadow(0 0 4px #ffe79e) drop-shadow(0 0 9px rgba(255, 231, 158, 0.6));
}
```

- [ ] **Step 7: Verify no orphan references to the removed defs/props remain**

Run (from `src/frontend/`):
```bash
grep -rn 'oak-roll\|oak-tint\|oak__medallion--fill\|oak__scroll\|tint-index\|tintIndex' src
```
Expected: no matches (empty output).

- [ ] **Step 8: Run the affected specs**

Run (from `src/frontend/`): `npx vitest run src/components/OakTree.spec.ts src/components/PersonMedallion.spec.ts`
Expected: PASS (both).

- [ ] **Step 9: Commit**

```bash
git add src/frontend/src/components/OakTree.vue src/frontend/src/components/OakTree.spec.ts src/frontend/src/components/PersonMedallion.vue src/frontend/src/components/PersonMedallion.spec.ts
git commit -m "feat(medallion): wire vignette def, focus glow; drop dead scroll/tint defs"
```

---

## Task 8: Update layout spacing for the new footprint

**Files:**
- Modify: `src/frontend/src/layout/treeLayout.ts` (`CARD_HALF_WIDTH`, lines ~206–214)

- [ ] **Step 1: Update the per-role half-widths**

In `src/frontend/src/layout/treeLayout.ts`, replace the `CARD_HALF_WIDTH` constant and its comment (lines ~206–214) with values matching the new frame widths (`geometry.ts` `W_BY_ROLE` + a small margin):
```ts
// Approximate half-width of a framed medallion per role, mirroring the frame
// widths in components/medallion/geometry.ts (trunk 200 / branch·root 186 /
// leaf 158) plus a small margin. Used only to keep same-generation cards from
// overlapping. Tuned against the live oak (this plan, Task 9).
const CARD_HALF_WIDTH: Record<NodeRole, number> = {
  trunk: 108,
  branch: 101,
  root: 101,
  leaf: 87
};
```

- [ ] **Step 2: Run the layout spec to confirm no regression**

Run (from `src/frontend/`): `npx vitest run src/layout/treeLayout.spec.ts`
Expected: PASS (the spec asserts ordering/roles, not exact widths — these constants only widen separation).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/layout/treeLayout.ts
git commit -m "feat(layout): widen card separation for the framed medallion footprint"
```

---

## Task 9: Live verification, tune, and full gate

**Files:** no new files — live tuning of the constants in `geometry.ts`, `nameFit.ts`, `treeLayout.ts`, and the vignette stops in `OakTree.vue`.

- [ ] **Step 1: Run the full unit suite**

Run (from `src/frontend/`): `npx vitest run`
Expected: PASS (whole suite). Fix any spec that still references the old medallion before continuing.

- [ ] **Step 2: Type-checked production build**

Run (from `src/frontend/`): `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Start the app and verify in the browser**

Ensure the API (`:5037`) and the dev server (`:5173`) are running (via `preview_start` for `backend` then `frontend`). Then, using the preview tools, check the real oak:
- the gilt frame renders per node at trunk / branch / leaf sizes with the portrait as a dark-mounted cameo, head un-clipped, name on one line, years beneath;
- click a person → its gilt **crossfades to lit gold**; clear it → fades back;
- search a name → matches **crossfade to green-gold** and pop out of the gold field;
- keyboard-tab to a node → lit-gold focus glow;
- a person with no portrait shows the dark mount + initial.

> Verify via `preview_snapshot` / DOM checks, not `preview_screenshot` alone — this app's continuous motion can stall the screenshot's wait-for-stable-frame (known quirk). Force a paint if needed.

- [ ] **Step 4: Tune the locked-but-tunable constants against the live view**

Adjust only as needed (spec §11): branch/root `portraitZoom` (default 0.70) and per-role `W_BY_ROLE` in `geometry.ts`; the name band `NAME_CY_F`/`YEARS_DY_F` and `nameFit` `CAP_F`/`FLOOR_F`; the vignette stop opacity in `OakTree.vue`; `CARD_HALF_WIDTH` if any same-generation overlap remains. The fixed spec values (frame ratio, oval clip `30%/35%@49.8%/42%`, `-14%` offset, dark mount `#241a0d`, the state colour maps, one-line name) stay as-is. Re-run `npx vitest run` after any change.

- [ ] **Step 5: Capture proof and commit any tuning**

```bash
git add -A src/frontend/src
git commit -m "fix(medallion): tune frame sizing, crop and spacing against the live oak"
```
(If no tuning was needed, skip the commit.)

- [ ] **Step 6: Final full gate**

Run (from `src/frontend/`): `npx vitest run && npm run build`
Expected: both PASS — the feature is complete.

---

## Self-review notes

- **Spec coverage:** §2 artwork → Task 1; §3.4 state colours → Tasks 1–2; §3.1–3.3 container/portrait/name → Tasks 3, 4, 6; §4 component layers → Task 6; §5 asset-crossfade recolour → Tasks 2, 6; §6 CSS→SVG mapping → Task 6 (+ live tune Task 9); §7 per-role sizing & layout spacing → Tasks 3, 8; §8 states/motion/focus/fallback → Tasks 5, 6, 7; §9 testing → every task + Task 9; §11 tunables → Task 9.
- **Type consistency:** `frameGeom`/`FrameGeom` fields, `overlayForState`, `nameFontSize(name, maxWidth)`, `fadeTo`/`setOpacity`, and the class names (`oak__frame`, `oak__frame-overlay`, `oak__mount`, `oak__vignette`, `oak__name`, `oak__dates`, `oak__initial`) are used identically across the component, its spec, OakTree, and the focus rule.
- **No placeholders:** every code/edit step shows the full content; every run step states the expected result.
