# Popup grows from the clicked medallion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a medallion is clicked on the tree, the bigger-view popup **grows out of that medallion** (shared-element FLIP) while its content **cascades in** (portrait → name → details).

**Architecture:** Reuse the FLIP seam from the dock morph. Add `captureGrowMorph(sourceEl)` to `motion/popupDock.ts` — it snapshots the clicked medallion's rect and, on `play(id)`, flies the dialog from that rect (`flipInvert` + `gsap.fromTo`) and staggers the dialog's `[data-cascade]` content. A new `openFrom` method on `useDockMorph` runs the state-first orchestration; `TreeView.onSelect` captures the medallion and calls it. State-first preserved (the Pinia store opens synchronously; motion layered on top).

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Pinia, GSAP 3.13 core, Vitest + @vue/test-utils. Spec: [docs/superpowers/specs/2026-06-14-popup-grow-from-medallion-design.md](../specs/2026-06-14-popup-grow-from-medallion-design.md). Extends the open PR #80 on the `feat/popup-dock-morph` branch.

---

## Background the implementer needs

- Work on the **current `feat/popup-dock-morph` branch** (PR #80). Add commits, push to update the PR. Do not branch.
- **What exists** (built earlier on this branch):
  - `src/frontend/src/motion/popupDock.ts` exports `flipInvert(source, dest)`, `captureDockMorph(id)`, types `DockMorph { finish(): void }` / `DockMorphCapture`, and module-private helpers `rectOf(el)`, `selector(id)` (`[data-flip-id="dock-card-${id}"]`), plus consts `MORPH_START_OPACITY = 0.35` and `CLEAR = 'transform,opacity,transformOrigin'`. It is the only file importing `gsap`.
  - `src/frontend/src/composables/useDockMorph.ts` exports `useDockMorph()` → `{ undock(id), dock() }`, built on a private `morph(id, mutate)` that does `inFlight?.finish() → capture → mutate → await nextTick() → play`.
  - `motionTokens` (`src/motion/tokens.ts`): `morph = { duration: 0.45, ease: 'power2.inOut' }`, `cascade = { duration: 0.4, ease: 'power1.out' }`.
  - The medallion is rendered in `OakTree.vue` as `<g v-for="node in layout.nodes" :key="node.id" data-test="node" …>`. `PersonDetail.vue` (the popup/rail body) has `.detail__portrait` (portrait), `.detail__heading` (name/lifespan/vocation), and `.detail__summary`.
  - `TreeView.onSelect(id)` currently: `router.push({name:'person',params:{id}}).finally(() => { if (!isMobile.value) panel.openBiggerView(id) })`.
- **State-first:** the store action (`openBiggerView`) stays synchronous; capture the medallion rect *before* opening, then animate after `nextTick`.
- **Reduced motion / desktop-only:** `captureGrowMorph` returns null under `prefersReducedMotion()`; `onSelect` only opens the popup when `!isMobile` (unchanged), so the morph is desktop-only.
- **Test command** (from `src/frontend`): single file `npm test -- <path>`; full `npm test`; build `npm run build`. The GSAP mock pattern is in `src/motion/popupDock.spec.ts` (mock `gsap` default with `fromTo`/`from`/`to`, stub `matchMedia`, stub each test element's `getBoundingClientRect`).
- **Custom ports for live runs:** frontend **5210**, API consumed read-only on **5037**.

---

## File structure

| File | Modified | Responsibility |
| --- | --- | --- |
| `src/frontend/src/motion/popupDock.ts` | Modify | Add `GrowMorphCapture` + `captureGrowMorph(sourceEl)` (grow the dialog from a rect + cascade `[data-cascade]`). Reuses `flipInvert`/`rectOf`/`selector`/consts. |
| `src/frontend/src/motion/popupDock.spec.ts` | Modify | Unit tests for `captureGrowMorph`. |
| `src/frontend/src/composables/useDockMorph.ts` | Modify | Add `openFrom(id, sourceEl)`. |
| `src/frontend/src/composables/useDockMorph.spec.ts` | Modify | Unit tests for `openFrom` (+ mock `captureGrowMorph`). |
| `src/frontend/src/components/OakTree.vue` | Modify | `:data-node-id="node.id"` on the medallion `<g>`. |
| `src/frontend/src/components/PersonDetail.vue` | Modify | `data-cascade` on portrait, heading, summary. |
| `src/frontend/src/views/TreeView.vue` | Modify | Capture the medallion in `onSelect`; open via `dockMorph.openFrom`. |
| `docs/reference/features/oak-tree.md` / `person-details.md` | Modify (Task 5) | Document the medallion-open animation. |

---

## Task 1: `captureGrowMorph` — grow from a rect + cascade (TDD)

**Files:**
- Modify: `src/frontend/src/motion/popupDock.ts`
- Modify test: `src/frontend/src/motion/popupDock.spec.ts`

- [ ] **Step 1: Add the failing tests**

In `src/frontend/src/motion/popupDock.spec.ts`, update the import line to add `captureGrowMorph`:

```ts
import { captureDockMorph, captureGrowMorph, flipInvert } from './popupDock';
```

Add a helper after the existing `card` helper:

```ts
function plain(rect: { left: number; top: number; width: number; height: number }) {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({
    left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON() {}
  }) as DOMRect;
  document.body.appendChild(el);
  return el;
}
```

Add this describe block at the end of the file (before the final closing brace of the file, as a sibling of the other `describe`s):

```ts
describe('captureGrowMorph', () => {
  it('returns null under reduced motion', () => {
    stubMatchMedia(true);
    expect(captureGrowMorph(plain({ left: 0, top: 0, width: 10, height: 10 }))).toBeNull();
    expect(mocks.fromTo).not.toHaveBeenCalled();
  });

  it('grows the dialog from the source rect and cascades its [data-cascade] content', () => {
    const medallion = plain({ left: 100, top: 200, width: 64, height: 80 });
    const capture = captureGrowMorph(medallion)!;
    const dialog = card('p1', { left: 360, top: 140, width: 560, height: 400 });
    const i1 = document.createElement('div'); i1.setAttribute('data-cascade', ''); dialog.appendChild(i1);
    const i2 = document.createElement('div'); i2.setAttribute('data-cascade', ''); dialog.appendChild(i2);
    capture.play('p1');

    expect(mocks.fromTo).toHaveBeenCalledTimes(1);
    const [target, fromVars, toVars] = mocks.fromTo.mock.calls[0] as unknown as [Element, Record<string, unknown>, Record<string, unknown>];
    expect(target).toBe(dialog);
    expect(fromVars).toMatchObject({ x: 100 - 360, y: 200 - 140, scaleX: 64 / 560, scaleY: 80 / 400, opacity: 0.35, transformOrigin: 'top left' });
    expect(toVars).toMatchObject({ x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, duration: motionTokens.morph.duration, ease: motionTokens.morph.ease });

    expect(mocks.from).toHaveBeenCalledTimes(1);
    const [items, cascadeVars] = mocks.from.mock.calls[0] as unknown as [ArrayLike<Element>, Record<string, unknown>];
    expect(items.length).toBe(2);
    expect(cascadeVars).toMatchObject({ opacity: 0, y: 8, duration: motionTokens.cascade.duration, ease: motionTokens.cascade.ease, stagger: 0.08 });
  });

  it('skips the cascade when there are no [data-cascade] items', () => {
    const medallion = plain({ left: 0, top: 0, width: 10, height: 10 });
    const capture = captureGrowMorph(medallion)!;
    card('p1', { left: 0, top: 0, width: 100, height: 100 });
    capture.play('p1');
    expect(mocks.fromTo).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('play() returns null when the dialog is absent', () => {
    const capture = captureGrowMorph(plain({ left: 0, top: 0, width: 10, height: 10 }))!;
    expect(capture.play('ghost')).toBeNull();
    expect(mocks.fromTo).not.toHaveBeenCalled();
  });

  it('finish() completes the tweens', () => {
    const capture = captureGrowMorph(plain({ left: 0, top: 0, width: 10, height: 10 }))!;
    card('p1', { left: 0, top: 0, width: 100, height: 100 });
    const morph = capture.play('p1')!;
    morph.finish();
    expect(mocks.fromTo.mock.results[0].value.progress).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/motion/popupDock.spec.ts`
Expected: FAIL — `captureGrowMorph` is not exported.

- [ ] **Step 3: Implement**

In `src/frontend/src/motion/popupDock.ts`, add after the `DockMorphCapture` interface:

```ts
export interface GrowMorphCapture { play(id: string): DockMorph | null; }
```

Add these consts next to the existing ones (`MORPH_START_OPACITY` etc.):

```ts
const CASCADE_OFFSET = 8;
const CASCADE_STAGGER = 0.08;
```

Add the function (e.g. after `captureDockMorph`):

```ts
// Grow the dialog out of an explicit source element (a clicked medallion) and
// cascade its content in. The source persists in the DOM (unlike the dock swap),
// so we capture its rect directly rather than pairing by data-flip-id.
export function captureGrowMorph(sourceEl: Element): GrowMorphCapture | null {
  if (prefersReducedMotion()) {
    return null;
  }
  const source = rectOf(sourceEl);
  return {
    play(id: string): DockMorph | null {
      const dialog = document.querySelector(selector(id));
      if (!dialog) {
        return null;
      }
      const inv = flipInvert(source, rectOf(dialog));
      const tweens: ReturnType<typeof gsap.fromTo>[] = [];
      tweens.push(gsap.fromTo(dialog,
        { x: inv.x, y: inv.y, scaleX: inv.scaleX, scaleY: inv.scaleY, opacity: MORPH_START_OPACITY, transformOrigin: 'top left' },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, duration: motionTokens.morph.duration, ease: motionTokens.morph.ease, clearProps: CLEAR }
      ));
      const items = dialog.querySelectorAll('[data-cascade]');
      if (items.length > 0) {
        tweens.push(gsap.from(items, { opacity: 0, y: CASCADE_OFFSET, duration: motionTokens.cascade.duration, ease: motionTokens.cascade.ease, stagger: CASCADE_STAGGER, clearProps: 'opacity,transform' }));
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/motion/popupDock.spec.ts`
Expected: PASS (all existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/motion/popupDock.ts src/frontend/src/motion/popupDock.spec.ts
git commit -m "feat(motion): captureGrowMorph — grow the popup from a source rect + cascade"
```

---

## Task 2: `useDockMorph.openFrom` (TDD)

**Files:**
- Modify: `src/frontend/src/composables/useDockMorph.ts`
- Modify test: `src/frontend/src/composables/useDockMorph.spec.ts`

- [ ] **Step 1: Update the spec**

In `src/frontend/src/composables/useDockMorph.spec.ts`, extend the hoisted mock and the module mock to add `captureGrowMorph`:

```ts
const mocks = vi.hoisted(() => {
  const finish = vi.fn();
  const play = vi.fn(() => ({ finish }));
  const capture = { play };
  const growPlay = vi.fn(() => ({ finish }));
  const growCapture = { play: growPlay };
  return {
    finish, play, capture, captureDockMorph: vi.fn((_id: string): unknown => capture),
    growPlay, growCapture, captureGrowMorph: vi.fn((_el: Element): unknown => growCapture)
  };
});
vi.mock('../motion/popupDock', () => ({ captureDockMorph: mocks.captureDockMorph, captureGrowMorph: mocks.captureGrowMorph }));
```

Add these tests inside the `describe('useDockMorph', …)` block:

```ts
it('openFrom: captures from the source element, opens the bigger view, plays after the tick', async () => {
  const panel = usePanelStore();
  panel.openPerson('p1');
  const openSpy = vi.spyOn(panel, 'openBiggerView');
  const source = document.createElement('div');
  const { openFrom } = useDockMorph();

  const done = openFrom('p1', source);
  expect(mocks.captureGrowMorph).toHaveBeenCalledWith(source);
  expect(openSpy).toHaveBeenCalledWith('p1');
  expect(panel.biggerViewId).toBe('p1');
  expect(mocks.growPlay).not.toHaveBeenCalled();

  await done;
  expect(mocks.growPlay).toHaveBeenCalledWith('p1');
});

it('openFrom: a second open finishes the in-flight morph first', async () => {
  const panel = usePanelStore();
  panel.openPerson('p1');
  const { openFrom } = useDockMorph();
  await openFrom('p1', document.createElement('div'));
  expect(mocks.finish).not.toHaveBeenCalled();
  await openFrom('p1', document.createElement('div'));
  expect(mocks.finish).toHaveBeenCalledTimes(1);
});

it('openFrom: with no source element it still opens, never plays', async () => {
  const panel = usePanelStore();
  panel.openPerson('p1');
  const { openFrom } = useDockMorph();
  await openFrom('p1', null);
  expect(panel.biggerViewId).toBe('p1');
  expect(mocks.captureGrowMorph).not.toHaveBeenCalled();
  expect(mocks.growPlay).not.toHaveBeenCalled();
});

it('openFrom: under reduced motion (capture null) it still opens, never plays', async () => {
  mocks.captureGrowMorph.mockReturnValueOnce(null);
  const panel = usePanelStore();
  panel.openPerson('p1');
  const { openFrom } = useDockMorph();
  await openFrom('p1', document.createElement('div'));
  expect(panel.biggerViewId).toBe('p1');
  expect(mocks.growPlay).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/composables/useDockMorph.spec.ts`
Expected: FAIL — `openFrom` is not a function / `captureGrowMorph` undefined.

- [ ] **Step 3: Implement**

Overwrite `src/frontend/src/composables/useDockMorph.ts` with:

```ts
import { nextTick } from 'vue';
import { usePanelStore } from '../stores/panelStore';
import { captureDockMorph, captureGrowMorph, type DockMorph } from '../motion/popupDock';

// Wraps the synchronous dock/undock/open store actions in a deterministic FLIP
// morph. State-first: capture bounds, mutate the store, wait for Vue to patch
// the DOM, then animate.
export function useDockMorph() {
  const panel = usePanelStore();
  let inFlight: DockMorph | null = null;

  async function morph(id: string | null, mutate: () => void): Promise<void> {
    inFlight?.finish();
    inFlight = null;
    const capture = id ? captureDockMorph(id) : null;
    mutate();
    await nextTick();
    inFlight = capture?.play() ?? null;
  }

  // Open the bigger view by growing it out of `sourceEl` (a clicked medallion).
  async function growFrom(id: string, sourceEl: Element | null, mutate: () => void): Promise<void> {
    inFlight?.finish();
    inFlight = null;
    const capture = sourceEl ? captureGrowMorph(sourceEl) : null;
    mutate();
    await nextTick();
    inFlight = capture?.play(id) ?? null;
  }

  return {
    undock: (id: string): Promise<void> => morph(id, () => panel.undock(id)),
    dock: (): Promise<void> => morph(panel.biggerViewId, () => panel.closeBiggerView()),
    openFrom: (id: string, sourceEl: Element | null): Promise<void> => growFrom(id, sourceEl, () => panel.openBiggerView(id))
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/composables/useDockMorph.spec.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/composables/useDockMorph.ts src/frontend/src/composables/useDockMorph.spec.ts
git commit -m "feat(motion): useDockMorph.openFrom — grow the popup from a medallion"
```

---

## Task 3: medallion `data-node-id` + PersonDetail `data-cascade` (TDD)

**Files:**
- Modify: `src/frontend/src/components/OakTree.vue` (the medallion `<g>`)
- Modify: `src/frontend/src/components/PersonDetail.vue` (portrait, heading, summary)
- Modify tests: `src/frontend/src/components/OakTree.spec.ts` and `PersonDetail.spec.ts` (mirror each file's existing mount harness)

- [ ] **Step 1: Add failing assertions**

In `OakTree.spec.ts`, add a test (reuse the file's existing mount harness / layout fixture):

```ts
it('tags each medallion <g> with its node id', () => {
  const w = /* existing OakTree mount with a layout that has a node id 'p1' */;
  const node = w.get('[data-test="node"]');
  expect(node.attributes('data-node-id')).toBeTruthy();
});
```

In `PersonDetail.spec.ts`, add (reuse the file's harness that populates the selection store with a `detail`, including a `summary`):

```ts
it('marks the cascade blocks: portrait, heading, summary in order', () => {
  const w = /* existing PersonDetail mount with a detail that has a summary */;
  const order = w.findAll('[data-cascade]').map(el => el.classes().find(c => c.startsWith('detail__')));
  expect(order).toEqual(['detail__portrait', 'detail__heading', 'detail__summary']);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/components/OakTree.spec.ts src/components/PersonDetail.spec.ts`
Expected: FAIL — `data-node-id` / `data-cascade` absent.

- [ ] **Step 3: Implement**

In `OakTree.vue`, on the medallion `<g v-for="node in layout.nodes" …>`, add `:data-node-id="node.id"` (alongside the existing `data-test="node"` / `:data-entrance-node` attributes).

In `PersonDetail.vue`, add `data-cascade` to three elements:
- the portrait — BOTH branches carry `class="… detail__portrait …"`: add `data-cascade` to the `<button class="detail__portrait detail__portrait--media" …>` and to the `<div v-else class="detail__portrait">`.
- the heading — `<div class="detail__heading">` → add `data-cascade`.
- the summary — `<p v-if="summaryText" class="detail__summary">` → add `data-cascade`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/OakTree.spec.ts src/components/PersonDetail.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/OakTree.vue src/frontend/src/components/PersonDetail.vue src/frontend/src/components/OakTree.spec.ts src/frontend/src/components/PersonDetail.spec.ts
git commit -m "feat(tree/detail): data-node-id on medallions + data-cascade on detail blocks"
```

---

## Task 4: wire `TreeView.onSelect` to grow from the medallion

**Files:**
- Modify: `src/frontend/src/views/TreeView.vue`
- Modify test: `src/frontend/src/views/TreeView.spec.ts` (if it asserts the old `openBiggerView` call)

- [ ] **Step 1: Implement the wiring**

In `src/frontend/src/views/TreeView.vue` `<script setup>`, import and instantiate the composable (near the other store/composable setup):

```ts
import { useDockMorph } from '../composables/useDockMorph';
// …
const dockMorph = useDockMorph();
```

Replace `onSelect`:

```ts
function onSelect(id: string): void {
  // Capture the clicked medallion now (before the popup mounts) so the bigger
  // view can grow out of it.
  const medallion = document.querySelector(`[data-node-id="${id}"]`);
  void router.push({ name: 'person', params: { id } }).finally(() => {
    if (!isMobile.value) {
      void dockMorph.openFrom(id, medallion);
    }
  });
}
```

- [ ] **Step 2: Run the full suite**

Run (from `src/frontend`): `npm test`
Expected: all pass. If a pre-existing `TreeView` test asserted `panel.openBiggerView` was called directly on select, update it to assert the resulting state (`panel.biggerViewId === id` after `await nextTick()`) — `openFrom` still calls `openBiggerView` synchronously, so a state assertion holds. The morph wrapper calls the real `captureGrowMorph`; in jsdom `getBoundingClientRect` is zeros and GSAP no-ops, so state is unaffected. (If it proves noisy, mock `../composables/useDockMorph` in that one spec to a pass-through that calls the store — but prefer the real path.)

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/views/TreeView.vue src/frontend/src/views/TreeView.spec.ts
git commit -m "feat(tree): grow the bigger view out of the clicked medallion"
```

---

## Task 5: full suite + type-check + live verification + docs + push

**Files:**
- Modify: `docs/reference/features/oak-tree.md` and/or `docs/reference/features/person-details.md`

- [ ] **Step 1: Whole suite + build**

Run (from `src/frontend`): `npm test` then `npm run build`.
Expected: all specs pass; `vue-tsc` reports no type errors. Fix any strict-type fallout in the new specs (e.g. cast `mock.calls[0]` via `as unknown as [...]`, as the existing dock-morph specs do).

- [ ] **Step 2: Live-verify (custom ports, with the owner)**

Dev server on **5210** (proxy `/api` → 5037). Click a medallion on a desktop-width window and confirm: the popup **grows out of the clicked medallion** (translate + scale + fade) and its content **cascades** (portrait → name → details). Confirm dock/undock and `✕` still behave as before, and that reduced motion opens it instantly. Headless preview starves rAF, so confirm the moving frames with the owner; check `preview_console_logs` for errors and use store/DOM probes for wiring.

- [ ] **Step 3: Tune if needed**

Adjust only presentation values — `CASCADE_OFFSET` / `CASCADE_STAGGER` / token usage in `popupDock.ts`, or which blocks carry `data-cascade`. Keep the cascade gentle so the grow stays the hero. Re-run Step 1 and re-commit if changed.

- [ ] **Step 4: Docs sync (update-docs-for-pr)**

In [oak-tree.md](../../../docs/reference/features/oak-tree.md) (medallion interaction) and/or [person-details.md](../../../docs/reference/features/person-details.md) (popup open), document that a desktop medallion click now **grows the bigger-view popup out of the clicked medallion** (shared-element FLIP) with a content cascade; instant under reduced motion; close still docks to the rail. Verify links resolve.

- [ ] **Step 5: Commit docs + push**

```bash
git add docs/reference
git commit -m "Docs: popup grows from the clicked medallion"
git push
```

The branch tracks `origin/feat/popup-dock-morph`, so this updates PR #80. **Do not merge** — the owner reviews.

---

## Self-review (author)

- **Spec coverage:** grow FLIP from the medallion rect ✓ (Task 1, `captureGrowMorph` + `flipInvert`); content cascade of `[data-cascade]` with the `cascade` token + stagger ✓ (Task 1); reduced-motion null ✓; play-null when no dialog ✓; state-first open + `nextTick` + re-entrancy `finish()` ✓ (Task 2, `openFrom`); `data-node-id` on the medallion ✓ (Task 3); `data-cascade` on portrait/heading/summary in order ✓ (Task 3); `onSelect` captures the medallion before opening + desktop-only via `!isMobile` ✓ (Task 4); close unchanged (no edit to dock/✕ paths) ✓; medallion keeps no `data-flip-id` so the dock morph is untouched ✓; extends PR #80 ✓ (Task 5).
- **No new gsap-in-components:** only `motion/popupDock.ts` imports gsap. ✓
- **Type consistency:** `GrowMorphCapture { play(id: string): DockMorph | null }`; `captureGrowMorph(sourceEl: Element): GrowMorphCapture | null`; reuses `DockMorph`, `flipInvert`, `rectOf`, `selector`, `MORPH_START_OPACITY`, `CLEAR`; composable `openFrom(id: string, sourceEl: Element | null): Promise<void>`; consts `CASCADE_OFFSET = 8`, `CASCADE_STAGGER = 0.08`. Consistent across tasks. ✓
- **Placeholders:** the only `/* … */` are the OakTree/PersonDetail/TreeView spec harness references — intentional, because those spec files already exist on the branch and their mount harness must be reused verbatim rather than re-invented.
