# Dock control v2 + reliable dock/undock morph — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the gilt dock tab with a floating chevron that grows a rounded-square glass body on hover (with a bold directional tick), and rebuild the dock/undock flight as a deterministic FLIP that actually animates (the GSAP Flip swap was silently instant).

**Architecture:** `motion/popupDock.ts` is rewritten from GSAP **Flip** to an explicit FLIP using `gsap.fromTo`/`gsap.from`: a pure `flipInvert(source, dest)` computes the inverse transform, `captureDockMorph(id)` snapshots the morphing card's screen rect (plus the other rail cards' rects for reflow) and returns a committer that, after the Vue `v-if` swap, flies the surviving element from the source rect and glides the reflowed neighbours. The control in `PersonPopup.vue` becomes a `<button>` with a chevron + a body span that scales/fades on hover and a CSS keyframe tick. State-first is preserved (the Pinia store mutates synchronously; motion is layered on top).

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Pinia, GSAP 3.13 (core only — the `gsap/Flip` plugin is dropped), Vitest + @vue/test-utils. Design: [docs/superpowers/specs/2026-06-14-dock-control-and-morph-redesign.md](../specs/2026-06-14-dock-control-and-morph-redesign.md).

---

## Background the implementer needs

- This revises the **open PR #80** in place — work on the current `feat/popup-dock-morph` branch, add new commits, push to update the PR. Do **not** branch.
- **What's already on the branch** (the first cut, being revised):
  - `src/frontend/src/motion/popupDock.ts` — registers GSAP Flip, exports `DOCK_FLIP_SELECTOR`, `captureDockMorph()` (no args) using `Flip.getState`/`Flip.from`. **This file is rewritten in Task 1.**
  - `src/frontend/src/composables/useDockMorph.ts` — `morph(mutate)` calling `captureDockMorph()`. **Updated in Task 2** to thread the person id.
  - `src/frontend/src/components/PersonPopup.vue` — has `.popup__shell`, the dialog `<section data-test="dialog" :data-flip-id="\`dock-card-${panel.biggerViewId}\`">`, the `✕` close (`data-test="close"`), and a gilt `.popup__dock-tab` button (`data-test="popup-dock"`) with a `.popup__dock-arrow` `→`. **The tab is replaced in Task 3**; the script (`onDock` → `dockMorph.dock()`) and the dialog/`✕` stay.
  - `DockPanel.vue` / `PanelRail.vue` already put `data-flip-id="dock-card-${id}"` on each person's rail panel/chip. **No changes needed** — the morph and the reflow read them by selector.
- **Why GSAP Flip is dropped:** its swap-by-`data-flip-id` across the popup's `v-if` mount/unmount did not fly the newly-mounted element, so the morph was instant. The explicit FLIP here is deterministic and unit-testable.
- **State-first rule:** the store actions (`undock`, `closeBiggerView`) stay synchronous and are NOT modified. Capture the source rect *before* mutating, mutate, `await nextTick()`, then animate.
- **CSS tokens that exist** (use as written): `--glass-bg`, `--glass-border`, `--parchment-2`, `--ink`, `--ink-soft`, `--leaf-deep`. Motion token `motionTokens.morph` = `{ duration: 0.45, ease: 'power2.inOut' }`.
- **i18n:** reuse the existing key `panel.dock` for the control's `aria-label`/`title` — **no new strings**.
- **Test commands** (from `src/frontend`): single file `npm test -- <path>`; full suite `npm test`; type-check + build `npm run build`. The harness starves `requestAnimationFrame`, so unit tests mock GSAP and the visible motion is verified live with the owner.
- **Custom ports for live runs:** frontend **5210**, API consumed read-only on **5037** (never bind defaults). A dev server may already be running on 5210 from earlier.

---

## File structure

| File | Created/Modified | Responsibility |
| --- | --- | --- |
| `src/frontend/src/motion/popupDock.ts` | **Rewrite** | `flipInvert` (pure) + `captureDockMorph(id)` → `play()`/`finish()` via `gsap.fromTo`/`gsap.from`; neighbour reflow. Only gsap importer; no Flip plugin. |
| `src/frontend/src/motion/popupDock.spec.ts` | **Rewrite** | Unit tests: pure inverse math; capture/play/reflow/reduced-motion (GSAP mocked, rects stubbed). |
| `src/frontend/src/composables/useDockMorph.ts` | Modify | Thread the person id into capture (`dock()` reads `biggerViewId` pre-mutate). |
| `src/frontend/src/composables/useDockMorph.spec.ts` | Modify | Assert id threading + existing ordering/re-entrancy/reduced-motion. |
| `src/frontend/src/components/PersonPopup.vue` | Modify | Replace `.popup__dock-tab` with the floating-chevron button (`.popup__dock-chevron` + `.popup__dock-body` + chevron svg + tick keyframe). |
| `src/frontend/src/components/PersonPopup.spec.ts` | Modify | Assert the control class is `popup__dock-chevron` (still `data-test="popup-dock"`). |
| `docs/reference/features/person-details.md` | Modify (Task 4) | Update the dock control + morph description. |

---

## Task 1: Rewrite `motion/popupDock.ts` — pure FLIP + deterministic morph (TDD)

**Files:**
- Rewrite: `src/frontend/src/motion/popupDock.ts`
- Rewrite test: `src/frontend/src/motion/popupDock.spec.ts`

- [ ] **Step 1: Replace the spec with the new failing tests**

Overwrite `src/frontend/src/motion/popupDock.spec.ts` with:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock gsap core (default export). fromTo/from return a chainable tween-like
// object (progress() returns the tween, matching GSAP's API).
const mocks = vi.hoisted(() => {
  const makeTween = () => { const t: any = { progress: vi.fn(() => t), kill: vi.fn() }; return t; };
  return { makeTween, fromTo: vi.fn(() => mocks.makeTween()), from: vi.fn(() => mocks.makeTween()) };
});
vi.mock('gsap', () => ({ default: { fromTo: mocks.fromTo, from: mocks.from } }));

import { captureDockMorph, flipInvert } from './popupDock';
import { motionTokens } from './tokens';

function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && reduced,
    media, addEventListener() {}, removeEventListener() {}
  }));
}

// A div carrying a data-flip-id whose getBoundingClientRect is driven by a
// mutable rect object (so the same element can report different rects before
// and after the simulated DOM swap).
function card(id: string, rect: { left: number; top: number; width: number; height: number }) {
  const el = document.createElement('div');
  el.setAttribute('data-flip-id', `dock-card-${id}`);
  el.getBoundingClientRect = () => ({
    left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON() {}
  }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { stubMatchMedia(false); });
afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('flipInvert', () => {
  it('is identity for equal rects', () => {
    const r = { left: 10, top: 20, width: 100, height: 50 };
    expect(flipInvert(r, r)).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  });
  it('computes top-left translate and size scale', () => {
    const source = { left: 200, top: 100, width: 60, height: 30 };
    const dest = { left: 50, top: 40, width: 120, height: 120 };
    expect(flipInvert(source, dest)).toEqual({ x: 150, y: 60, scaleX: 0.5, scaleY: 0.25 });
  });
  it('guards a zero-size destination (scale 1, no NaN)', () => {
    const source = { left: 0, top: 0, width: 80, height: 40 };
    const dest = { left: 0, top: 0, width: 0, height: 0 };
    expect(flipInvert(source, dest)).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  });
});

describe('captureDockMorph', () => {
  it('returns null under reduced motion', () => {
    stubMatchMedia(true);
    card('p1', { left: 0, top: 0, width: 10, height: 10 });
    expect(captureDockMorph('p1')).toBeNull();
    expect(mocks.fromTo).not.toHaveBeenCalled();
  });

  it('returns null when there is no source element for the id', () => {
    expect(captureDockMorph('ghost')).toBeNull();
  });

  it('flies the destination from the source rect using the morph token', () => {
    const source = card('p1', { left: 300, top: 100, width: 80, height: 40 });
    const capture = captureDockMorph('p1')!;
    // Simulate the v-if swap: source removed, a new dest card with the same id appears.
    source.remove();
    const dest = card('p1', { left: 100, top: 50, width: 160, height: 200 });
    capture.play();

    expect(mocks.fromTo).toHaveBeenCalledTimes(1);
    const [target, fromVars, toVars] = mocks.fromTo.mock.calls[0];
    expect(target).toBe(dest);
    expect(fromVars).toMatchObject({ x: 200, y: 50, scaleX: 0.5, scaleY: 0.2, opacity: 0.35, transformOrigin: 'top left' });
    expect(toVars).toMatchObject({
      x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1,
      duration: motionTokens.morph.duration, ease: motionTokens.morph.ease
    });
    expect(toVars.clearProps).toContain('transform');
  });

  it('glides a neighbour card that reflowed', () => {
    card('p1', { left: 300, top: 0, width: 80, height: 40 });   // source (will be swapped)
    const neighbourRect = { left: 0, top: 100, width: 80, height: 40 };
    const neighbour = card('p2', neighbourRect);                 // present before AND after
    const capture = captureDockMorph('p1')!;
    // Swap p1, and reflow the neighbour upward by 40px.
    document.querySelector('[data-flip-id="dock-card-p1"]')!.remove();
    card('p1', { left: 100, top: 0, width: 160, height: 200 });  // new dest
    neighbourRect.top = 60;
    capture.play();

    expect(mocks.from).toHaveBeenCalledTimes(1);
    const [target, vars] = mocks.from.mock.calls[0];
    expect(target).toBe(neighbour);
    expect(vars).toMatchObject({ x: 0, y: 40, duration: motionTokens.morph.duration });
  });

  it('finish() completes every tween instantly', () => {
    const source = card('p1', { left: 300, top: 0, width: 80, height: 40 });
    const capture = captureDockMorph('p1')!;
    source.remove();
    card('p1', { left: 100, top: 0, width: 160, height: 200 });
    const morph = capture.play()!;
    morph.finish();
    expect(mocks.fromTo.mock.results[0].value.progress).toHaveBeenCalledWith(1);
    expect(mocks.fromTo.mock.results[0].value.kill).toHaveBeenCalled();
  });

  it('play() returns null when the destination is missing', () => {
    const source = card('p1', { left: 0, top: 0, width: 10, height: 10 });
    const capture = captureDockMorph('p1')!;
    source.remove();           // no replacement appears
    expect(capture.play()).toBeNull();
    expect(mocks.fromTo).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/motion/popupDock.spec.ts`
Expected: FAIL — `flipInvert` is not exported / old `Flip`-based module mismatches the new mock.

- [ ] **Step 3: Rewrite the module**

Overwrite `src/frontend/src/motion/popupDock.ts` with:

```ts
import gsap from 'gsap';
import { motionTokens } from './tokens';
import { prefersReducedMotion } from './reducedMotion';

export interface Rect { left: number; top: number; width: number; height: number; }
export interface FlipInvert { x: number; y: number; scaleX: number; scaleY: number; }

// Pure FLIP inverse: the transform (top-left origin) that places `dest` exactly
// over where `source` was. Animating from this back to identity makes `dest`
// appear to start at the source's position and size. Zero-size dest → scale 1.
export function flipInvert(source: Rect, dest: Rect): FlipInvert {
  return {
    x: source.left - dest.left,
    y: source.top - dest.top,
    scaleX: dest.width === 0 ? 1 : source.width / dest.width,
    scaleY: dest.height === 0 ? 1 : source.height / dest.height
  };
}

export interface DockMorph { finish(): void; }
export interface DockMorphCapture { play(): DockMorph | null; }

const MORPH_START_OPACITY = 0.35;
const CLEAR = 'transform,opacity,transformOrigin';

function selector(id: string): string { return `[data-flip-id="dock-card-${id}"]`; }

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

// Snapshot the morphing card (the element currently present for `id`) plus the
// other rail cards (for reflow), BEFORE the store mutation. Returns a committer
// whose play() — called after the DOM swap (await nextTick) — flies the surviving
// element from the source rect and glides the reflowed neighbours. Null under
// reduced motion or when there is no source element.
export function captureDockMorph(id: string): DockMorphCapture | null {
  if (prefersReducedMotion()) {
    return null;
  }
  const sourceEl = document.querySelector(selector(id));
  if (!sourceEl) {
    return null;
  }
  const source = rectOf(sourceEl);
  const others = new Map<string, Rect>();
  for (const el of Array.from(document.querySelectorAll('[data-flip-id]'))) {
    const fid = el.getAttribute('data-flip-id');
    if (fid && el !== sourceEl) {
      others.set(fid, rectOf(el));
    }
  }

  return {
    play(): DockMorph | null {
      const destEl = document.querySelector(selector(id));
      if (!destEl) {
        return null;
      }
      const inv = flipInvert(source, rectOf(destEl));
      const tweens: gsap.core.Tween[] = [];
      tweens.push(gsap.fromTo(
        destEl,
        { x: inv.x, y: inv.y, scaleX: inv.scaleX, scaleY: inv.scaleY, opacity: MORPH_START_OPACITY, transformOrigin: 'top left' },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, duration: motionTokens.morph.duration, ease: motionTokens.morph.ease, clearProps: CLEAR }
      ));

      // Neighbour reflow: any other card still present that shifted glides from
      // its old position to its new one.
      for (const el of Array.from(document.querySelectorAll('[data-flip-id]'))) {
        const fid = el.getAttribute('data-flip-id');
        if (!fid || el === destEl) {
          continue;
        }
        const prev = others.get(fid);
        if (!prev) {
          continue;
        }
        const now = rectOf(el);
        const dx = prev.left - now.left;
        const dy = prev.top - now.top;
        if (dx === 0 && dy === 0) {
          continue;
        }
        tweens.push(gsap.from(el, { x: dx, y: dy, duration: motionTokens.morph.duration, ease: motionTokens.morph.ease, clearProps: 'transform' }));
      }

      return {
        finish(): void {
          for (const t of tweens) {
            t.progress(1).kill();
          }
        }
      };
    }
  };
}
```

> If `gsap.core.Tween[]` triggers a type error in this GSAP version, fall back to `ReturnType<typeof gsap.fromTo>[]`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/motion/popupDock.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/motion/popupDock.ts src/frontend/src/motion/popupDock.spec.ts
git commit -m "feat(motion): deterministic FLIP dock morph (replaces gsap/Flip swap)"
```

---

## Task 2: Thread the person id through `useDockMorph` (TDD)

**Files:**
- Modify: `src/frontend/src/composables/useDockMorph.ts`
- Modify test: `src/frontend/src/composables/useDockMorph.spec.ts`

- [ ] **Step 1: Update the spec to assert id threading**

Overwrite `src/frontend/src/composables/useDockMorph.spec.ts` with:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Mock the motion seam so we assert orchestration, not GSAP.
const mocks = vi.hoisted(() => {
  const finish = vi.fn();
  const play = vi.fn(() => ({ finish }));
  const capture = { play };
  return { finish, play, capture, captureDockMorph: vi.fn((_id: string): unknown => capture) };
});
vi.mock('../motion/popupDock', () => ({ captureDockMorph: mocks.captureDockMorph }));

import { useDockMorph } from './useDockMorph';
import { usePanelStore } from '../stores/panelStore';

beforeEach(() => { setActivePinia(createPinia()); });
afterEach(() => { vi.clearAllMocks(); });

describe('useDockMorph', () => {
  it('undock: captures with the id, mutates synchronously, plays after the tick', async () => {
    const panel = usePanelStore();
    panel.openPerson('p1');
    const undockSpy = vi.spyOn(panel, 'undock');
    const { undock } = useDockMorph();

    const done = undock('p1');
    expect(mocks.captureDockMorph).toHaveBeenCalledWith('p1');
    expect(undockSpy).toHaveBeenCalledWith('p1');
    expect(panel.biggerViewId).toBe('p1');
    expect(mocks.play).not.toHaveBeenCalled();

    await done;
    expect(mocks.play).toHaveBeenCalledTimes(1);
  });

  it('dock: captures with the CURRENT biggerViewId (read before mutate), then plays', async () => {
    const panel = usePanelStore();
    panel.openPerson('p1');
    panel.openBiggerView('p1');
    const { dock } = useDockMorph();

    await dock();
    expect(mocks.captureDockMorph).toHaveBeenCalledWith('p1');
    expect(panel.biggerViewId).toBeNull();
    expect(mocks.play).toHaveBeenCalledTimes(1);
  });

  it('a second morph finishes the in-flight one instantly first', async () => {
    const panel = usePanelStore();
    panel.openPerson('p1');
    const { undock, dock } = useDockMorph();

    await undock('p1');
    expect(mocks.finish).not.toHaveBeenCalled();
    await dock();
    expect(mocks.finish).toHaveBeenCalledTimes(1);
    expect(mocks.play).toHaveBeenCalledTimes(2);
  });

  it('under reduced motion (capture returns null) it still mutates, never plays', async () => {
    mocks.captureDockMorph.mockReturnValueOnce(null);
    const panel = usePanelStore();
    panel.openPerson('p1');
    const { undock } = useDockMorph();

    await undock('p1');
    expect(panel.biggerViewId).toBe('p1');
    expect(mocks.play).not.toHaveBeenCalled();
  });

  it('dock with no open popup does not capture', async () => {
    const panel = usePanelStore();
    const { dock } = useDockMorph();
    await dock();
    expect(mocks.captureDockMorph).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/composables/useDockMorph.spec.ts`
Expected: FAIL — `captureDockMorph` currently called with no args (`toHaveBeenCalledWith('p1')` fails), and the no-popup case captures.

- [ ] **Step 3: Update the composable**

Overwrite `src/frontend/src/composables/useDockMorph.ts` with:

```ts
import { nextTick } from 'vue';
import { usePanelStore } from '../stores/panelStore';
import { captureDockMorph, type DockMorph } from '../motion/popupDock';

// Wraps the synchronous dock/undock store actions in a deterministic FLIP morph.
// State-first: capture the morphing card's bounds, mutate the store, wait for
// Vue to patch the DOM, then fly the destination from the source's bounds.
export function useDockMorph() {
  const panel = usePanelStore();
  let inFlight: DockMorph | null = null;

  async function morph(id: string | null, mutate: () => void): Promise<void> {
    // A second dock/undock completes the in-flight morph instantly first.
    inFlight?.finish();
    inFlight = null;

    const capture = id ? captureDockMorph(id) : null;
    mutate();              // synchronous, instantly correct (state-first)
    await nextTick();      // let Vue swap source out / destination in
    inFlight = capture?.play() ?? null;
  }

  return {
    undock: (id: string): Promise<void> => morph(id, () => panel.undock(id)),
    // Read biggerViewId BEFORE mutating — that's the card being docked.
    dock: (): Promise<void> => morph(panel.biggerViewId, () => panel.closeBiggerView())
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/composables/useDockMorph.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/composables/useDockMorph.ts src/frontend/src/composables/useDockMorph.spec.ts
git commit -m "feat(motion): thread person id into the dock morph capture"
```

---

## Task 3: `PersonPopup.vue` — floating chevron control (TDD)

**Files:**
- Modify: `src/frontend/src/components/PersonPopup.vue` (replace the `.popup__dock-tab` button in the template; replace its style rules)
- Modify test: `src/frontend/src/components/PersonPopup.spec.ts`

The `<script setup>` stays as-is (`onDock` already calls `dockMorph.dock()`); the dialog `<section>` with `data-flip-id` and `data-test="dialog"`, the `✕` close, and `.popup__shell` all stay. Only the dock control element and its styles change.

- [ ] **Step 1: Update the spec**

In `src/frontend/src/components/PersonPopup.spec.ts`, change the control-class assertion. Replace the existing test that asserts `.popup__dock-tab` (the one titled like "renders a right-edge dock tab") with:

```ts
it('renders the floating chevron dock control', () => {
  const panel = usePanelStore();
  panel.openPerson('p1'); panel.openBiggerView('p1');
  const w = /* existing mount harness in this file */;
  const ctl = w.get('[data-test="popup-dock"]');
  expect(ctl.classes()).toContain('popup__dock-chevron');
  expect(ctl.find('.popup__dock-body').exists()).toBe(true);
});
```

Leave the other PersonPopup tests (dialog `data-flip-id`, dock-tab/scrim route through the morph and clear `biggerViewId`, `✕` closes) unchanged — they key off `data-test="popup-dock"` / `data-test="scrim"` / `data-test="close"`, which are preserved.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/PersonPopup.spec.ts`
Expected: FAIL — control class is still `popup__dock-tab`, no `.popup__dock-body`.

- [ ] **Step 3: Replace the control in the template**

In `src/frontend/src/components/PersonPopup.vue`, replace the existing dock-tab button (the `<button ... class="popup__dock-tab" ...><span class="popup__dock-arrow">→</span></button>`) with:

```html
      <button
        type="button"
        class="popup__dock-chevron"
        data-test="popup-dock"
        :aria-label="t('panel.dock')"
        :title="t('panel.dock')"
        @click="onDock"
      >
        <span class="popup__dock-body" aria-hidden="true"></span>
        <svg class="popup__dock-chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
```

- [ ] **Step 4: Replace the control's styles**

In the `<style scoped>` block, delete the `.popup__dock-tab`, `.popup__dock-arrow`, and `.popup__dock-tab:hover .popup__dock-arrow` rules, and add:

```scss
// Floating dock control: a chevron resting just off the dialog's right edge that
// grows a rounded-square glass body on hover/focus and ticks toward the rail.
.popup__dock-chevron {
  position: absolute; top: 50%; right: -30px; transform: translateY(-50%);
  width: 32px; height: 32px; padding: 0; border: none; background: transparent; cursor: pointer; z-index: 1;
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 3px; border-radius: 9px; }
}
.popup__dock-body {
  position: absolute; inset: 0; border-radius: 9px;
  background: var(--glass-bg); border: 1px solid var(--glass-border); backdrop-filter: blur(12px);
  transform: scale(0.4); opacity: 0;
  transition: transform 200ms cubic-bezier(0.2, 0.7, 0.3, 1), opacity 150ms ease;
  @supports not ((backdrop-filter: blur(12px)) or (-webkit-backdrop-filter: blur(12px))) { background: var(--parchment-2); }
}
.popup__dock-chevron:hover .popup__dock-body,
.popup__dock-chevron:focus-visible .popup__dock-body { transform: scale(1); opacity: 1; }
.popup__dock-chev {
  position: absolute; top: 50%; left: 50%; width: 16px; height: 16px;
  transform: translate(-50%, -50%); color: var(--ink-soft); transition: color 200ms ease;
}
.popup__dock-chevron:hover .popup__dock-chev,
.popup__dock-chevron:focus-visible .popup__dock-chev { color: var(--ink); animation: popup-dock-tick 480ms both; }
@keyframes popup-dock-tick {
  0%   { transform: translate(-50%, -50%); animation-timing-function: cubic-bezier(0.2, 0.7, 0.25, 1); }
  42%  { transform: translate(calc(-50% + 7px), -50%); animation-timing-function: linear; }
  60%  { transform: translate(calc(-50% + 7px), -50%); animation-timing-function: cubic-bezier(0.45, 0, 0.4, 1); }
  100% { transform: translate(-50%, -50%); }
}
@media (prefers-reduced-motion: reduce) {
  .popup__dock-body { transition: none; }
  .popup__dock-chevron:hover .popup__dock-chev,
  .popup__dock-chevron:focus-visible .popup__dock-chev { animation: none; }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/components/PersonPopup.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/PersonPopup.vue src/frontend/src/components/PersonPopup.spec.ts
git commit -m "feat(popup): floating chevron dock control (replaces the gilt tab)"
```

---

## Task 4: Full suite + type-check + live verification + docs + update PR

**Files:**
- Modify: `docs/reference/features/person-details.md`

- [ ] **Step 1: Whole suite + build**

Run (from `src/frontend`): `npm test` then `npm run build`.
Expected: all specs pass; `vue-tsc` reports no type errors. Fix any fallout (e.g. a leftover import of the removed `DOCK_FLIP_SELECTOR`).

- [ ] **Step 2: Live-verify the control + morph (custom ports, with the owner)**

Ensure the dev server runs on **5210** (proxy `/api` → the API on 5037). Use the preview tooling. Confirm:
- The dock control is a chevron floating just off the dialog's right edge; hover/focus grows the rounded-square glass body and the chevron ticks ~7px right then settles center.
- Click (and scrim/Esc) docks; the popup **shrinks into** its rail slot; `⤢` undocks and the dialog **grows out of** the slot; neighbour panels glide.
- `✕` still closes instantly. Note: the headless preview starves rAF, so the moving frames are confirmed by the owner; check `preview_console_logs` for errors and use the store/DOM probes for wiring.

- [ ] **Step 3: Tune if needed**

Adjust only presentation values — chevron `right` offset, body radius/scale, tick amplitude/timing in `PersonPopup.vue`, or `MORPH_START_OPACITY` / token usage in `popupDock.ts`. Re-run Step 1 and re-commit if changed.

- [ ] **Step 4: Sync the QA reference (update-docs-for-pr)**

In [docs/reference/features/person-details.md](../../../docs/reference/features/person-details.md), update the dock section: the popup's dock control is now a **floating chevron** that grows a rounded-square glass body on hover (no more gilt tab/`⤡`); the dock/undock **morph is a deterministic grow-into/out-of-slot FLIP** (GSAP core, not the Flip plugin) with neighbour reflow, instant under reduced motion. Verify links resolve.

- [ ] **Step 5: Commit docs**

```bash
git add docs/reference/features/person-details.md
git commit -m "Docs: floating chevron dock control + FLIP morph"
```

- [ ] **Step 6: Push to update PR #80**

```bash
git push
```

The branch already tracks `origin/feat/popup-dock-morph`, so this updates PR #80. **Do not merge** — the owner reviews. After the owner's live sign-off and merge, clean up the worktree.

---

## Self-review (author)

- **Spec coverage:** floating chevron + no body at rest ✓ (Task 3); rounded-square glass body scale/fade on hover ✓; bold ~7px/~480ms tick with hold ✓ (`popup-dock-tick`); chevron centered + returns to center ✓; a11y (button, aria-label, focus ring) ✓; reduced-motion instant ✓ (CSS media query + `captureDockMorph` null). Deterministic FLIP replacing Flip ✓ (Task 1); grow-out (undock) / shrink-in (dock) via the surviving element ✓; neighbour reflow ✓; `morph` token + reduced-motion + re-entrancy `finish()` ✓; pure `flipInvert` unit-tested ✓. Id threading (dock reads `biggerViewId` pre-mutate) ✓ (Task 2). Delivery on PR #80 ✓ (Task 4).
- **No new gsap-in-components:** only `motion/popupDock.ts` imports gsap; the `gsap/Flip` import is removed. ✓
- **Type consistency:** `Rect`, `FlipInvert`, `DockMorph { finish(): void }`, `DockMorphCapture { play(): DockMorph | null }`, `captureDockMorph(id: string): DockMorphCapture | null`, `flipInvert(source: Rect, dest: Rect): FlipInvert`; composable `morph(id: string | null, mutate)`; control class `popup__dock-chevron` + `popup__dock-body` + `popup__dock-chev`. Consistent across tasks. ✓
- **Placeholder scan:** the only `/* … */` is the PersonPopup spec's "existing mount harness in this file" — intentional, since the harness already exists in that spec from the prior task and must be reused verbatim, not re-invented.
