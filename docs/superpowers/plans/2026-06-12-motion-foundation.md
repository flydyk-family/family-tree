# Motion Foundation (PR 1 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce GSAP and the `src/frontend/src/motion/` module (tokens, reduced-motion, camera, fade, state tweens) and migrate all existing tree motion onto it — zero new UX, zero regressions.

**Architecture:** A single `motion/` module owns every tween; components never import `gsap` directly. State (classes, Pinia, props) always lands instantly and owns the final look; GSAP only interpolates between looks. `prefers-reduced-motion` is checked lazily per call in one module and short-circuits to the end state.

**Tech Stack:** Vue 3 + TypeScript + Vite, GSAP ^3.13 (core only in this PR), Vitest + @vue/test-utils (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-12-oak-motion-design.md` (§2 Architecture, §9 PR 1). PRs 2–4 (ceremony, interactions, Flip) get their own plans later.

---

## Environment prerequisites (read first)

- **Node:** the system Node 18 shadows the portable Node 22 this frontend needs (≥ 20.19). Prepend it to PATH in every shell you use for npm/vitest:
  - PowerShell: `$env:PATH = "$env:LOCALAPPDATA\Programs\nodejs-22;$env:PATH"`
  - bash: `export PATH="$LOCALAPPDATA/Programs/nodejs-22:$PATH"` (or `/c/Users/<user>/AppData/Local/Programs/nodejs-22`)
- **Working directory for npm/vitest commands:** `src/frontend/`.
- **Branch:** `feat/motion-foundation` off `main` (Task 1). The spec/plan docs live on `spec/oak-motion-design` — do not mix the two.
- **Test conventions:** Vitest globals are ON (`describe/it/expect` need no import, but importing from `'vitest'` is the existing style — follow it). jsdom does **not** implement `matchMedia`; tests stub it via `vi.stubGlobal` when they need a specific answer, and `prefersReducedMotion()` must treat "no matchMedia" as `false`.

## File structure

| File | Responsibility |
| --- | --- |
| Create `src/frontend/src/motion/tokens.ts` | The timing language (durations/easings) + `applyMotionTokensToRoot` mirroring them to `--motion-*-ms` CSS custom properties. |
| Create `src/frontend/src/motion/reducedMotion.ts` | `prefersReducedMotion()` — the only place the media query string lives. |
| Create `src/frontend/src/motion/camera.ts` | `glideTo(viewportRef, target)` — GSAP tween on a `{x,y,k}` proxy; instant under reduced motion. |
| Create `src/frontend/src/motion/fade.ts` | `fadeIn(el)` — viewport fade-in. |
| Create `src/frontend/src/motion/stateTween.ts` | `capturePaint(els)` / `tweenFromPaint(snapshots)` — FLIP-for-colors: CSS classes own the final look, GSAP interpolates from the captured previous look. |
| Modify `src/frontend/src/main.ts` | Call `applyMotionTokensToRoot()` at startup. |
| Modify `src/frontend/src/interactions/usePanZoom.ts` | Replace the hand-rolled rAF glide (lines 44–83) with `camera.glideTo`. |
| Modify `src/frontend/src/components/OakTree.vue` | Viewport fade via `fadeIn` (drop the CSS transition + `ready` flag); pass `:match` to medallions. |
| Modify `src/frontend/src/components/PersonMedallion.vue` | `match` prop; paint-snapshot watcher; remove all `transition:` declarations. |
| Tests | One `*.spec.ts` beside each new file; extend `PersonMedallion.spec.ts`. |

---

### Task 1: Branch + install GSAP

**Files:** Modify `src/frontend/package.json`, `src/frontend/package-lock.json` (via npm).

- [ ] **Step 1: Create the branch off main**

```bash
git checkout main && git pull --ff-only && git checkout -b feat/motion-foundation
```

- [ ] **Step 2: Install gsap** (from `src/frontend`, Node 22 on PATH)

Run: `npm install gsap@^3.13.0`
Expected: `package.json` gains `"gsap": "^3.13.0"` under `dependencies`; lockfile updated.

- [ ] **Step 3: Sanity-check the existing suite still passes**

Run: `npm test`
Expected: all suites PASS (gsap is installed but unused).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(motion): add gsap dependency"
```

---

### Task 2: Motion tokens

**Files:**
- Create: `src/frontend/src/motion/tokens.ts`
- Test: `src/frontend/src/motion/tokens.spec.ts`
- Modify: `src/frontend/src/main.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/src/motion/tokens.spec.ts
import { describe, it, expect } from 'vitest';
import { motionTokens, applyMotionTokensToRoot } from './tokens';

describe('motionTokens', () => {
  it('defines the shared timing language (personality A — calm)', () => {
    expect(motionTokens.fade).toEqual({ duration: 0.15, ease: 'power1.out' });
    expect(motionTokens.feedback).toEqual({ duration: 0.3, ease: 'power1.out' });
    expect(motionTokens.glide).toEqual({ duration: 0.35, ease: 'power2.inOut' });
    expect(motionTokens.cascade).toEqual({ duration: 0.4, ease: 'power1.out' });
    expect(motionTokens.morph).toEqual({ duration: 0.45, ease: 'power2.inOut' });
    expect(motionTokens.layoutSwitch).toEqual({ duration: 0.7, ease: 'power2.inOut' });
    expect(motionTokens.ceremony).toEqual({ duration: 4, ease: 'power2.inOut' });
  });

  it('mirrors every token onto the root as --motion-<name>-ms custom properties', () => {
    const root = document.createElement('div');
    applyMotionTokensToRoot(root);
    expect(root.style.getPropertyValue('--motion-fade-ms')).toBe('150ms');
    expect(root.style.getPropertyValue('--motion-feedback-ms')).toBe('300ms');
    expect(root.style.getPropertyValue('--motion-glide-ms')).toBe('350ms');
    expect(root.style.getPropertyValue('--motion-layout-switch-ms')).toBe('700ms');
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `npx vitest run src/motion/tokens.spec.ts`
Expected: FAIL — `Cannot find module './tokens'` (or equivalent resolve error).

- [ ] **Step 3: Implement**

```ts
// src/frontend/src/motion/tokens.ts
export interface MotionToken {
  duration: number; // seconds (GSAP convention)
  ease: string;
}

// The app's single timing language ("Ceremonial unfurl" personality: calm,
// no overshoot). Durations in seconds because every consumer is a GSAP tween;
// applyMotionTokensToRoot mirrors them as ms for any CSS that needs them.
export const motionTokens = {
  fade: { duration: 0.15, ease: 'power1.out' },
  feedback: { duration: 0.3, ease: 'power1.out' },
  glide: { duration: 0.35, ease: 'power2.inOut' },
  cascade: { duration: 0.4, ease: 'power1.out' },
  morph: { duration: 0.45, ease: 'power2.inOut' },
  layoutSwitch: { duration: 0.7, ease: 'power2.inOut' },
  ceremony: { duration: 4, ease: 'power2.inOut' }
} as const satisfies Record<string, MotionToken>;

export function applyMotionTokensToRoot(root: HTMLElement = document.documentElement): void {
  for (const [name, token] of Object.entries(motionTokens)) {
    const kebab = name.replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`);
    root.style.setProperty(`--motion-${kebab}-ms`, `${Math.round(token.duration * 1000)}ms`);
  }
}
```

- [ ] **Step 4: Run the test — must pass**

Run: `npx vitest run src/motion/tokens.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Bootstrap in main.ts**

In `src/frontend/src/main.ts`, add the import and call it before `app.mount`:

```ts
import { applyMotionTokensToRoot } from './motion/tokens';
```

and after `useLocaleStore().initLocale();`:

```ts
applyMotionTokensToRoot();
```

- [ ] **Step 6: Full suite green, then commit**

Run: `npm test` — expected: PASS.

```bash
git add src/motion/tokens.ts src/motion/tokens.spec.ts src/main.ts
git commit -m "feat(motion): timing tokens mirrored to CSS custom properties"
```

---

### Task 3: Reduced-motion module

**Files:**
- Create: `src/frontend/src/motion/reducedMotion.ts`
- Test: `src/frontend/src/motion/reducedMotion.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/src/motion/reducedMotion.spec.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { prefersReducedMotion } from './reducedMotion';

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && matches,
    media,
    addEventListener() {},
    removeEventListener() {}
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('prefersReducedMotion', () => {
  it('is true when the reduce media query matches', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false when the media query does not match', () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false when matchMedia is unavailable (jsdom default)', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `npx vitest run src/motion/reducedMotion.spec.ts`
Expected: FAIL — cannot find module './reducedMotion'.

- [ ] **Step 3: Implement**

```ts
// src/frontend/src/motion/reducedMotion.ts
const QUERY = '(prefers-reduced-motion: reduce)';

// Queried lazily on EVERY call (no module-level caching): tests stub
// `matchMedia` per-case, and the OS setting can change while the app is open.
// A reactive variant can join here when the ceremony PR needs one (YAGNI now).
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(QUERY).matches;
}
```

- [ ] **Step 4: Run the test — must pass**

Run: `npx vitest run src/motion/reducedMotion.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/motion/reducedMotion.ts src/motion/reducedMotion.spec.ts
git commit -m "feat(motion): single lazy prefers-reduced-motion check"
```

---

### Task 4: Camera glide engine

**Files:**
- Create: `src/frontend/src/motion/camera.ts`
- Test: `src/frontend/src/motion/camera.spec.ts`

- [ ] **Step 1: Write the failing test** (gsap is mocked — unit tests never run real tweens)

```ts
// src/frontend/src/motion/camera.spec.ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { Viewport } from '../interactions/panZoom';
import { glideTo } from './camera';

// vi.mock is hoisted above const initialisers — vi.hoisted keeps the mock fn
// alive when the factory runs during the subject's import.
const { to } = vi.hoisted(() => ({ to: vi.fn() }));
vi.mock('gsap', () => ({ default: { to } }));

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && matches,
    media,
    addEventListener() {},
    removeEventListener() {}
  }));
}

beforeEach(() => {
  to.mockReset().mockReturnValue({ kill: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe('glideTo', () => {
  const target: Viewport = { x: 100, y: -40, k: 1.5 };

  it('snaps instantly and returns null under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
    expect(glideTo(viewport, target)).toBeNull();
    expect(viewport.value).toEqual(target);
    expect(to).not.toHaveBeenCalled();
  });

  it('tweens a proxy with the glide token and syncs the ref on every update', () => {
    stubMatchMedia(false);
    const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
    const tween = glideTo(viewport, target);
    expect(tween).not.toBeNull();
    const [proxy, vars] = to.mock.calls[0] as [
      Viewport,
      { x: number; y: number; k: number; duration: number; ease: string; onUpdate: () => void }
    ];
    expect(vars).toMatchObject({ x: 100, y: -40, k: 1.5, duration: 0.35, ease: 'power2.inOut' });
    proxy.x = 50;
    proxy.y = -20;
    proxy.k = 1.25;
    vars.onUpdate();
    expect(viewport.value).toEqual({ x: 50, y: -20, k: 1.25 });
  });

  it('snaps when an explicit non-positive duration is requested', () => {
    stubMatchMedia(false);
    const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
    expect(glideTo(viewport, target, { duration: 0 })).toBeNull();
    expect(viewport.value).toEqual(target);
    expect(to).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `npx vitest run src/motion/camera.spec.ts`
Expected: FAIL — cannot find module './camera'.

- [ ] **Step 3: Implement**

```ts
// src/frontend/src/motion/camera.ts
import gsap from 'gsap';
import type { Ref } from 'vue';
import type { Viewport } from '../interactions/panZoom';
import { motionTokens } from './tokens';
import { prefersReducedMotion } from './reducedMotion';

export interface CameraGlide {
  kill(): void;
}

// Glide a pan/zoom viewport ref to `target`. The tween runs on a detached
// proxy and writes back through the ref each tick, so Vue reactivity stays
// the single source of truth. Returns null when it snapped instantly.
export function glideTo(
  viewport: Ref<Viewport>,
  target: Viewport,
  options?: { duration?: number }
): CameraGlide | null {
  const duration = options?.duration ?? motionTokens.glide.duration;
  if (duration <= 0 || prefersReducedMotion()) {
    viewport.value = { ...target };
    return null;
  }
  const proxy: Viewport = { ...viewport.value };
  return gsap.to(proxy, {
    x: target.x,
    y: target.y,
    k: target.k,
    duration,
    ease: motionTokens.glide.ease,
    overwrite: 'auto',
    onUpdate: () => {
      viewport.value = { x: proxy.x, y: proxy.y, k: proxy.k };
    }
  });
}
```

- [ ] **Step 4: Run the test — must pass**

Run: `npx vitest run src/motion/camera.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/motion/camera.ts src/motion/camera.spec.ts
git commit -m "feat(motion): GSAP camera glide engine"
```

---

### Task 5: Migrate usePanZoom's glide onto the camera engine

**Files:**
- Modify: `src/frontend/src/interactions/usePanZoom.ts` (lines 26, 44–83)

- [ ] **Step 1: Replace the hand-rolled glide**

In `src/frontend/src/interactions/usePanZoom.ts`:

1. Add to the imports (after the `./panZoom` import block):

```ts
import { glideTo, type CameraGlide } from '../motion/camera';
```

2. Delete the `GLIDE_MS` constant (line 26) — the duration now lives in `motionTokens.glide`.

3. Replace everything from `let glideHandle: number | null = null;` (line 44) through the end of `animateTo` (line 83) with:

```ts
  let glide: CameraGlide | null = null;

  function cancelGlide(): void {
    glide?.kill();
    glide = null;
  }

  // Glide the camera to `target`. Counts as a user adjustment so a later
  // resize won't undo a search jump. Instant under prefers-reduced-motion
  // (the camera engine handles that check).
  function animateTo(target: Viewport): void {
    cancelGlide();
    userAdjusted.value = true;
    glide = glideTo(viewport, target);
  }
```

Nothing else changes: `cancelGlide()` call sites (wheel/pointer/touch/fit/unmount), `centerOnPoint`, and the returned API keep working as-is. The old `prefersReducedMotion` and `easeInOutQuad` helpers in this file are deleted with the replaced block.

- [ ] **Step 2: Run the directly affected suites**

Run: `npx vitest run src/components/OakTree.spec.ts src/views/TreeView.spec.ts`
Expected: PASS — the centering tests stub `matchMedia` to reduced-motion, which now flows through `camera.glideTo`'s instant path (synchronous `viewport.value = target`, same as before).

- [ ] **Step 3: Full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/interactions/usePanZoom.ts
git commit -m "refactor(motion): search glide rides the GSAP camera engine"
```

---

### Task 6: Viewport fade-in via GSAP

**Files:**
- Create: `src/frontend/src/motion/fade.ts`
- Test: `src/frontend/src/motion/fade.spec.ts`
- Modify: `src/frontend/src/components/OakTree.vue` (lines 79–84, 154, 209–211)

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/src/motion/fade.spec.ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fadeIn } from './fade';

const { fromTo, set } = vi.hoisted(() => ({ fromTo: vi.fn(), set: vi.fn() }));
vi.mock('gsap', () => ({ default: { fromTo, set } }));

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && matches,
    media,
    addEventListener() {},
    removeEventListener() {}
  }));
}

beforeEach(() => {
  fromTo.mockReset();
  set.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('fadeIn', () => {
  it('fades the element in with the fade token', () => {
    stubMatchMedia(false);
    const el = document.createElement('div');
    fadeIn(el);
    expect(fromTo).toHaveBeenCalledWith(
      el,
      { opacity: 0 },
      expect.objectContaining({ opacity: 1, duration: 0.15, ease: 'power1.out' })
    );
    expect(set).not.toHaveBeenCalled();
  });

  it('sets opacity instantly under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    const el = document.createElement('div');
    fadeIn(el);
    expect(set).toHaveBeenCalledWith(el, { opacity: 1 });
    expect(fromTo).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `npx vitest run src/motion/fade.spec.ts`
Expected: FAIL — cannot find module './fade'.

- [ ] **Step 3: Implement**

```ts
// src/frontend/src/motion/fade.ts
import gsap from 'gsap';
import { motionTokens } from './tokens';
import { prefersReducedMotion } from './reducedMotion';

// Fade an element in from transparent. Instant under reduced motion.
export function fadeIn(el: Element): void {
  if (prefersReducedMotion()) {
    gsap.set(el, { opacity: 1 });
    return;
  }
  gsap.fromTo(
    el,
    { opacity: 0 },
    { opacity: 1, duration: motionTokens.fade.duration, ease: motionTokens.fade.ease }
  );
}
```

- [ ] **Step 4: Run the test — must pass**

Run: `npx vitest run src/motion/fade.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire it into OakTree.vue**

In `src/frontend/src/components/OakTree.vue`:

1. Script — add `fadeIn` to the imports and replace the `ready` block (lines 79–84):

```ts
import { fadeIn } from '../motion/fade';
```

```ts
// Hidden (inline opacity:0) until usePanZoom's onMounted fit has positioned
// the tree, then faded in by GSAP — the first paint never shows the raw
// identity transform. usePanZoom registered its onMounted first, so fit()
// has already run when this hook fires.
const viewportEl = ref<SVGGElement | null>(null);
onMounted(() => {
  if (viewportEl.value) {
    fadeIn(viewportEl.value);
  }
});
```

2. Template — line 154 becomes (static `opacity: 0` replaces the `ready` binding; `fadeIn` overrides it):

```html
    <g ref="viewportEl" class="oak__viewport" :transform="transform" style="opacity: 0">
```

3. Style — delete the now-dead rule (lines 209–211):

```scss
  &__viewport {
    transition: opacity 0.15s ease;
  }
```

- [ ] **Step 6: Run the component suite, then everything**

Run: `npx vitest run src/components/OakTree.spec.ts` — expected: PASS (its assertions read the viewport `transform`, never opacity; verified against current spec).
Run: `npm test` — expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/motion/fade.ts src/motion/fade.spec.ts src/components/OakTree.vue
git commit -m "refactor(motion): oak viewport fade-in via GSAP"
```

---

### Task 7: Paint-snapshot state tween helper

**Files:**
- Create: `src/frontend/src/motion/stateTween.ts`
- Test: `src/frontend/src/motion/stateTween.spec.ts`

The pattern (FLIP-for-colors): CSS classes keep owning the final look; before a state-class flip we capture the computed paint, after Vue patches we `gsap.from` the old paint — so removing the CSS `transition:` rules loses no smoothness.

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/src/motion/stateTween.spec.ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { capturePaint, tweenFromPaint } from './stateTween';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('gsap', () => ({ default: { from } }));

// jsdom's CSS engine doesn't reliably compute SVG paint properties, so the
// tests pin getComputedStyle directly instead of relying on inline styles.
function stubComputedPaint(paint: Record<string, string>): void {
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (prop: string) => paint[prop] ?? ''
  }));
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && matches,
    media,
    addEventListener() {},
    removeEventListener() {}
  }));
}

beforeEach(() => from.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('stateTween', () => {
  it('captures the computed paint of each element', () => {
    stubComputedPaint({ fill: 'rgb(10, 20, 30)', stroke: 'rgb(40, 50, 60)', 'stroke-width': '3.4px' });
    const el = document.createElement('div');
    const [snapshot] = capturePaint([el]);
    expect(snapshot.el).toBe(el);
    expect(snapshot.vars).toEqual({
      fill: 'rgb(10, 20, 30)',
      stroke: 'rgb(40, 50, 60)',
      strokeWidth: '3.4px'
    });
  });

  it('tweens FROM the captured paint with the feedback token and clears inline props after', () => {
    stubComputedPaint({ stroke: 'rgb(1, 2, 3)' });
    stubMatchMedia(false);
    const el = document.createElement('div');
    const snapshots = capturePaint([el]);
    tweenFromPaint(snapshots);
    expect(from).toHaveBeenCalledTimes(1);
    const [target, vars] = from.mock.calls[0] as [Element, Record<string, unknown>];
    expect(target).toBe(el);
    expect(vars).toMatchObject({
      stroke: 'rgb(1, 2, 3)',
      duration: 0.3,
      ease: 'power1.out',
      overwrite: 'auto',
      clearProps: 'fill,stroke,strokeWidth'
    });
  });

  it('does nothing under prefers-reduced-motion (classes already show the end state)', () => {
    stubComputedPaint({ stroke: 'rgb(1, 2, 3)' });
    stubMatchMedia(true);
    const el = document.createElement('div');
    tweenFromPaint(capturePaint([el]));
    expect(from).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `npx vitest run src/motion/stateTween.spec.ts`
Expected: FAIL — cannot find module './stateTween'.

- [ ] **Step 3: Implement**

```ts
// src/frontend/src/motion/stateTween.ts
import gsap from 'gsap';
import { motionTokens } from './tokens';
import { prefersReducedMotion } from './reducedMotion';

export interface PaintSnapshot {
  el: Element;
  vars: { fill?: string; stroke?: string; strokeWidth?: string };
}

// CSS classes own every visual state; these helpers only interpolate between
// them. Capture BEFORE the class flip, tween AFTER Vue has patched the DOM.
export function capturePaint(els: Iterable<Element>): PaintSnapshot[] {
  const snapshots: PaintSnapshot[] = [];
  for (const el of els) {
    const style = getComputedStyle(el);
    const vars: PaintSnapshot['vars'] = {};
    const fill = style.getPropertyValue('fill');
    const stroke = style.getPropertyValue('stroke');
    const strokeWidth = style.getPropertyValue('stroke-width');
    if (fill) {
      vars.fill = fill;
    }
    if (stroke) {
      vars.stroke = stroke;
    }
    if (strokeWidth) {
      vars.strokeWidth = strokeWidth;
    }
    snapshots.push({ el, vars });
  }
  return snapshots;
}

export function tweenFromPaint(snapshots: PaintSnapshot[]): void {
  if (prefersReducedMotion()) {
    return;
  }
  for (const { el, vars } of snapshots) {
    if (Object.keys(vars).length === 0) {
      continue;
    }
    gsap.from(el, {
      ...vars,
      duration: motionTokens.feedback.duration,
      ease: motionTokens.feedback.ease,
      overwrite: 'auto',
      // Leave no inline styles behind, or they would mask future class flips.
      clearProps: 'fill,stroke,strokeWidth'
    });
  }
}
```

- [ ] **Step 4: Run the test — must pass**

Run: `npx vitest run src/motion/stateTween.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/motion/stateTween.ts src/motion/stateTween.spec.ts
git commit -m "feat(motion): paint-snapshot state tween (FLIP-for-colors)"
```

---

### Task 8: Medallion state changes ride the state tween

**Files:**
- Modify: `src/frontend/src/components/PersonMedallion.vue`
- Modify: `src/frontend/src/components/OakTree.vue` (line 191)
- Test: `src/frontend/src/components/PersonMedallion.spec.ts` (extend)

- [ ] **Step 1: Extend the spec — write the failing tests**

In `src/frontend/src/components/PersonMedallion.spec.ts`:

The component tests assert the *wiring* (snapshot captured before patch, tween fired after) by mocking the `stateTween` module — its real behavior, including the reduced-motion no-op, is already unit-tested in Task 7.

1. Extend the vitest import (line 1) and add the module mock right after the existing imports:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextTick } from 'vue';
```

```ts
const { capturePaintMock, tweenFromPaintMock } = vi.hoisted(() => ({
  capturePaintMock: vi.fn(() => []),
  tweenFromPaintMock: vi.fn()
}));
vi.mock('../motion/stateTween', () => ({
  capturePaint: capturePaintMock,
  tweenFromPaint: tweenFromPaintMock
}));
```

2. Add inside the existing `describe('PersonMedallion', …)` block:

```ts
  it('captures the old paint and tweens from it when the selection state flips', async () => {
    const wrapper = mountNode(node());
    capturePaintMock.mockClear();
    tweenFromPaintMock.mockClear();
    await wrapper.setProps({ selected: true });
    await nextTick();
    expect(capturePaintMock).toHaveBeenCalledTimes(1);
    // ring + scroll body + two roll ends
    expect((capturePaintMock.mock.calls[0][0] as Element[]).length).toBe(4);
    expect(tweenFromPaintMock).toHaveBeenCalledTimes(1);
  });

  it('tweens when the match state flips', async () => {
    const wrapper = mount(PersonMedallion, { props: { node: node(), match: false } });
    capturePaintMock.mockClear();
    tweenFromPaintMock.mockClear();
    await wrapper.setProps({ match: true });
    await nextTick();
    expect(tweenFromPaintMock).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run it — must fail**

Run: `npx vitest run src/components/PersonMedallion.spec.ts`
Expected: the two new tests FAIL (the `match` prop and the watcher don't exist yet, so the mocks are never called); the existing tests still PASS.

- [ ] **Step 3: Implement in PersonMedallion.vue**

1. Script — extend imports and props, add element refs + the snapshot watcher:

```ts
import { computed, nextTick, ref, watch } from 'vue';
import { capturePaint, tweenFromPaint } from '../motion/stateTween';
```

```ts
const props = defineProps<{ node: LayoutNode; selected?: boolean; match?: boolean; tintIndex?: number }>();
```

```ts
// State classes (selected / match, applied here and by OakTree's :deep rules)
// own the final paint; this watcher captures the old paint pre-patch and
// tweens from it post-patch, replacing the removed CSS transitions.
const bodyEl = ref<SVGRectElement | null>(null);
const leftRollEl = ref<SVGRectElement | null>(null);
const rightRollEl = ref<SVGRectElement | null>(null);
const ringEl = ref<SVGEllipseElement | null>(null);

watch(
  () => [props.selected, props.match] as const,
  () => {
    const els = [ringEl.value, bodyEl.value, leftRollEl.value, rightRollEl.value]
      .filter((el): el is SVGElement => el !== null);
    const snapshot = capturePaint(els);
    void nextTick(() => tweenFromPaint(snapshot));
  },
  { flush: 'pre' }
);
```

2. Template — attach the refs (same elements, nothing else changes):

```html
    <rect
      ref="leftRollEl"
      class="oak__scroll-roll"
      :x="c.leftRollX" :y="c.rollTop" :width="c.rollW" :height="c.rollH" :rx="c.rollW / 2"
    />
    <rect
      ref="rightRollEl"
      class="oak__scroll-roll"
      :x="c.rightRollX" :y="c.rollTop" :width="c.rollW" :height="c.rollH" :rx="c.rollW / 2"
    />
    <rect
      ref="bodyEl"
      class="oak__scroll-body"
      :x="-c.halfW" :y="c.sy" :width="c.scrollW" :height="c.scrollH" rx="4"
    />
```

and on the gilt frame ring ellipse:

```html
  <ellipse
    ref="ringEl"
    class="oak__medallion oak__gilt-band"
    :class="[`oak__medallion--${node.role}`, { 'oak__medallion--selected': selected }]"
    :rx="c.rx"
    :ry="c.ry"
  />
```

3. Style — remove all three `transition:` declarations (from `.oak__scroll-body`, `.oak__scroll-roll`, `.oak__gilt-band`). No other style changes.

- [ ] **Step 4: Pass the match prop from OakTree**

In `src/frontend/src/components/OakTree.vue` line 191:

```html
          <PersonMedallion :node="node" :selected="node.id === selectedId" :match="isMatch(node)" :tint-index="index" />
```

(The `oak__node--match` class on the parent `<g>` stays — it still owns the styling.)

- [ ] **Step 5: Run the component suites — must pass**

Run: `npx vitest run src/components/PersonMedallion.spec.ts src/components/OakTree.spec.ts`
Expected: PASS, including the two new tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/PersonMedallion.vue src/components/PersonMedallion.spec.ts src/components/OakTree.vue
git commit -m "refactor(motion): medallion state changes tween via GSAP, CSS transitions retired"
```

---

### Task 9: Final verification + PR

- [ ] **Step 1: Full frontend gate** (from `src/frontend`)

Run: `npm test` — expected: PASS, no skips.
Run: `npm run build` — expected: vue-tsc type-check + production build succeed.

- [ ] **Step 2: Backend gate untouched but verified** (from repo root)

Run: `dotnet test` — expected: PASS (nothing backend changed; this is the pre-merge gate).

- [ ] **Step 3: Manual smoke via dev servers** (optional but recommended)

Run API + `npm run dev`, open http://localhost:5173: tree fades in, search centering glides (350 ms), selecting/searching tweens medallion colors smoothly, wheel/drag interrupt glides. With OS reduced-motion enabled: everything instant.

- [ ] **Step 4: Push and open the PR — do NOT merge**

```bash
git push -u origin feat/motion-foundation
gh pr create --base main --title "Give the oak a single motion engine" --body "$(cat <<'EOF'
Introduces GSAP and the src/frontend/src/motion module (tokens, reduced-motion,
camera glide, fade, paint-snapshot state tweens) and migrates all existing tree
motion onto it: search glide, viewport fade-in, medallion selection/match
transitions. Zero new UX — groundwork for the entrance ceremony, choreographed
interactions, and Flip transitions (PRs 2-4).

Spec: docs/superpowers/specs/2026-06-12-oak-motion-design.md (Plan: PR 1 of 4)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Stop here — the repo owner reviews and squash-merges.

---

## Self-review notes (kept for the executor)

- **Spec coverage (PR 1 scope):** gsap dep (T1), tokens + CSS custom properties (T2), reducedMotion (T3), camera engine (T4), search-glide migration (T5), viewport fade migration (T6), medallion transition migration (T7–8), "no CSS transitions remain on the tree" — the only tree-side `transition:` rules are PersonMedallion's three (removed in T8) and OakTree's viewport rule (removed in T6).
- **Known-green assumptions verified against current code:** OakTree.spec stubs `matchMedia` (reduced motion) for centering tests and asserts viewport `transform` only; PersonMedallion.spec asserts classes/structure, never transitions; jsdom lacks `matchMedia`, so the default unit-test path is "motion on" with gsap mocked.
- **Out of scope here:** ceremony (`entrance.ts`), popup/dock morphs, layout-switch, portrait fade-in, reactive reduced-motion ref — PRs 2–4.
