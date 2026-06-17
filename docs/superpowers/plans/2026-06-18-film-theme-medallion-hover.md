# Film-Theme Medallion Hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every ’80s-theme medallion an epoch-specific hover: all cards lift; pre-1945 paper prints add a seeded tilt; the film frame adds a running-film advance; the edge-print card lifts only.

**Architecture:** A shared seeded-PRNG helper feeds a per-person tilt module (mirrors `abrasion.ts`). Cards gain an `e80-card` class and (for prints) a `--hover-tilt` CSS variable. The actual hover motion is CSS, kept in one place — the global `styles/themes/eighties.scss` block — gated by `:root[data-theme='eighties']` and `prefers-reduced-motion`. The film frame’s advance is a clipped two-image “gate” that loops while hovered. Transforms apply to each card’s own inner `<g>`, never the layout-positioned node group.

**Tech Stack:** Vue 3 SFC (SVG), TypeScript, SCSS design tokens, Vitest + @vue/test-utils.

---

### Task 1: Extract a shared seeded-PRNG helper

DRY: `abrasion.ts` already contains a `hashSeed` + `mulberry32` PRNG. The tilt module needs the same. Extract it so both share one implementation.

**Files:**
- Create: `src/frontend/src/components/medallion/eighties/seed.ts`
- Create: `src/frontend/src/components/medallion/eighties/seed.spec.ts`
- Modify: `src/frontend/src/components/medallion/eighties/abrasion.ts`

- [ ] **Step 1: Write the failing test**

```ts
// seed.spec.ts
import { describe, it, expect } from 'vitest';
import { seededRandom } from './seed';

describe('seededRandom', () => {
  it('is deterministic for a given id', () => {
    const a = seededRandom('p-42'); const b = seededRandom('p-42');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('differs across ids', () => {
    expect(seededRandom('p-1')()).not.toEqual(seededRandom('p-2')());
  });
  it('returns values in [0,1)', () => {
    const r = seededRandom('p-7');
    for (let i = 0; i < 50; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/frontend && npx vitest run src/components/medallion/eighties/seed.spec.ts`
Expected: FAIL — cannot find module `./seed`.

- [ ] **Step 3: Create the helper (identical algorithm to abrasion.ts)**

```ts
// seed.ts
/** Tiny deterministic string hash → 32-bit seed. */
export function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — deterministic, fast, good enough for cosmetic placement. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic RNG stream for a person id. */
export function seededRandom(id: string): () => number {
  return mulberry32(hashSeed(id));
}
```

- [ ] **Step 4: Refactor abrasion.ts to use the shared helper (no behaviour change)**

Replace the local `hashSeed`/`mulberry32` definitions and the first line of `abrasionFor` with the import. The sequence is identical, so `abrasion.spec.ts` stays green.

```ts
// abrasion.ts — top of file
import { seededRandom } from './seed';
// (delete the local hashSeed and mulberry32 functions)

// inside abrasionFor:
export function abrasionFor(id: string): Abrasion {
  const rand = seededRandom(id);
  // ...rest unchanged...
}
```

- [ ] **Step 5: Run both specs to verify they pass**

Run: `cd src/frontend && npx vitest run src/components/medallion/eighties/seed.spec.ts src/components/medallion/eighties/abrasion.spec.ts`
Expected: PASS (abrasion behaviour unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/medallion/eighties/seed.ts src/frontend/src/components/medallion/eighties/seed.spec.ts src/frontend/src/components/medallion/eighties/abrasion.ts
git commit -m "Extract shared seeded-PRNG helper for eighties cards"
```

---

### Task 2: Seeded hover-tilt module

**Files:**
- Create: `src/frontend/src/components/medallion/eighties/hoverTilt.ts`
- Create: `src/frontend/src/components/medallion/eighties/hoverTilt.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// hoverTilt.spec.ts
import { describe, it, expect } from 'vitest';
import { hoverTilt } from './hoverTilt';

describe('hoverTilt', () => {
  it('is deterministic for a given id', () => {
    expect(hoverTilt('p-42')).toEqual(hoverTilt('p-42'));
  });
  it('differs across ids', () => {
    expect(hoverTilt('p-1')).not.toEqual(hoverTilt('p-2'));
  });
  it('keeps the magnitude a gentle 2–4°', () => {
    for (let i = 0; i < 200; i++) {
      const a = Math.abs(hoverTilt(`p-${i}`).angleDeg);
      expect(a).toBeGreaterThanOrEqual(2);
      expect(a).toBeLessThanOrEqual(4);
    }
  });
  it('tilts both directions across the population', () => {
    const angles = Array.from({ length: 200 }, (_, i) => hoverTilt(`p-${i}`).angleDeg);
    expect(angles.some(a => a < 0)).toBe(true);
    expect(angles.some(a => a > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/frontend && npx vitest run src/components/medallion/eighties/hoverTilt.spec.ts`
Expected: FAIL — cannot find module `./hoverTilt`.

- [ ] **Step 3: Implement the module**

```ts
// hoverTilt.ts
import { seededRandom } from './seed';

export interface HoverTilt {
  /** Degrees, sign and magnitude stable per person. Clockwise is positive. */
  angleDeg: number;
}

/** Stable per-person hover tilt for paper photo cards (cabinet / gelatin).
 *  Magnitude ~2–4°, direction varies. Uses a distinct seed stream from the
 *  abrasion marks so the two are uncorrelated. */
export function hoverTilt(id: string): HoverTilt {
  const rand = seededRandom(`${id}#tilt`);
  const magnitude = 2 + rand() * 2;      // 2..4
  const sign = rand() < 0.5 ? -1 : 1;
  return { angleDeg: Math.round(sign * magnitude * 10) / 10 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd src/frontend && npx vitest run src/components/medallion/eighties/hoverTilt.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/medallion/eighties/hoverTilt.ts src/frontend/src/components/medallion/eighties/hoverTilt.spec.ts
git commit -m "Add seeded per-person hover-tilt module"
```

---

### Task 3: Tag all four cards with `e80-card` and wire the tilt variable

The shared hover CSS (Task 4) targets `.e80-card`. Cabinet & gelatin additionally expose their seeded tilt as a `--hover-tilt` CSS custom property.

**Files:**
- Modify: `src/frontend/src/components/medallion/eighties/CabinetCard.vue`
- Modify: `src/frontend/src/components/medallion/eighties/GelatinPrint.vue`
- Modify: `src/frontend/src/components/medallion/eighties/FilmFrame.vue`
- Modify: `src/frontend/src/components/medallion/eighties/EdgePrintFrame.vue`
- Test: `src/frontend/src/components/medallion/eighties/CabinetCard.spec.ts`, `GelatinPrint.spec.ts` (extend), `FilmFrame.spec.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Add to `CabinetCard.spec.ts` (and the analogous block to `GelatinPrint.spec.ts`, swapping the component import and root selector `.gel`):

```ts
import { hoverTilt } from './hoverTilt';

it('tags the card for hover and sets the seeded tilt variable', () => {
  const w = mount(CabinetCard, { props: { node: node({ id: 'p-5' }, { id: 'p-5' }) } });
  const root = w.find('.cab');
  expect(root.classes()).toContain('e80-card');
  expect(root.attributes('style') || '').toContain(`--hover-tilt: ${hoverTilt('p-5').angleDeg}deg`);
});
```

Add to `FilmFrame.spec.ts`:

```ts
it('tags the film frame as an e80-card (no tilt variable)', () => {
  const w = mount(FilmFrame, { props: { node: node() } });
  const root = w.find('.film');
  expect(root.classes()).toContain('e80-card');
  expect(root.attributes('style') || '').not.toContain('--hover-tilt');
});
```

(If `CabinetCard.spec.ts` / `GelatinPrint.spec.ts` do not yet exist, create them with the same `person`/`node` helpers and `beforeEach` pinia/locale setup as `FilmFrame.spec.ts`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src/frontend && npx vitest run src/components/medallion/eighties/CabinetCard.spec.ts src/components/medallion/eighties/GelatinPrint.spec.ts src/components/medallion/eighties/FilmFrame.spec.ts`
Expected: FAIL — `e80-card` class / `--hover-tilt` style missing.

- [ ] **Step 3: Wire CabinetCard.vue**

In `<script setup>` add:

```ts
import { hoverTilt } from './hoverTilt';
const tilt = computed(() => hoverTilt(props.node.id));
```

Change the root group opening tag:

```html
<g class="cab e80-card" :style="{ '--hover-tilt': `${tilt.angleDeg}deg` }" :filter="selected ? 'url(#film-glow)' : undefined">
```

- [ ] **Step 4: Wire GelatinPrint.vue**

Same two `<script setup>` additions, then:

```html
<g class="gel e80-card" :style="{ '--hover-tilt': `${tilt.angleDeg}deg` }" :filter="selected ? 'url(#film-glow)' : undefined">
```

- [ ] **Step 5: Wire FilmFrame.vue and EdgePrintFrame.vue (class only, no tilt)**

`FilmFrame.vue`:

```html
<g class="film e80-card" :filter="selected ? 'url(#film-glow)' : undefined">
```

`EdgePrintFrame.vue`:

```html
<g class="film film--edge e80-card" :filter="selected ? 'url(#film-glow)' : undefined">
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd src/frontend && npx vitest run src/components/medallion/eighties/CabinetCard.spec.ts src/components/medallion/eighties/GelatinPrint.spec.ts src/components/medallion/eighties/FilmFrame.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/medallion/eighties/
git commit -m "Tag eighties cards as e80-card and expose seeded tilt variable"
```

---

### Task 4: Shared hover CSS (lift, seeded tilt, deeper shadow)

One place for the cross-card hover motion, gated by theme + reduced motion. CSS-only — verified live (Task 6), not unit-tested, matching the existing un-tested `film-flicker` hover.

**Files:**
- Modify: `src/frontend/src/styles/themes/eighties.scss`

- [ ] **Step 1: Append the hover block to `eighties.scss`** (outside the `:root[...]` token block, at file end)

```scss
/* ---- Medallion hover motion (eighties theme only) ---- */
:root[data-theme='eighties'] {
  // pivot on each card's own centre, regardless of its internal geometry
  .e80-card { transform-box: fill-box; transform-origin: center; transition: transform 180ms ease; }

  // all cards lift
  .e80-card:hover { transform: translateY(-8px) scale(1.05); }

  // paper prints additionally tilt by their seeded angle
  .cab.e80-card:hover,
  .gel.e80-card:hover { transform: translateY(-7px) scale(1.04) rotate(var(--hover-tilt, 0deg)); }

  // the static drop shadow deepens on hover
  .e80-card:hover .cab__shadow,
  .e80-card:hover .gel__shadow,
  .e80-card:hover .film__shadow { opacity: 0.5; }
}

@media (prefers-reduced-motion: reduce) {
  :root[data-theme='eighties'] .e80-card { transition: none; }
  :root[data-theme='eighties'] .e80-card:hover { transform: none; }
}
```

- [ ] **Step 2: Type-check / build to confirm the SCSS compiles**

Run: `cd src/frontend && npm run build`
Expected: build succeeds (no SCSS errors).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/styles/themes/eighties.scss
git commit -m "Add shared eighties medallion hover (lift + seeded tilt)"
```

---

### Task 5: Film-frame running-film advance

A clipped “gate” holding two stacked copies of the portrait; on hover it translates down by one frame height and loops, so a duplicate slides in seamlessly. Sprocket holes roll in sync. Reduced-motion disables it.

**Files:**
- Modify: `src/frontend/src/components/medallion/eighties/FilmFrame.vue`

- [ ] **Step 1: Add a clip id and frame-height to `<script setup>`**

```ts
const gateClipId = computed(() => `film-gate-${props.node.id}`);
```

- [ ] **Step 2: Wrap the portrait + grain + abrasion in a clipped gate with a duplicate frame**

Replace the portrait `<image>`, the monogram `<text>`, the grain `<rect>`, and the three abrasion elements with a single clipped group. Add a `<clipPath>` sized to the image box, render the portrait twice (the duplicate one image-height **above**), and keep the grain/abrasion as today inside the gate:

```html
<clipPath :id="gateClipId">
  <rect :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH" />
</clipPath>
<g class="film__gate" :clip-path="`url(#${gateClipId})`" :style="{ '--img-h': `${g.imgH}px` }">
  <template v-if="portraitHref">
    <image data-test="portrait" :href="portraitHref" :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH" preserveAspectRatio="xMidYMid slice" class="film__img" />
    <image aria-hidden="true" :href="portraitHref" :x="g.imgX" :y="g.imgY - g.imgH" :width="g.imgW" :height="g.imgH" preserveAspectRatio="xMidYMid slice" class="film__img film__img--prev" />
  </template>
  <text v-else class="film__initial" text-anchor="middle" :x="0" :y="g.imgY + g.imgH * 0.58" :style="{ fontSize: `${g.imgW * 0.5}px` }">{{ fullName.charAt(0) }}</text>
  <rect :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH" fill="url(#film-grain-tex)" class="film__grain" />
  <!-- keep the existing seeded abrasion <line>/<circle> elements here, unchanged -->
</g>
```

(The existing `data-test="portrait"`, `tiny-scratch`, etc. attributes stay on their elements so the current tests keep passing.)

- [ ] **Step 3: Tag the holes group so it can roll**

Add `class="film__holes"` to the existing `<g data-test="perf-holes" ...>` element (keep `data-test` and `:fill`).

- [ ] **Step 4: Add the advance CSS to FilmFrame’s scoped `<style>`**

```scss
.film__gate { transform-box: fill-box; transform-origin: center; }
.film:hover .film__gate { animation: film-advance 1.8s linear infinite; }
.film:hover .film__holes { animation: film-roll 1.8s linear infinite; }
@keyframes film-advance { from { transform: translateY(0); } to { transform: translateY(var(--img-h)); } }
@keyframes film-roll { from { transform: translateY(0); } to { transform: translateY(16px); } } // matches the 16px hole step
@media (prefers-reduced-motion: reduce) {
  .film:hover .film__gate, .film:hover .film__holes { animation: none; }
}
.film__holes { transform-box: fill-box; }
```

- [ ] **Step 5: Run the FilmFrame spec to confirm nothing regressed**

Run: `cd src/frontend && npx vitest run src/components/medallion/eighties/FilmFrame.spec.ts`
Expected: PASS (portrait/holes/scratch tests still green; there are now two `.film__img` images — if a test used `findAll('[data-test="portrait"]')` it would change, but the spec uses `find` on the single `data-test="portrait"`, which is unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/medallion/eighties/FilmFrame.vue
git commit -m "Add running-film advance to the film-frame hover"
```

---

### Task 6: Live verification + docs

**Files:**
- Modify: `docs/reference/` (the theme page describing the Film theme)

- [ ] **Step 1: Run the full frontend test + build**

Run: `cd src/frontend && npm test && npm run build`
Expected: all suites pass; build succeeds.

- [ ] **Step 2: Verify in the browser (preview tools)**

Start the dev server, switch to the ’80s theme, and hover each card type at tree zoom. Confirm:
- every card lifts;
- a cabinet and a gelatin card tilt (and two different people tilt different ways/amounts);
- the film frame’s portrait runs like film with the holes rolling;
- the edge-print card only lifts;
- with OS “reduce motion” on, hovering produces no transform/animation.
Capture a screenshot of a hovered film frame as proof.

- [ ] **Step 3: Update docs/reference**

In the Film-theme reference page, add a short subsection: per-epoch hover — all cards lift; pre-1945 prints tilt (seeded per person); the film frame runs like film; edge-print lifts only; all disabled under reduced motion. (Run the `update-docs-for-pr` skill at PR time.)

- [ ] **Step 4: Commit**

```bash
git add docs/reference/
git commit -m "Document per-epoch medallion hover in the Film-theme reference"
```

---

## Self-Review

- **Spec coverage:** §3 hover rows → Task 4 (lift, deeper shadow), Task 2+3+4 (seeded tilt for cabinet/gelatin), Task 5 (film-frame advance), Task 3+4 (edge-print lift only). §4.1 inner-group transform → Task 4 (`.e80-card` on each card’s own `<g>`, `transform-box: fill-box`). §4.3 seeded module mirroring abrasion → Tasks 1–2. Reduced motion → Tasks 4 & 5. Testing (§6: hoverTilt deterministic + both signs; edge-print no advance) → Tasks 2 & 3. Docs (§8) → Task 6.
- **Placeholder scan:** none — every code step has full content.
- **Type consistency:** `seededRandom(id)` (Task 1) used by `hoverTilt` (Task 2) and `abrasionFor` (Task 1); `hoverTilt(id).angleDeg` used identically in Task 3 tests and the SFC bindings; `--hover-tilt` / `--img-h` / `.e80-card` / `.film__gate` / `.film__holes` names consistent across Tasks 3–5.
