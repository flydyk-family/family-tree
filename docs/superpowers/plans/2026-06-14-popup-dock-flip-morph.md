# Popup ↔ Dock Flip Morph Implementation Plan (PR 4a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user docks the bigger-view popup back into the rail (⤡ / scrim / Esc) or undocks a rail panel into the popup (⤢), the glass card performs a GSAP **Flip shared-element morph** — it grows out of, or shrinks into, its rail slot/chip while neighbours reflow — instead of appearing/disappearing instantly.

**Architecture:** A new motion seam `motion/popupDock.ts` registers GSAP's **Flip** plugin (the first use of it in the app) and exposes a *capture → play* pair. The popup dialog and each person's rail panel/chip carry the **same `data-flip-id`** so Flip treats them as one shared element across a swap. A thin composable `composables/useDockMorph.ts` runs the **state-first** sequence: complete any in-flight morph, snapshot card bounds, apply the synchronous Pinia store mutation, `await nextTick()`, then fly the destination card from the source's captured bounds. Components call the composable instead of the store directly; the store stays synchronous and instantly correct. This is the popup↔**dock** half of spec §6 only — the layout-switch glide is PR 4b.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Pinia, GSAP 3.13 **Flip** plugin (`gsap/Flip`), Vitest + @vue/test-utils. Motion tokens already define `morph` (450 ms `power2.inOut`) at [tokens.ts:16](../../../src/frontend/src/motion/tokens.ts).

---

## Background the implementer needs

Read these before starting — the plan assumes you understand them.

- **Only one popup exists at a time and it is desktop-only.** The popup mounts at the `TreeView` root via `v-if="panel.biggerViewId"` ([TreeView.vue:198](../../../src/frontend/src/views/TreeView.vue)). On desktop the rail renders each person as a `DockPanel` *unless* that person is the one popped out — `visiblePanels` filters out `biggerViewId` ([PanelRail.vue:44-45](../../../src/frontend/src/components/PanelRail.vue)). So the popup dialog and that person's rail panel **are never in the DOM at the same time**; one replaces the other. That is exactly the situation GSAP Flip's *swap by shared `data-flip-id`* feature is built for.
- **The two morph triggers** (and the only ones in scope):
  - **Undock (rail → popup):** the `⤢` button on a `DockPanel`, wired in PanelRail as `@bigger="panel.undock(p.id)"` ([PanelRail.vue:87](../../../src/frontend/src/components/PanelRail.vue)). `undock(id)` expands the person then sets `biggerViewId` ([panelStore.ts:93-96](../../../src/frontend/src/stores/panelStore.ts)).
  - **Dock (popup → rail):** a new **dock tab on the dialog's right edge** (replacing the cryptic corner `⤡`), plus the scrim click and Esc, all call `onDock()` → `panel.closeBiggerView()` ([PersonPopup.vue:12-14](../../../src/frontend/src/components/PersonPopup.vue)), which nulls `biggerViewId` ([panelStore.ts:88-89](../../../src/frontend/src/stores/panelStore.ts)). The rail always sits top-right (`PanelRail` is `position:absolute; right:12px`, regardless of orientation), so a right-pointing tab on the dialog's right edge always points toward the dock target and shows the direction the card will fly. The tab keeps `data-test="popup-dock"`.
- **Out of scope for 4a:** the destructive `✕` close (`closePerson` removes the person from the rail entirely → there is no morph target, so it stays instant); opening the popup from a tree-node click (that is the popup-open *cascade* in PR 3); the layout-switch glide (PR 4b). Mobile never opens the popup (`onSelect` guards on `!isMobile`, and `:biggerable="!isMobile"`), so the morph is effectively desktop-only — we still tag chips with `data-flip-id` so a chip is a valid target if that ever changes.
- **GSAP Flip swap semantics** (the crux): `Flip.getState(selector)` records the bounds of every matched element keyed by its `data-flip-id`. You then mutate the DOM (one element with a given id disappears, another with the **same** id appears). `Flip.from(state, …)` matches the new element to the recorded bounds **by `data-flip-id`** and animates it from there; with `fade: true` it cross-fades the swapped pair; elements present in *both* states (the neighbour panels) animate from their old to new positions — that is the "neighbours reflow via the same capture" requirement, for free.
- **State-first rule (project invariant):** store actions must stay synchronous and instantly correct; motion is layered on top and must never gate state. So we *mutate first, animate after* — capture bounds, call the store, wait one tick for Vue to patch, then play.
- **Reduced motion:** [`prefersReducedMotion()`](../../../src/frontend/src/motion/reducedMotion.ts) is the single gate. When true, skip Flip entirely — just mutate and let the DOM snap.
- **Components must never `import gsap`.** All GSAP/Flip usage lives in `motion/popupDock.ts`. This is enforced by the spec (§2) and by code review.
- **Test mocking pattern** to copy: [entrance.spec.ts:8-33](../../../src/frontend/src/motion/entrance.spec.ts) shows the `vi.hoisted` + `vi.mock('gsap', …)` + `stubMatchMedia` patterns; [useEntranceCeremony.spec.ts](../../../src/frontend/src/motion/useEntranceCeremony.spec.ts) shows mocking a sibling motion module and an in-memory storage.
- **Custom ports for live runs** (another session usually owns the defaults): frontend **5210**, API **127.0.0.1:5247** — never the defaults 5173/5037.

---

## File structure

| File | Created/Modified | Responsibility |
| --- | --- | --- |
| `src/frontend/src/motion/popupDock.ts` | **Create** | Register Flip; `captureDockMorph()` → snapshot + `play()`/`finish()`. The only place `gsap/Flip` is imported. |
| `src/frontend/src/motion/popupDock.spec.ts` | **Create** | Unit tests for the capture/play/reduced-motion contract (GSAP + Flip mocked). |
| `src/frontend/src/composables/useDockMorph.ts` | **Create** | `useDockMorph()` → `{ dock, undock }`; runs finish→capture→mutate→nextTick→play. |
| `src/frontend/src/composables/useDockMorph.spec.ts` | **Create** | Unit tests for sequence order, re-entrancy, reduced-motion fallthrough. |
| `src/frontend/src/components/DockPanel.vue` | Modify | New `flipId?` prop; bind `data-flip-id` on the chip and the section. |
| `src/frontend/src/components/PanelRail.vue` | Modify | Pass `:flip-id` per person; route `@bigger` through `useDockMorph().undock`. |
| `src/frontend/src/components/PersonPopup.vue` | Modify | Replace corner `⤡` with a right-edge **dock tab** (`.popup__shell` wrapper + `.popup__dock-tab`); `data-flip-id` on the dialog; route dock (tab/scrim/Esc) through `useDockMorph().dock`. |
| `docs/reference/features/person-details.md` | Modify (Task 8) | Document the dock/undock morph behaviour. |

---

## Task 1: Workspace + commit the plan

**Files:**
- Create: `docs/superpowers/plans/2026-06-14-popup-dock-flip-morph.md` (this file — already written)

- [ ] **Step 1: Create the worktree + branch off `main`**

Use the `superpowers:using-git-worktrees` skill. Branch name: `feat/popup-dock-morph`, based on `main`. All subsequent work happens in that worktree.

- [ ] **Step 2: Commit the plan document**

```bash
git add docs/superpowers/plans/2026-06-14-popup-dock-flip-morph.md
git commit -m "Plan: popup↔dock Flip morph (PR 4a)"
```

---

## Task 2: `motion/popupDock.ts` — the Flip seam (TDD)

**Files:**
- Create: `src/frontend/src/motion/popupDock.ts`
- Test: `src/frontend/src/motion/popupDock.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/motion/popupDock.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock gsap (default export) and gsap/Flip. The module registers Flip on import,
// so gsap.registerPlugin must exist. Flip.from returns a timeline-like object
// whose progress() is chainable (matches GSAP's API: progress() returns the tl).
const mocks = vi.hoisted(() => {
  const timeline = { progress: vi.fn(() => timeline), kill: vi.fn() };
  return {
    timeline,
    registerPlugin: vi.fn(),
    getState: vi.fn(() => ({ snapshot: true })),
    from: vi.fn(() => timeline)
  };
});

vi.mock('gsap', () => ({ default: { registerPlugin: mocks.registerPlugin } }));
vi.mock('gsap/Flip', () => ({ Flip: { getState: mocks.getState, from: mocks.from } }));

import { captureDockMorph, DOCK_FLIP_SELECTOR } from './popupDock';
import { motionTokens } from './tokens';

function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && reduced,
    media,
    addEventListener() {},
    removeEventListener() {}
  }));
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('captureDockMorph', () => {
  it('registers the Flip plugin on import', () => {
    expect(mocks.registerPlugin).toHaveBeenCalled();
  });

  it('returns null and snapshots nothing under reduced motion', () => {
    stubMatchMedia(true);
    expect(captureDockMorph()).toBeNull();
    expect(mocks.getState).not.toHaveBeenCalled();
  });

  it('snapshots the dock cards (with borderRadius) when motion is allowed', () => {
    stubMatchMedia(false);
    const capture = captureDockMorph();
    expect(capture).not.toBeNull();
    expect(mocks.getState).toHaveBeenCalledWith(DOCK_FLIP_SELECTOR, { props: 'borderRadius' });
  });

  it('play() flies from the snapshot using the morph token and returns a finishable handle', () => {
    stubMatchMedia(false);
    const morph = captureDockMorph()!.play();
    expect(mocks.from).toHaveBeenCalledTimes(1);
    const [state, vars] = mocks.from.mock.calls[0];
    expect(state).toEqual({ snapshot: true });
    expect(vars).toMatchObject({
      duration: motionTokens.morph.duration,
      ease: motionTokens.morph.ease,
      absolute: true,
      fade: true,
      props: 'borderRadius'
    });
    morph!.finish();
    expect(mocks.timeline.progress).toHaveBeenCalledWith(1);
    expect(mocks.timeline.kill).toHaveBeenCalled();
  });

  it('play() returns null when Flip has nothing to animate', () => {
    stubMatchMedia(false);
    mocks.from.mockReturnValueOnce(null);
    expect(captureDockMorph()!.play()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `src/frontend`): `npm test -- src/motion/popupDock.spec.ts`
Expected: FAIL — `Cannot find module './popupDock'`.

- [ ] **Step 3: Write the implementation**

Create `src/frontend/src/motion/popupDock.ts`:

```ts
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { motionTokens } from './tokens';
import { prefersReducedMotion } from './reducedMotion';

// Register Flip once, here — the single place the app touches gsap/Flip.
gsap.registerPlugin(Flip);

// Every card that can morph (the popup dialog + each person's rail panel/chip)
// carries a data-flip-id; the stats panel deliberately has none, so it is left
// out of the capture and never animates.
export const DOCK_FLIP_SELECTOR = '[data-flip-id]';

export interface DockMorph {
  // Jump to the end state immediately (used when a new morph starts mid-flight).
  finish(): void;
}

export interface DockMorphCapture {
  // Call AFTER the DOM has been mutated and patched (await nextTick): flies the
  // destination card from the source's captured bounds. Null if Flip found
  // nothing to animate.
  play(): DockMorph | null;
}

// Snapshot the current rail/popup card layout. Returns a committer, or null
// under reduced motion (the caller should just mutate state and let it snap).
export function captureDockMorph(): DockMorphCapture | null {
  if (prefersReducedMotion()) {
    return null;
  }
  const state = Flip.getState(DOCK_FLIP_SELECTOR, { props: 'borderRadius' });
  return {
    play(): DockMorph | null {
      const tl = Flip.from(state, {
        duration: motionTokens.morph.duration,
        ease: motionTokens.morph.ease,
        absolute: true,   // float the morphing cards so neighbours reflow cleanly
        fade: true,       // cross-fade the swapped (different-content) source/target
        props: 'borderRadius',
        overwrite: 'auto'
      });
      if (!tl) {
        return null;
      }
      return {
        finish(): void {
          tl.progress(1);
          tl.kill();
        }
      };
    }
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/motion/popupDock.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/motion/popupDock.ts src/frontend/src/motion/popupDock.spec.ts
git commit -m "feat(motion): Flip dock-morph capture/play seam"
```

---

## Task 3: `composables/useDockMorph.ts` — state-first orchestration (TDD)

**Files:**
- Create: `src/frontend/src/composables/useDockMorph.ts`
- Test: `src/frontend/src/composables/useDockMorph.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/composables/useDockMorph.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

// Mock the motion seam so we assert orchestration, not GSAP.
const mocks = vi.hoisted(() => {
  const finish = vi.fn();
  const play = vi.fn(() => ({ finish }));
  const capture = { play };
  return { finish, play, capture, captureDockMorph: vi.fn(() => capture) };
});
vi.mock('../motion/popupDock', () => ({ captureDockMorph: mocks.captureDockMorph }));

import { useDockMorph } from './useDockMorph';
import { usePanelStore } from '../stores/panelStore';

beforeEach(() => {
  setActivePinia(createPinia());
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('useDockMorph', () => {
  it('undock: mutates the store synchronously, then plays after the DOM patch', async () => {
    const panel = usePanelStore();
    panel.openPerson('p1');
    const undockSpy = vi.spyOn(panel, 'undock');
    const { undock } = useDockMorph();

    const done = undock('p1');
    // State-first: the mutation is already applied before any await.
    expect(undockSpy).toHaveBeenCalledWith('p1');
    expect(panel.biggerViewId).toBe('p1');
    // Capture happened before the mutation; play has NOT run yet (waits a tick).
    expect(mocks.captureDockMorph).toHaveBeenCalledTimes(1);
    expect(mocks.play).not.toHaveBeenCalled();

    await done;
    expect(mocks.play).toHaveBeenCalledTimes(1);
  });

  it('dock: routes through closeBiggerView and plays', async () => {
    const panel = usePanelStore();
    panel.openPerson('p1');
    panel.openBiggerView('p1');
    const closeSpy = vi.spyOn(panel, 'closeBiggerView');
    const { dock } = useDockMorph();

    await dock();
    expect(closeSpy).toHaveBeenCalledTimes(1);
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
    // The first morph's handle was finished before the second captured.
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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/composables/useDockMorph.spec.ts`
Expected: FAIL — `Cannot find module './useDockMorph'`.

- [ ] **Step 3: Write the implementation**

Create `src/frontend/src/composables/useDockMorph.ts`:

```ts
import { nextTick } from 'vue';
import { usePanelStore } from '../stores/panelStore';
import { captureDockMorph, type DockMorph } from '../motion/popupDock';

// Wraps the synchronous dock/undock store actions in a Flip shared-element
// morph. State-first: capture bounds, mutate the store, wait for Vue to patch
// the DOM, then fly the destination card from the source's bounds.
export function useDockMorph() {
  const panel = usePanelStore();
  let inFlight: DockMorph | null = null;

  async function morph(mutate: () => void): Promise<void> {
    // A second dock/undock completes the in-flight morph instantly first.
    inFlight?.finish();
    inFlight = null;

    const capture = captureDockMorph();
    mutate();              // synchronous, instantly correct (state-first)
    await nextTick();      // let Vue swap source out / destination in
    inFlight = capture?.play() ?? null;
  }

  return {
    undock: (id: string): Promise<void> => morph(() => panel.undock(id)),
    dock: (): Promise<void> => morph(() => panel.closeBiggerView())
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/composables/useDockMorph.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/composables/useDockMorph.ts src/frontend/src/composables/useDockMorph.spec.ts
git commit -m "feat(motion): useDockMorph state-first orchestration"
```

---

## Task 4: `DockPanel.vue` — carry the shared `data-flip-id`

**Files:**
- Modify: `src/frontend/src/components/DockPanel.vue` (props block lines 7-15; chip element line 33; section element line 39)
- Test: `src/frontend/src/components/DockPanel.spec.ts` (create if absent; otherwise extend)

- [ ] **Step 1: Write the failing test**

Create or extend `src/frontend/src/components/DockPanel.spec.ts`. Add a `describe` for the flip id:

```ts
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import DockPanel from './DockPanel.vue';

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });

function mountPanel(props: Record<string, unknown>) {
  return mount(DockPanel, { props, global: { plugins: [i18n] } });
}

describe('DockPanel data-flip-id', () => {
  it('puts the flip id on the expanded section', () => {
    const w = mountPanel({ icon: '👤', title: 'Ann', state: 'expanded', flipId: 'dock-card-p1' });
    expect(w.get('.dock-panel').attributes('data-flip-id')).toBe('dock-card-p1');
  });

  it('puts the flip id on the chip', () => {
    const w = mountPanel({ icon: '👤', title: 'Ann', state: 'chip', flipId: 'dock-card-p1' });
    expect(w.get('.dock-chip').attributes('data-flip-id')).toBe('dock-card-p1');
  });

  it('omits the attribute entirely when no flip id is given (e.g. the stats panel)', () => {
    const w = mountPanel({ icon: '📊', title: 'Stats', state: 'expanded' });
    expect(w.get('.dock-panel').attributes('data-flip-id')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/DockPanel.spec.ts`
Expected: FAIL — `data-flip-id` is undefined on the section/chip.

- [ ] **Step 3: Add the prop and bind it**

In `src/frontend/src/components/DockPanel.vue`, add `flipId?` to the props (it has no default, so an unset value yields `undefined` → Vue omits the attribute):

```ts
const props = withDefaults(defineProps<{
  icon: string;
  title: string;
  state: PanelState;
  chipGlyph?: string;
  closable?: boolean;
  biggerable?: boolean;
  pinned?: boolean;
  flipId?: string;
}>(), { closable: true, biggerable: false, pinned: false, chipGlyph: '' });
```

Bind it on the chip element (currently line 33):

```html
  <div v-if="state === 'chip'" class="dock-chip" :class="{ 'dock-chip--pinned': pinned }" data-test="panel-chip"
       :data-flip-id="flipId"
       role="button" tabindex="0" :aria-label="title" @click="emit('chipTap')" @keydown.enter="emit('chipTap')">
```

And on the section element (currently line 39):

```html
  <section v-else v-bind="attrs" class="dock-panel" :class="{ 'dock-panel--min': state === 'minimized', 'dock-panel--exp': state === 'expanded' }"
           :data-flip-id="flipId"
           role="region" :aria-label="title">
```

> Note: `inheritAttrs: false` + `v-bind="attrs"` is already set on the section. `flipId` is a declared prop, not a fall-through attr, so it is applied explicitly here and is unaffected by that.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/DockPanel.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/DockPanel.vue src/frontend/src/components/DockPanel.spec.ts
git commit -m "feat(rail): DockPanel carries a data-flip-id for the dock morph"
```

---

## Task 5: `PanelRail.vue` — feed flip ids + route undock through the morph

**Files:**
- Modify: `src/frontend/src/components/PanelRail.vue` (script setup; `DockPanel` usage lines 76-91)
- Test: `src/frontend/src/components/PanelRail.spec.ts` (extend if present; otherwise create)

- [ ] **Step 1: Write the failing test**

Add to `src/frontend/src/components/PanelRail.spec.ts` (create the file with the standard pinia+i18n mount harness if it does not exist — mirror an existing component spec for the boilerplate). The key assertions:

```ts
// ...standard harness: setActivePinia(createPinia()); mount PanelRail with
// props { people: [{ id: 'p1', givenName: {...}, surname: {...} }, ...] } and
// the i18n + router stubs the component needs. Force desktop so panels (not
// chips) render: stub matchMedia so MOBILE_MEDIA_QUERY is false.

it('gives each person panel a stable data-flip-id', async () => {
  const panel = usePanelStore();
  panel.openPerson('p1');
  const w = /* mount PanelRail */;
  await nextTick();
  expect(w.get('[data-test="panel-title"]').element).toBeTruthy();
  expect(w.find('.dock-panel').attributes('data-flip-id')).toBe('dock-card-p1');
});

it('the ⤢ bigger button routes through the dock morph (still ends with the popup open)', async () => {
  const panel = usePanelStore();
  panel.openPerson('p1');
  const w = /* mount PanelRail (desktop) */;
  await nextTick();
  await w.get('[data-test="panel-bigger"]').trigger('click');
  await nextTick();
  expect(panel.biggerViewId).toBe('p1');  // undock() ran via the morph wrapper
});
```

> The morph wrapper calls the real `captureDockMorph`. In jsdom `matchMedia` is absent → `prefersReducedMotion()` is `false`, so Flip runs against zero-size rects and resolves to a no-op; the **store state** (what we assert) is unaffected. If Flip proves noisy in jsdom, mock `../composables/useDockMorph` to a pass-through that calls the store directly — but prefer the real path so the wiring is covered.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/PanelRail.spec.ts`
Expected: FAIL — `data-flip-id` missing (and/or the bigger button not yet wired to the morph).

- [ ] **Step 3: Wire the composable + flip ids**

In `src/frontend/src/components/PanelRail.vue` script setup, import and instantiate the composable (add near the other store/composable setup, after line 20):

```ts
import { useDockMorph } from '../composables/useDockMorph';
// ...
const dockMorph = useDockMorph();
```

Update the `DockPanel` usage (lines 76-91) to pass the flip id and route `@bigger` through the morph:

```html
      <DockPanel
        v-for="p in visiblePanels"
        :key="p.id"
        icon="👤"
        :flip-id="`dock-card-${p.id}`"
        :title="panelNames.get(p.id)?.name ?? p.id"
        :chip-glyph="panelNames.get(p.id)?.initial ?? ''"
        :state="personState(p.minimized)"
        :biggerable="!isMobile"
        @expand="panel.expandPerson(p.id)"
        @minimize="panel.minimizePerson(p.id)"
        @close="panel.closePerson(p.id)"
        @bigger="dockMorph.undock(p.id)"
        @chip-tap="panel.openPerson(p.id)"
      >
        <PersonDetail v-if="expandedId === p.id" />
      </DockPanel>
```

> Leave `StatsPanel` untouched — it renders through its own `DockPanel` without a `flipId`, so it is excluded from the capture (it does not morph and does not reflow with the person stack).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/PanelRail.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PanelRail.vue src/frontend/src/components/PanelRail.spec.ts
git commit -m "feat(rail): route undock (⤢) through the Flip dock morph"
```

---

## Task 6: `PersonPopup.vue` — right-edge dock tab + flip id + route dock through the morph

This task does three things: (a) replace the cryptic corner `⤡` with a **dock tab on the dialog's right edge** (a gilt, right-pointing tab styled like a rail card, pointing at the rail so the dock direction is obvious); (b) tag the dialog with `data-flip-id`; (c) route docking through `useDockMorph().dock`. A small template restructure adds a `.popup__shell` wrapper around the dialog so the tab can protrude past the dialog's `overflow-y:auto` without being clipped. The morph still targets `.popup__dialog`.

**Files:**
- Modify: `src/frontend/src/components/PersonPopup.vue` (whole `<script setup>`, `<template>`, and `<style>`)
- Test: `src/frontend/src/components/PersonPopup.spec.ts` (extend if present; otherwise create)

- [ ] **Step 1: Write the failing test**

Add to `src/frontend/src/components/PersonPopup.spec.ts` (create with the standard pinia + i18n mount harness if absent; stub `PersonDetail` so its own deps don't load):

```ts
// Harness: setActivePinia(createPinia()); a panel store with a person open +
// popped: panel.openPerson('p1'); panel.openBiggerView('p1'); mount PersonPopup
// with the global i18n plugin and PersonDetail stubbed.

it('tags the dialog with the matching data-flip-id', () => {
  const panel = usePanelStore();
  panel.openPerson('p1'); panel.openBiggerView('p1');
  const w = /* mount PersonPopup */;
  expect(w.get('[data-test="dialog"]').attributes('data-flip-id')).toBe('dock-card-p1');
});

it('renders a right-edge dock tab (not a corner ⤡ button)', () => {
  const panel = usePanelStore();
  panel.openPerson('p1'); panel.openBiggerView('p1');
  const w = /* mount PersonPopup */;
  expect(w.get('[data-test="popup-dock"]').classes()).toContain('popup__dock-tab');
});

it('the dock tab routes through the morph and closes the bigger view', async () => {
  const panel = usePanelStore();
  panel.openPerson('p1'); panel.openBiggerView('p1');
  const w = /* mount PersonPopup */;
  await w.get('[data-test="popup-dock"]').trigger('click');
  await nextTick();
  expect(panel.biggerViewId).toBeNull();
});

it('the scrim click also docks', async () => {
  const panel = usePanelStore();
  panel.openPerson('p1'); panel.openBiggerView('p1');
  const w = /* mount PersonPopup */;
  await w.get('[data-test="scrim"]').trigger('click');
  await nextTick();
  expect(panel.biggerViewId).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/components/PersonPopup.spec.ts`
Expected: FAIL — `data-flip-id` missing on the dialog / no `.popup__dock-tab`.

- [ ] **Step 3: Rewrite the component**

Replace the `<script setup>`, `<template>`, and the relevant `<style>` rules in `src/frontend/src/components/PersonPopup.vue`.

Script:

```ts
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePanelStore } from '../stores/panelStore';
import { useDockMorph } from '../composables/useDockMorph';
import PersonDetail from './PersonDetail.vue';

const { t } = useI18n({ useScope: 'global' });
const panel = usePanelStore();
const dockMorph = useDockMorph();
const dialogRef = ref<HTMLElement | null>(null);

// Dock: return the person to the rail (non-destructive default), morphing the
// glass card into its rail slot. The dock tab, the scrim, and Esc all use this.
function onDock(): void {
  void dockMorph.dock();
}

// Close entirely: remove the person from the rail too (no morph target).
function onClose(): void {
  if (panel.biggerViewId !== null) {
    panel.closePerson(panel.biggerViewId);
  }
}

onMounted(() => dialogRef.value?.focus());
```

Template — note the new `.popup__shell` wrapper, the dialog's `data-flip-id`, the removed corner `⤡`, and the new right-edge tab. A native `<button>` handles Enter/Space, so no extra keydown is needed on the tab:

```html
<template>
  <div class="popup" data-test="person-popup">
    <div class="popup__scrim" data-test="scrim" @click="onDock" />
    <div class="popup__shell">
      <section
        ref="dialogRef"
        class="popup__dialog"
        data-test="dialog"
        :data-flip-id="`dock-card-${panel.biggerViewId}`"
        role="dialog"
        aria-modal="true"
        :aria-label="t('panel.biggerView')"
        tabindex="-1"
        @keydown.esc.prevent="onDock"
      >
        <button type="button" class="popup__btn popup__close" data-test="close" :aria-label="t('person.close')" @click="onClose">✕</button>
        <PersonDetail />
      </section>
      <button
        type="button"
        class="popup__dock-tab"
        data-test="popup-dock"
        :aria-label="t('panel.dock')"
        :title="t('panel.dock')"
        @click="onDock"
      ><span class="popup__dock-arrow" aria-hidden="true">→</span></button>
    </div>
  </div>
</template>
```

Style — replace the existing `.popup*` block. Keep the glass dialog look; add the shell + tab; drop `.popup__dock` (the old corner button):

```scss
<style scoped lang="scss">
.popup { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; }
.popup__scrim { position: absolute; inset: 0; background: var(--scrim); }
.popup__shell { position: relative; z-index: 1; }
.popup__dialog {
  position: relative; width: min(560px, calc(100vw - 32px)); max-height: min(82vh, 720px);
  overflow-y: auto; padding: 22px 24px; background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: 14px; box-shadow: var(--glass-shadow); backdrop-filter: blur(12px); color: var(--ink);
  @supports not ((backdrop-filter: blur(12px)) or (-webkit-backdrop-filter: blur(12px))) { background: var(--parchment-2); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
.popup__btn { position: absolute; top: 10px; width: 28px; height: 28px; border: none; border-radius: 50%; background: transparent; color: var(--ink-soft); font-size: 20px; cursor: pointer; z-index: 2; &:hover { background: rgba(95, 82, 64, 0.12); } &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; } }
.popup__close { right: 12px; }

// Dock tab on the right edge: gilt parchment (echoes a rail card, signalling
// the destination); the arrow points at the rail and nudges right on hover.
.popup__dock-tab {
  position: absolute; top: 50%; right: -22px; transform: translateY(-50%);
  width: 24px; height: 78px; display: grid; place-items: center; z-index: 1;
  border: 1px solid var(--gilt); border-left: none; border-radius: 0 12px 12px 0;
  background: linear-gradient(#f8f2df, #f1e7cb); color: var(--ink-soft);
  font-size: 18px; cursor: pointer;
  transition: background var(--motion-feedback-ms) ease;
  &:hover { border-color: var(--gilt-deep); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
.popup__dock-arrow { display: block; transition: transform var(--motion-feedback-ms) ease; }
.popup__dock-tab:hover .popup__dock-arrow { transform: translateX(3px); }
</style>
```

> `onClose` (the ✕) is intentionally left calling `panel.closePerson` directly — it is destructive (the rail panel disappears too), so there is no shared element to morph into; it stays instant. The dock tab reuses the existing i18n key `panel.dock` (no new strings). If `panel.dock`'s wording reads oddly as a tab label, refine the *value* in the locale files (ru/be/en) but keep the key — that is a one-line polish, not a new key.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/PersonPopup.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonPopup.vue src/frontend/src/components/PersonPopup.spec.ts
git commit -m "feat(popup): right-edge dock tab; route dock through the Flip morph"
```

---

## Task 7: Full suite + type-check + live verification

**Files:** none (verification + tuning only)

- [ ] **Step 1: Run the whole frontend suite + type-check**

Run (from `src/frontend`):
```bash
npm test
npm run build
```
Expected: all specs pass; `vue-tsc` reports no type errors. Fix any spec that asserted the *old* direct-store binding (e.g. an existing PanelRail/PersonPopup test that spied a handler) — the store action still runs, just through the morph wrapper, so assert on store **state** after `await nextTick()`.

- [ ] **Step 2: Start the app on custom ports**

Use the `run-app` skill / preview tooling. Frontend **5210**, API **127.0.0.1:5247** (never 5173/5037). Start the API, then the dev server, then `preview_start` against `http://localhost:5210`.

- [ ] **Step 3: Verify the undock morph (rail → popup)**

On a wide viewport: open a person so a rail panel shows, click its `⤢` (`[data-test="panel-bigger"]`). The glass popup should **grow out of** the rail panel's slot (bounds + border-radius morph, content fading in), and the remaining rail panels should close the gap. Use `preview_screenshot` mid-flight if needed; check `preview_console_logs` for Flip warnings. Headless preview starves rAF — force a paint (e.g. `preview_eval` a `requestAnimationFrame`/reflow) before judging, per the live-preview notes.

- [ ] **Step 4: Verify the dock tab + dock morph (popup → rail)**

With the popup open, confirm the **dock tab** sits on the dialog's right edge with the arrow pointing toward the rail (gilt, hover nudges the arrow right). Then dock via the tab (`[data-test="popup-dock"]`), the scrim (`[data-test="scrim"]`), and Esc — each should **shrink the popup into** the returning rail slot while neighbours reflow. Confirm the ✕ close (`[data-test="close"]`) still removes the person instantly (no morph, by design), and that the old corner `⤡` is gone.

- [ ] **Step 5: Verify re-entrancy + reduced motion**

Rapidly toggle ⤢/⤡: the in-flight morph should snap to its end before the next begins (no compounding/stuck cards). Then set the OS "reduce motion" preference (or stub it) and confirm dock/undock are instant with no Flip animation and the final state is correct.

- [ ] **Step 6: Tune if needed**

If the flight feels off, adjust *only* the `Flip.from` vars in `motion/popupDock.ts` (e.g. drop `absolute`, add `nested: true`, or widen `props`). Do not change the store or the orchestration. If you change anything, re-run Step 1 and re-commit.

- [ ] **Step 7: Commit any tuning**

```bash
git add -A
git commit -m "polish(motion): tune the dock morph feel"   # only if Step 6 changed code
```

---

## Task 8: Docs sync + PR

**Files:**
- Modify: `docs/reference/features/person-details.md`

- [ ] **Step 1: Sync the QA reference (update-docs-for-pr skill)**

Run the `update-docs-for-pr` skill. Two behaviour changes: (1) the popup's dock control is now a **right-edge dock tab** (arrow pointing at the rail) instead of the corner `⤡`; (2) docking (tab / scrim / Esc) and undocking (⤢) now animate as a shared-element Flip morph between the popup and the rail card (instant under reduced motion; ✕ close is still instant). Document both in [person-details.md](../../../docs/reference/features/person-details.md), keeping the behaviour-level, QA-oriented voice. Verify all file links resolve.

- [ ] **Step 2: Commit the docs onto the same branch**

```bash
git add docs/reference/features/person-details.md
git commit -m "Docs: dock/undock Flip morph in person-details reference"
```

- [ ] **Step 3: Push and open the PR (do NOT self-merge)**

```bash
git push -u origin feat/popup-dock-morph
gh pr create --base main --title "Popup ↔ dock shared-element morph" --body "<idea-level summary + mechanics; link the spec §6 and this plan>"
```

The `pr-doc-reminder` hook will prompt on `gh pr create` — the docs are already in this branch, so confirm and proceed. Then **stop**: the owner reviews and squash-merges. Delete the branch + worktree after merge.

---

## Self-review notes (author)

- **Spec §6 coverage (popup↔dock half):** instant store flip ✓ (state-first, store untouched); Flip captures source bounds + animates destination ✓ (Task 2); shrink-into / grow-out-of the rail slot ✓; border-radius morph ✓ (`props: 'borderRadius'`); content cross-fade ✓ (`fade: true`); chips-mode target ✓ (chip carries `data-flip-id`, Task 4); neighbour reflow via the same capture ✓ (selector captures all person cards, `absolute: true`); "second dock/undock completes the in-flight morph instantly first" ✓ (`inFlight?.finish()`, Task 3). The layout-switch half of §6 is **PR 4b** (out of scope here).
- **Owner refinement (folded in):** the corner `⤡` was unintuitive, so dock is now a right-edge **dock tab** that points at the rail and previews the morph direction (Task 6). This is an affordance change layered on the same `onDock` → morph path; it does not affect the Flip mechanics.
- **No new gsap imports in components** — only `motion/popupDock.ts` imports `gsap`/`gsap/Flip`. ✓
- **Reduced motion** gated in one place (`captureDockMorph` returns null) and re-asserted in tests. ✓
- **Type consistency:** `DockMorphCapture.play(): DockMorph | null`; `DockMorph.finish(): void`; `captureDockMorph(): DockMorphCapture | null`; `useDockMorph(): { dock(): Promise<void>; undock(id): Promise<void> }`; `flipId?: string` prop bound as `data-flip-id`; ids are uniformly `` `dock-card-${id}` `` in the popup and PanelRail. ✓
- **Known polish deferred:** the fixed full-screen scrim still appears/disappears instantly (a soft CSS opacity fade is an optional follow-up); perfect two-element content cross-fade would require keeping the leaving card mounted through the flight — current behaviour fades the destination in from the source bounds, which reads well for a grow/shrink morph.
