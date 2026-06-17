# Film-Strip Year Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the ’80s theme, turn the year rail (`TimeRail.vue`) into a perforated celluloid strip whose sprocket pitch and frames scale with zoom and scroll with pan, with year labels fading in/out as the tick step refines, plus a responsive slim tier for narrow/horizontal layouts.

**Architecture:** A pure `railFilmStrip.ts` module computes sprocket pitch (tied to the current tick cell, clamped) and the scroll offset from the viewport. `TimeRail` takes a `theme` prop (passed from `TreeView`); in the eighties theme it renders perforation/barcode/stock/emulsion layers (cheap CSS backgrounds, no per-tick DOM) and wraps the ticks in a `<TransitionGroup>` so appearing labels fade. All film styling is scoped under a `.time-rail--film` class; the Classic rail is untouched.

**Tech Stack:** Vue 3 SFC, TypeScript, SCSS, Vitest + @vue/test-utils.

---

### Task 1: Sprocket geometry module

**Files:**
- Create: `src/frontend/src/components/railFilmStrip.ts`
- Create: `src/frontend/src/components/railFilmStrip.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// railFilmStrip.spec.ts
import { describe, it, expect } from 'vitest';
import { sprocketPitch, sprocketOffset } from './railFilmStrip';

describe('sprocketPitch', () => {
  it('stays within the clamp range across zoom levels', () => {
    for (const pxPerYear of [4, 8, 16]) {
      for (const k of [0.1, 0.5, 1, 2, 5, 20]) {
        const p = sprocketPitch(pxPerYear, k);
        expect(p).toBeGreaterThanOrEqual(9);
        expect(p).toBeLessThanOrEqual(34);
      }
    }
  });
  it('is deterministic', () => {
    expect(sprocketPitch(8, 1)).toBe(sprocketPitch(8, 1));
  });
});

describe('sprocketOffset', () => {
  it('wraps into [0, pitch)', () => {
    expect(sprocketOffset(-5, 16)).toBeGreaterThanOrEqual(0);
    expect(sprocketOffset(-5, 16)).toBeLessThan(16);
    expect(sprocketOffset(40, 16)).toBeGreaterThanOrEqual(0);
    expect(sprocketOffset(40, 16)).toBeLessThan(16);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src/frontend && npx vitest run src/components/railFilmStrip.spec.ts`
Expected: FAIL — cannot find module `./railFilmStrip`.

- [ ] **Step 3: Implement the module**

```ts
// railFilmStrip.ts
import { chooseTickStep } from '../layout/timeScale';

const MIN_PITCH = 9;
const MAX_PITCH = 34;

/** Sprocket-hole pitch in screen px, tied to the current frame cell so the
 *  perforations scale with zoom but never get tiny or huge. `pxPerYear` is the
 *  scale's base; `k` the viewport zoom. */
export function sprocketPitch(pxPerYear: number, k: number): number {
  const effective = pxPerYear * k;
  const step = chooseTickStep(effective);
  const pitch = (step * effective) / 3;
  return Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
}

/** Background-position offset in [0, pitch) so the strip scrolls with the
 *  timeline as the viewport pans. */
export function sprocketOffset(viewportOffset: number, pitch: number): number {
  return ((viewportOffset % pitch) + pitch) % pitch;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd src/frontend && npx vitest run src/components/railFilmStrip.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/railFilmStrip.ts src/frontend/src/components/railFilmStrip.spec.ts
git commit -m "Add sprocket-pitch/offset geometry for the film-strip rail"
```

---

### Task 2: `theme` prop + film-strip layers in TimeRail

**Files:**
- Modify: `src/frontend/src/components/TimeRail.vue`
- Test: `src/frontend/src/components/TimeRail.spec.ts`

- [ ] **Step 1: Write the failing tests** (append to `TimeRail.spec.ts`)

```ts
import { sprocketPitch } from './railFilmStrip';

it('renders the film strip only in the eighties theme', () => {
  const classic = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k: 1 }, orientation: 'vertical' } });
  expect(classic.find('[data-test="film-strip"]').exists()).toBe(false);
  const eighties = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k: 1 }, orientation: 'vertical', theme: 'eighties' } });
  expect(eighties.find('[data-test="film-strip"]').exists()).toBe(true);
});

it('sizes the sprocket background from the zoom', () => {
  const w = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k: 1 }, orientation: 'vertical', theme: 'eighties' } });
  const pitch = sprocketPitch(scale.pxPerYear, 1);
  expect(w.find('[data-test="film-strip"]').attributes('style')).toContain(`${pitch}px`);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src/frontend && npx vitest run src/components/TimeRail.spec.ts`
Expected: FAIL — no `film-strip` element.

- [ ] **Step 3: Extend `<script setup>` in TimeRail.vue**

Add the `theme` prop and the strip computeds:

```ts
import { sprocketPitch, sprocketOffset } from './railFilmStrip';

const props = defineProps<{
  scale: TimeScale;
  viewport: Viewport;
  orientation: Orientation;
  theme?: 'classic' | 'eighties';
}>();

const film = computed(() => props.theme === 'eighties');
const pitch = computed(() => sprocketPitch(props.scale.pxPerYear, props.viewport.k));
const offset = computed(() =>
  sprocketOffset(props.orientation === 'vertical' ? props.viewport.y : props.viewport.x, pitch.value)
);
const perfStyle = computed(() =>
  props.orientation === 'vertical'
    ? { backgroundSize: `15px ${pitch.value}px`, backgroundPositionY: `${offset.value}px` }
    : { backgroundSize: `${pitch.value}px 15px`, backgroundPositionX: `${offset.value}px` }
);
```

- [ ] **Step 4: Render the film layers in the template**

Add `'time-rail--film': film` to the root `:class`, and insert the layers as the first children of `.time-rail` (before the ticks):

```html
<div class="time-rail" :class="[`time-rail--${orientation}`, { 'time-rail--film': film }]" data-test="time-rail">
  <template v-if="film">
    <div class="time-rail__perf time-rail__perf--a" data-test="film-strip" :style="perfStyle" />
    <div class="time-rail__perf time-rail__perf--b" :style="perfStyle" />
    <div class="time-rail__barcode" />
    <div class="time-rail__stock">KODAK 5247 · SAFETY</div>
    <div class="time-rail__emulsion" />
  </template>
  <!-- ticks block follows (Task 3 wraps it) -->
</div>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src/frontend && npx vitest run src/components/TimeRail.spec.ts`
Expected: PASS (existing tick tests still green — they omit `theme`, so `film` is false and no layers render).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/TimeRail.vue src/frontend/src/components/TimeRail.spec.ts
git commit -m "Render film-strip layers in TimeRail under the eighties theme"
```

---

### Task 3: Fade year labels with a TransitionGroup

**Files:**
- Modify: `src/frontend/src/components/TimeRail.vue`

- [ ] **Step 1: Wrap the ticks in a TransitionGroup**

Replace the existing `v-for` tick block with a wrapper group. The transition name is active only in the film theme; Classic gets an unstyled (`noop`) name so its behaviour is unchanged:

```html
<TransitionGroup tag="div" class="time-rail__ticks" :name="film ? 'tick-fade' : 'noop'">
  <div
    v-for="tick in ticks"
    :key="tick.year"
    class="time-rail__tick"
    :class="`time-rail__tick--${tick.tier}`"
    data-test="tick"
    :style="tickStyle(tick.pos)"
  >
    <span class="time-rail__label" data-test="tick-label">{{ tick.label }}</span>
  </div>
</TransitionGroup>
```

- [ ] **Step 2: Add the wrapper + fade CSS to the scoped `<style>`**

```scss
&__ticks { position: absolute; inset: 0; }
.tick-fade-enter-active, .tick-fade-leave-active { transition: opacity 0.45s ease; }
.tick-fade-enter-from, .tick-fade-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .tick-fade-enter-active, .tick-fade-leave-active { transition: none; }
}
```

(The `&__tick` rules are absolutely positioned, so nesting them under `&__ticks` needs no change — they position against the rail box as before.)

- [ ] **Step 3: Run the existing TimeRail spec to confirm no regression**

Run: `cd src/frontend && npx vitest run src/components/TimeRail.spec.ts`
Expected: PASS (TransitionGroup does not animate on initial mount, so tick queries are unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/components/TimeRail.vue
git commit -m "Fade year labels in/out on the film-strip rail"
```

---

### Task 4: Film-strip styling + responsive slim tier

CSS-only, verified live (Task 6). All scoped under `.time-rail--film` so Classic is untouched.

**Files:**
- Modify: `src/frontend/src/components/TimeRail.vue` (scoped `<style>`)

- [ ] **Step 1: Add the film celluloid + layer styles**

```scss
// ---- ’80s film-strip variant ----
.time-rail--film {
  background: linear-gradient(100deg, #1d160f, #100c08 55%, #171109);
}
// perforations: canvas-coloured holes punched in the celluloid, scrolling via inline bg-position
.time-rail__perf { position: absolute; pointer-events: none; }
.time-rail--vertical .time-rail__perf {
  top: -20px; bottom: -20px; width: 15px;
  background-image: radial-gradient(circle at 7.5px 8px, var(--canvas-bg) 3.4px, transparent 3.6px);
}
.time-rail--vertical .time-rail__perf--a { left: 0; }
.time-rail--vertical .time-rail__perf--b { right: 0; }
.time-rail--horizontal .time-rail__perf {
  left: -20px; right: -20px; height: 15px;
  background-image: radial-gradient(circle at 8px 7.5px, var(--canvas-bg) 3.4px, transparent 3.6px);
}
.time-rail--horizontal .time-rail__perf--a { top: 0; }
.time-rail--horizontal .time-rail__perf--b { bottom: 0; }

// keykode barcode lane (left, vertical)
.time-rail__barcode {
  position: absolute; pointer-events: none; opacity: 0.5;
  background-image: repeating-linear-gradient(180deg, #c9bd95 0 2px, transparent 2px 4px, #c9bd95 4px 5px, transparent 5px 12px, #c9bd95 12px 14px, transparent 14px 18px);
}
.time-rail--vertical .time-rail__barcode { left: 16px; top: 0; bottom: 0; width: 8px; }

// vertical stock name
.time-rail__stock {
  position: absolute; left: 26px; top: 0; bottom: 0; writing-mode: vertical-rl;
  font-family: var(--font-mono); font-size: 7px; letter-spacing: 2px; color: #d6c79f; opacity: 0.85; pointer-events: none;
}
.time-rail__emulsion {
  position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(120% 60% at 50% 30%, #7a5a2e22, transparent);
}
// frame-line dividers behind the years
.time-rail--film .time-rail__ticks::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background-image: repeating-linear-gradient(#ffffff14 0 1px, transparent 1px 56px);
}
```

- [ ] **Step 2: Restyle the year labels for film (right-aligned, light, no parchment chip, no tick mark)**

```scss
.time-rail--film .time-rail__tick::after { display: none; }                 // perforations are the marks
.time-rail--film .time-rail__label { background: transparent; color: #efe9da; }
.time-rail--film .time-rail__tick--minor .time-rail__label { color: #b9b3a4; }
.time-rail--film.time-rail--vertical .time-rail__tick { justify-content: flex-end; padding-right: 4px; }
```

- [ ] **Step 3: Add the responsive slim tier (≤640px and horizontal)**

```scss
@media (max-width: 640px) {
  .time-rail--film .time-rail__stock { display: none; }   // slim: drop stock text, keep barcode hint
}
.time-rail--film.time-rail--horizontal .time-rail__stock { display: none; }
.time-rail--horizontal .time-rail__barcode {
  left: 0; right: 0; top: 16px; height: 8px; width: auto;
  background-image: repeating-linear-gradient(90deg, #c9bd95 0 2px, transparent 2px 4px, #c9bd95 4px 5px, transparent 5px 12px, #c9bd95 12px 14px, transparent 14px 18px);
}
```

- [ ] **Step 4: Build to confirm the SCSS compiles**

Run: `cd src/frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/TimeRail.vue
git commit -m "Style the film-strip rail with a responsive slim tier"
```

---

### Task 5: Pass the theme from TreeView

**Files:**
- Modify: `src/frontend/src/views/TreeView.vue:189-195`

- [ ] **Step 1: Add the `theme` binding to `<TimeRail>`**

```html
<TimeRail
  class="tree-view__rail"
  :scale="layout.scale"
  :viewport="oakViewport"
  :orientation="ui.orientation"
  :theme="ui.theme"
  :style="{ opacity: entranceActive ? 0 : branchFade(morphProgress), transition: 'opacity var(--motion-fade-ms) ease' }"
/>
```

- [ ] **Step 2: Run the frontend tests (TreeView + TimeRail)**

Run: `cd src/frontend && npx vitest run src/components/TimeRail.spec.ts src/views`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/views/TreeView.vue
git commit -m "Pass the active theme into TimeRail"
```

---

### Task 6: Live verification + docs

**Files:**
- Modify: `docs/reference/` (the theme page)

- [ ] **Step 1: Full frontend test + build**

Run: `cd src/frontend && npm test && npm run build`
Expected: all suites pass; build succeeds.

- [ ] **Step 2: Verify in the browser (preview tools)**

Switch to the ’80s theme and confirm, in both orientations:
- the rail reads as warm celluloid with sprocket holes (not flat black);
- zooming spreads/compresses the sprockets and frames and the year-step refines (100→…→1), with labels fading in/out;
- panning scrolls the perforations with the timeline;
- the barcode + stock name show at desktop width; at ≤640px the stock name drops (barcode stays);
- with “reduce motion” on, labels snap (no fade) but pan/zoom still tracks.
Capture a screenshot at desktop width and one at mobile width as proof.

- [ ] **Step 3: Update docs/reference**

In the Film-theme reference page, add a short subsection: the year rail is a perforated film strip that scrolls with the timeline and refines on zoom (labels fade), with a slim variant on narrow/horizontal layouts; the scroll-with-pan persists under reduced motion while the label fade is disabled. (Run `update-docs-for-pr` at PR time.)

- [ ] **Step 4: Commit**

```bash
git add docs/reference/
git commit -m "Document the film-strip year rail in the Film-theme reference"
```

---

## Self-Review

- **Spec coverage:** §5.1 visual (warm base, sprockets, frame lines, barcode, stock, right-aligned years, emulsion) → Task 4. §5.2 behaviour A (scroll with pan, scale with zoom, refine + fade) → Tasks 1 (pitch/offset), 2 (perfStyle binding), 3 (fade). §5.3 responsive slim + horizontal → Task 4 step 3. Theme-gating / Classic untouched → Task 2 (`film` flag, `.time-rail--film` scope) + Task 5 (prop wiring). Reduced motion → Task 3. Testing (§6: eighties renders strip, classic doesn’t; pitch from zoom) → Task 2; pitch/offset math → Task 1. Docs (§8) → Task 6.
- **Placeholder scan:** none — every code step is complete.
- **Type consistency:** `sprocketPitch(pxPerYear, k)` / `sprocketOffset(viewportOffset, pitch)` defined in Task 1 and used unchanged in Task 2; `theme?: 'classic' | 'eighties'` prop matches `ui.theme` passed in Task 5; class names `time-rail--film`, `time-rail__perf`, `time-rail__barcode`, `time-rail__stock`, `time-rail__emulsion`, `time-rail__ticks`, transition name `tick-fade` consistent across Tasks 2–4.
- **Note:** §5.1 flagged the 88px vertical rail may feel cramped with the full left lane + right-aligned years; if live verification (Task 6) confirms crowding, widen the eighties vertical rail in `TreeView.vue:248` (`&__canvas--vertical &__rail { width: … }`) — left as a live-tuning decision per the spec, not a blind change here.
