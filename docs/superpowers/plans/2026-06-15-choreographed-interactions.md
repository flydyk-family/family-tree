# Choreographed interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three calm GSAP micro-interactions to the oak — a medallion hover lift, a portrait fade-in over the dark mount, and a one-shot "comes-alive" shimmer on the popup portrait when its living clip starts.

**Architecture:** One new pure-ish motion module (`motion/interactions.ts`) holds the two new tween helpers (`hoverLift`, `comesAliveShimmer`); the portrait fade-in reuses the existing `motion/fade.ts` opacity helpers. Components call these at event/lifecycle points and never import `gsap` directly. Every tween checks `prefersReducedMotion()` and jumps to its end state.

**Tech Stack:** Vue 3 + TypeScript, GSAP 3 core, Vitest + @vue/test-utils (run with `--pool=forks`), Pinia.

**Spec:** [`docs/superpowers/specs/2026-06-15-choreographed-interactions-design.md`](../specs/2026-06-15-choreographed-interactions-design.md)

---

## File Structure

| File | Create/Modify | Responsibility |
| --- | --- | --- |
| `src/frontend/src/motion/interactions.ts` | Create | `hoverLift(card, lifted)` and `comesAliveShimmer(ring)` — self-contained GSAP tweens with reduced-motion jump-to-end branches. |
| `src/frontend/src/motion/interactions.spec.ts` | Create | Unit tests for both helpers (GSAP mocked, mirrors `fade.spec.ts`). |
| `src/frontend/src/components/PersonMedallion.vue` | Modify | Seed the still `<image>` at opacity 0; fade it in on `@load`. |
| `src/frontend/src/components/PersonMedallion.spec.ts` | Modify | Assert the seed + fade-on-load wiring. |
| `src/frontend/src/components/OakTree.vue` | Modify | Per-node `@pointerenter`/`@pointerleave` → `hoverLift`, gated by a new `ceremonyActive` prop. |
| `src/frontend/src/components/OakTree.spec.ts` | Modify | Assert hover calls the tween, and the ceremony gate suppresses it. |
| `src/frontend/src/views/TreeView.vue` | Modify | Pass `entranceActive` down as `:ceremony-active`. |
| `src/frontend/src/components/PersonDetail.vue` | Modify | `<video>` `@playing` → `comesAliveShimmer`, once per popup mount, reset on person change. |
| `src/frontend/src/components/PersonDetail.spec.ts` | Modify | Assert fire-once, reset-on-person-change, target element. |
| `docs/reference/features/oak-tree.md`, `features/person-details.md`, `roadmap.md`, `technical-debt.md` | Modify | Doc sync (same PR). |

**Conventions to follow:**
- Run every test with `--pool=forks` (the threads pool times out on this machine). From `src/frontend`: `npx vitest run --pool=forks <path>`.
- Durations are GSAP seconds. Motion tokens live in `motion/tokens.ts` (`feedback` = 0.3 s `power1.out`).
- End every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Branch is already `feat/choreographed-interactions`. Do **not** stage `.claude/launch.json` in any commit.

---

## Task 1: `hoverLift` helper

**Files:**
- Create: `src/frontend/src/motion/interactions.ts`
- Test: `src/frontend/src/motion/interactions.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/motion/interactions.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { hoverLift } from './interactions';

const { to, set } = vi.hoisted(() => ({ to: vi.fn(), set: vi.fn() }));
vi.mock('gsap', () => ({ default: { to, set } }));

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && matches,
    media,
    addEventListener() {},
    removeEventListener() {}
  }));
}

beforeEach(() => {
  to.mockReset();
  set.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('hoverLift', () => {
  it('lifts the card on enter — scale up + faint brighten, fast ease-in', () => {
    stubMatchMedia(false);
    const el = document.createElement('div');
    hoverLift(el, true);
    expect(to).toHaveBeenCalledWith(
      el,
      expect.objectContaining({
        scale: 1.03,
        filter: 'brightness(1.06)',
        transformOrigin: 'center center',
        duration: 0.25,
        ease: 'power1.out',
        overwrite: 'auto'
      })
    );
  });

  it('settles back to rest on leave (longer ease-out, no brighten)', () => {
    stubMatchMedia(false);
    const el = document.createElement('div');
    hoverLift(el, false);
    expect(to).toHaveBeenCalledWith(
      el,
      expect.objectContaining({ scale: 1, filter: 'brightness(1)', duration: 0.3 })
    );
  });

  it('no-ops under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    hoverLift(document.createElement('div'), true);
    expect(to).not.toHaveBeenCalled();
  });

  it('no-ops on a null element', () => {
    stubMatchMedia(false);
    hoverLift(null, true);
    expect(to).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --pool=forks src/motion/interactions.spec.ts` (from `src/frontend`)
Expected: FAIL — `Failed to resolve import './interactions'` / `hoverLift is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/frontend/src/motion/interactions.ts`:

```ts
import gsap from 'gsap';
import { prefersReducedMotion } from './reducedMotion';

// Personality A (calm, no overshoot). Hover values echo the parent motion spec
// §4: scale 1.03, 250 ms in / 300 ms out, with a faint frame brighten.
const HOVER_SCALE = 1.03;
const HOVER_IN = 0.25;
const HOVER_OUT = 0.3;
const HOVER_BRIGHTNESS = 1.06;

// Lift a medallion card group on pointer hover and settle it back on leave.
// Scales about the card's own centre (composes with the node's layout
// translate, which lives on the parent group). No-op under reduced motion —
// the resting state is the only state.
export function hoverLift(card: Element | null, lifted: boolean): void {
  if (!card || prefersReducedMotion()) {
    return;
  }
  gsap.to(card, {
    scale: lifted ? HOVER_SCALE : 1,
    filter: `brightness(${lifted ? HOVER_BRIGHTNESS : 1})`,
    transformOrigin: 'center center',
    duration: lifted ? HOVER_IN : HOVER_OUT,
    ease: 'power1.out',
    overwrite: 'auto'
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --pool=forks src/motion/interactions.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/motion/interactions.ts src/frontend/src/motion/interactions.spec.ts
git commit -m "$(cat <<'EOF'
Add hoverLift motion helper for medallion hover

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `comesAliveShimmer` helper

**Files:**
- Modify: `src/frontend/src/motion/interactions.ts`
- Test: `src/frontend/src/motion/interactions.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/frontend/src/motion/interactions.spec.ts` (and add `comesAliveShimmer` to the import at the top):

```ts
import { hoverLift, comesAliveShimmer } from './interactions';
```

```ts
describe('comesAliveShimmer', () => {
  it('runs a one-shot there-and-back on the ring (border brighten + breath)', () => {
    stubMatchMedia(false);
    const el = document.createElement('div');
    comesAliveShimmer(el);
    expect(to).toHaveBeenCalledWith(
      el,
      expect.objectContaining({
        scale: 1.03,
        transformOrigin: 'center center',
        duration: 0.3,
        ease: 'power1.out',
        repeat: 1,
        yoyo: true,
        overwrite: 'auto'
      })
    );
    // tweens the border toward a concrete gilt colour (resolved, not a CSS var)
    const vars = to.mock.calls[to.mock.calls.length - 1][1];
    expect(typeof vars.borderColor).toBe('string');
    expect(vars.borderColor).not.toContain('var(');
  });

  it('no-ops under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    comesAliveShimmer(document.createElement('div'));
    expect(to).not.toHaveBeenCalled();
  });

  it('no-ops on a null element', () => {
    stubMatchMedia(false);
    comesAliveShimmer(null);
    expect(to).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --pool=forks src/motion/interactions.spec.ts`
Expected: FAIL — `comesAliveShimmer is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Add to `src/frontend/src/motion/interactions.ts` — first add the tokens import at the top (the shimmer uses the `feedback` token):

```ts
import { motionTokens } from './tokens';
```

Then add below `hoverLift`:

```ts
const SHIMMER_SCALE = 1.03;
const GILT_FALLBACK = '#b7913f'; // --gilt in tokens.scss

function giltColor(): string {
  if (typeof getComputedStyle !== 'function') {
    return GILT_FALLBACK;
  }
  const v = getComputedStyle(document.documentElement).getPropertyValue('--gilt').trim();
  return v || GILT_FALLBACK;
}

// One-shot "comes alive" shimmer for the popup portrait ring: the border
// brightens toward gilt and the disc breathes 1.0 → 1.03 → 1.0, then returns
// (yoyo). Subtle by design. No-op under reduced motion. clearProps restores
// the CSS-defined border/transform after the shimmer so nothing stays inlined.
export function comesAliveShimmer(ring: Element | null): void {
  if (!ring || prefersReducedMotion()) {
    return;
  }
  gsap.to(ring, {
    borderColor: giltColor(),
    scale: SHIMMER_SCALE,
    transformOrigin: 'center center',
    duration: motionTokens.feedback.duration,
    ease: motionTokens.feedback.ease,
    repeat: 1,
    yoyo: true,
    overwrite: 'auto',
    clearProps: 'borderColor,transform'
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --pool=forks src/motion/interactions.spec.ts`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/motion/interactions.ts src/frontend/src/motion/interactions.spec.ts
git commit -m "$(cat <<'EOF'
Add comesAliveShimmer one-shot portrait-ring tween

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Portrait fade-in (PersonMedallion)

**Files:**
- Modify: `src/frontend/src/components/PersonMedallion.vue`
- Test: `src/frontend/src/components/PersonMedallion.spec.ts`

The still `<image>` (template lines ~58–68) renders at full opacity. Seed it at 0 on mount and fade it in on `@load`, over the existing dark `.oak__mount` disc. The fade module is already mocked in this spec (`fadeTo`, `setOpacity`).

- [ ] **Step 1: Write the failing tests**

Add to `src/frontend/src/components/PersonMedallion.spec.ts` inside `describe('PersonMedallion', …)`:

```ts
it('seeds the portrait image at opacity 0 on mount', () => {
  const wrapper = mountNode(node({}, { portrait: 'p-0001.jpg' }));
  const img = wrapper.find('[data-test="portrait"]').element;
  expect(setOpacityMock).toHaveBeenCalledWith(img, 0);
});

it('fades the portrait in when it finishes loading', async () => {
  const wrapper = mountNode(node({}, { portrait: 'p-0001.jpg' }));
  const img = wrapper.find('[data-test="portrait"]');
  fadeToMock.mockReset();
  await img.trigger('load');
  expect(fadeToMock).toHaveBeenCalledWith(img.element, 1);
});

it('seeds no portrait opacity for the monogram fallback', () => {
  setOpacityMock.mockReset();
  mountNode(node()); // no portrait
  // only the overlay-seed call happens; no portrait element to seed
  expect(setOpacityMock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --pool=forks src/components/PersonMedallion.spec.ts`
Expected: FAIL — `setOpacityMock` not called with the portrait element; no `@load` handler.

- [ ] **Step 3: Implement**

In `src/frontend/src/components/PersonMedallion.vue` `<script setup>`, after the `overlayEl` ref (line ~33) add:

```ts
const portraitEl = ref<SVGImageElement | null>(null);
function onPortraitLoad(): void {
  fadeTo(portraitEl.value, 1);
}
```

Extend the existing `onMounted` (line ~36) to also seed the portrait when present:

```ts
onMounted(() => {
  setOpacity(overlayEl.value, overlay.value ? 1 : 0);
  if (portraitHref.value) {
    setOpacity(portraitEl.value, 0);
  }
});
```

In the template, add the ref and load handler to the still `<image>` (the `v-if="portraitHref"` one):

```html
<image
  v-if="portraitHref"
  ref="portraitEl"
  data-test="portrait"
  :href="portraitHref"
  :x="-(g.portraitZoom * g.w) / 2"
  :y="-(g.portraitZoom * g.h) / 2 + g.portraitOffsetY"
  :width="g.portraitZoom * g.w"
  :height="g.portraitZoom * g.h"
  preserveAspectRatio="xMidYMid slice"
  :clip-path="`url(#${clipId})`"
  @load="onPortraitLoad"
/>
```

(`fadeTo` and `setOpacity` are already imported at line 11.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --pool=forks src/components/PersonMedallion.spec.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonMedallion.vue src/frontend/src/components/PersonMedallion.spec.ts
git commit -m "$(cat <<'EOF'
Fade medallion portraits in over the dark mount on load

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Hover lift wiring + ceremony gate (OakTree)

**Files:**
- Modify: `src/frontend/src/components/OakTree.vue`
- Test: `src/frontend/src/components/OakTree.spec.ts`

OakTree's per-node `<g class="oak__node">` (template lines ~261–277) already owns `@click`. Add pointer-enter/leave that lift the inner `.oak__medallion-card` group, gated off while the entrance ceremony is active. GSAP is already mocked in this spec via `gsapMocks` (`to`, `from`, `fromTo`, `set`); `hoverLift` calls `gsap.to`, so it goes through `gsapMocks.to`. `prefersReducedMotion()` returns `false` in jsdom (no `matchMedia`), so the tween fires.

- [ ] **Step 1: Write the failing tests**

Add to `src/frontend/src/components/OakTree.spec.ts` inside `describe('OakTree', …)`:

```ts
it('lifts a medallion on pointer-enter and settles it on leave', async () => {
  const layout = buildLayout(graph, { focusId: 'a' });
  const wrapper = mount(OakTree, { props: { layout } });
  const nodeEl = wrapper.findAll('[data-test="node"]')[0];

  gsapMocks.to.mockClear();
  await nodeEl.trigger('pointerenter');
  expect(gsapMocks.to).toHaveBeenCalledWith(
    nodeEl.find('.oak__medallion-card').element,
    expect.objectContaining({ scale: 1.03 })
  );

  gsapMocks.to.mockClear();
  await nodeEl.trigger('pointerleave');
  expect(gsapMocks.to).toHaveBeenCalledWith(
    nodeEl.find('.oak__medallion-card').element,
    expect.objectContaining({ scale: 1 })
  );
});

it('suppresses the hover lift while the entrance ceremony is active', async () => {
  const layout = buildLayout(graph, { focusId: 'a' });
  const wrapper = mount(OakTree, { props: { layout, ceremonyActive: true } });
  const nodeEl = wrapper.findAll('[data-test="node"]')[0];

  gsapMocks.to.mockClear();
  await nodeEl.trigger('pointerenter');
  expect(gsapMocks.to).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --pool=forks src/components/OakTree.spec.ts`
Expected: FAIL — no hover handler, `gsapMocks.to` not called on `pointerenter`.

- [ ] **Step 3: Implement**

In `src/frontend/src/components/OakTree.vue`:

Add the import (near line 13, with the other motion imports):

```ts
import { hoverLift } from '../motion/interactions';
```

Add the `ceremonyActive` prop to `defineProps` (after `entranceCues`):

```ts
  entranceCues?: EntranceCues | null;
  ceremonyActive?: boolean;
```

Add the handler (near `onNodeActivate`, line ~100):

```ts
function onNodeHover(event: PointerEvent, lifted: boolean): void {
  // The ceremony drives node transforms; don't let a hover tween fight it.
  if (props.ceremonyActive) {
    return;
  }
  const nodeEl = event.currentTarget as Element | null;
  hoverLift(nodeEl?.querySelector('.oak__medallion-card') ?? null, lifted);
}
```

On the node `<g>` (template, alongside the existing `@click`/`@keydown` handlers), add:

```html
          @pointerenter="onNodeHover($event, true)"
          @pointerleave="onNodeHover($event, false)"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --pool=forks src/components/OakTree.spec.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/OakTree.vue src/frontend/src/components/OakTree.spec.ts
git commit -m "$(cat <<'EOF'
Lift medallions on hover, gated during the entrance ceremony

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: TreeView passes the ceremony flag

**Files:**
- Modify: `src/frontend/src/views/TreeView.vue`

TreeView already destructures `active: entranceActive` from `useEntranceCeremony` (line ~127) and renders `<OakTree …>` (lines ~203–214). Thread the flag down so the hover gate works in the running app. This is one-line wiring; correctness is enforced by `vue-tsc` (the prop is typed `boolean` on OakTree) and the existing suites.

- [ ] **Step 1: Add the binding**

In `src/frontend/src/views/TreeView.vue`, on the `<OakTree>` element add (next to `:morph-progress`):

```html
          :ceremony-active="entranceActive"
```

- [ ] **Step 2: Type-check**

Run (from `src/frontend`): `npm run build`
Expected: `vue-tsc` passes with no errors (the `:ceremony-active` boolean binding matches the new prop).

- [ ] **Step 3: Run the view + tree suites**

Run: `npx vitest run --pool=forks src/views/TreeView.spec.ts src/components/OakTree.spec.ts`
Expected: PASS — no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/views/TreeView.vue
git commit -m "$(cat <<'EOF'
Pass the entrance-active flag into OakTree to gate hover

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Comes-alive shimmer wiring (PersonDetail)

**Files:**
- Modify: `src/frontend/src/components/PersonDetail.vue`
- Test: `src/frontend/src/components/PersonDetail.spec.ts`

The living-portrait `<video>` (template lines ~99–110) has no play listener. Add `@playing` → fire the shimmer once per popup mount on the `.detail__portrait` ring, reusing the existing `portraitTriggerRef` (that ref IS the ring). Reset the once-flag when a different person is shown.

- [ ] **Step 1: Write the failing tests**

In `src/frontend/src/components/PersonDetail.spec.ts`, add the mock near the top (after the imports, before the data):

```ts
import { nextTick } from 'vue';

const { comesAliveShimmerMock } = vi.hoisted(() => ({ comesAliveShimmerMock: vi.fn() }));
vi.mock('../motion/interactions', () => ({ comesAliveShimmer: comesAliveShimmerMock, hoverLift: vi.fn() }));
```

Add `vi` to the existing `vitest` import if not present:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
```

Add a person with a living portrait and a beforeEach reset. Place the helper next to the existing `tadeusz` fixture:

```ts
const withVideo: PersonDetailType = {
  ...tadeusz,
  id: 'p-0099',
  portrait: 'p-0099.jpg',
  portraitVideo: 'p-0099.mp4'
};
```

In the existing `beforeEach`, add:

```ts
  comesAliveShimmerMock.mockReset();
```

Add the tests inside `describe('PersonDetail', …)`:

```ts
it('shimmers the portrait ring once when the living clip starts', async () => {
  const w = mountWith(withVideo);
  const video = w.find('[data-test="portrait-video"]');
  await video.trigger('playing');
  expect(comesAliveShimmerMock).toHaveBeenCalledTimes(1);
  expect(comesAliveShimmerMock).toHaveBeenCalledWith(
    w.find('[data-test="portrait-trigger"]').element
  );
});

it('does not re-shimmer on a second playing event (e.g. loop)', async () => {
  const w = mountWith(withVideo);
  const video = w.find('[data-test="portrait-video"]');
  await video.trigger('playing');
  await video.trigger('playing');
  expect(comesAliveShimmerMock).toHaveBeenCalledTimes(1);
});

it('re-arms the shimmer when a different person is shown', async () => {
  const w = mountWith(withVideo);
  await w.find('[data-test="portrait-video"]').trigger('playing');
  expect(comesAliveShimmerMock).toHaveBeenCalledTimes(1);

  useSelectionStore().$patch({
    selectedId: 'p-0100',
    detail: { ...withVideo, id: 'p-0100' }
  });
  await nextTick();
  await w.find('[data-test="portrait-video"]').trigger('playing');
  expect(comesAliveShimmerMock).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --pool=forks src/components/PersonDetail.spec.ts`
Expected: FAIL — no `@playing` handler; `comesAliveShimmerMock` never called.

- [ ] **Step 3: Implement**

In `src/frontend/src/components/PersonDetail.vue` `<script setup>`:

Add the import (near line 14):

```ts
import { comesAliveShimmer } from '../motion/interactions';
```

Add the once-flag and handler (after `portraitTriggerRef`, line ~48):

```ts
const shimmered = ref(false);
function onComesAlive(): void {
  if (shimmered.value) {
    return;
  }
  shimmered.value = true;
  comesAliveShimmer(portraitTriggerRef.value);
}
```

In the existing person-change watcher (lines ~35–39), reset the flag:

```ts
watch(() => detail.value?.id, () => {
  videoFailed.value = false;
  imageFailed.value = false;
  lightboxOpen.value = false;
  shimmered.value = false;
});
```

On the `<video>` element (template), add the listener:

```html
            @playing="onComesAlive"
            @error="videoFailed = true"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --pool=forks src/components/PersonDetail.spec.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonDetail.vue src/frontend/src/components/PersonDetail.spec.ts
git commit -m "$(cat <<'EOF'
Shimmer the popup portrait ring when the living clip comes alive

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Docs + full verification

**Files:**
- Modify: `docs/reference/features/oak-tree.md`, `docs/reference/features/person-details.md`, `docs/reference/roadmap.md`, `docs/reference/technical-debt.md`

- [ ] **Step 1: Run the full frontend suite + build**

Run (from `src/frontend`):

```bash
npx vitest run --pool=forks
npm run build
```

Expected: all tests PASS; `vue-tsc` + Vite build clean. Fix any fallout before continuing.

- [ ] **Step 2: Update the reference docs**

Use the `update-docs-for-pr` skill conventions (every repo-file mention is a relative Markdown link). Make these concrete edits, grounding each line in the code just written:

- `docs/reference/features/oak-tree.md` — in the motion/interactions section (the table that already lists the viewport fade, overlay crossfade, ceremony, layout-switch glide), add two rows:
  - **Medallion hover lift** — on pointer hover a medallion scales to 1.03 with a faint frame brighten (250 ms in / 300 ms out, `power1.out`); suppressed during the entrance ceremony and under reduced motion. Implemented by `hoverLift` in [`motion/interactions.ts`](../../../src/frontend/src/motion/interactions.ts), wired in [`OakTree.vue`](../../../src/frontend/src/components/OakTree.vue).
  - **Portrait fade-in** — a medallion still fades in (~300 ms, `feedback`) over its dark mount when it finishes loading; no pop-in. Implemented in [`PersonMedallion.vue`](../../../src/frontend/src/components/PersonMedallion.vue) via [`motion/fade.ts`](../../../src/frontend/src/motion/fade.ts).
- `docs/reference/features/person-details.md` — document the **comes-alive shimmer**: when the popup's living portrait starts playing, the portrait ring does a one-shot border-brighten-toward-gilt plus a 1.0→1.03→1.0 "breath" (once per open), via `comesAliveShimmer` in [`motion/interactions.ts`](../../../src/frontend/src/motion/interactions.ts). Reduced motion → no shimmer.
- `docs/reference/roadmap.md` — move "choreographed interactions / micro-interactions" items (hover lift, portrait fade-in, comes-alive shimmer) from planned to shipped; note that search-match pulse and lightbox expansion remain deferred. Update any live-vs-roadmap callout accordingly.
- `docs/reference/technical-debt.md` — add: the entrance ceremony's finale "medallion ring pulse" ([`entrance.ts`](../../../src/frontend/src/motion/entrance.ts) targets `.oak__gilt-band`) is a **no-op** — that class exists in no live component since the medallion moved to image frames; known dead code, not yet removed.

Read each doc first and match its existing voice/structure. Verify every link target exists from the file's location.

- [ ] **Step 3: Commit the docs**

```bash
git add docs/reference
git commit -m "$(cat <<'EOF'
Docs: sync reference with the three new oak micro-interactions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/choreographed-interactions
```

Open a PR into `main` (the PreToolUse hook will prompt `update-docs-for-pr` — docs are already in this branch, so confirm they're in sync). PR title states the idea, e.g. *"Bring the oak to life: hover lift, portrait fade-in, comes-alive shimmer"*. Body: the three interactions, reduced-motion behavior, the deferred items, and a note that animation *feel* needs an owner real-browser look (headless preview starves rAF / reports 0×0). **Do not self-merge** — the owner reviews and merges.

---

## Self-Review notes (for the implementer)

- **Reduced motion** is covered in the helper unit tests (Tasks 1–2); component specs run with `matchMedia` undefined (jsdom) so tweens fire — that's intentional, don't stub it there.
- **Type consistency:** helper names are `hoverLift(card, lifted)` and `comesAliveShimmer(ring)` everywhere; the OakTree prop is `ceremonyActive` (kebab `:ceremony-active` in templates).
- **Live feel** (hover smoothness, fade timing, shimmer subtlety) can't be judged in the headless preview — leave that to the owner's browser review. Wiring + reduced-motion + fire-once are fully unit-covered.
