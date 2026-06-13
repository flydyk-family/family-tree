# Oak Entrance Ceremony (PR 2 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The "Grow the tree" entrance — the oak and its era backdrop grow bottom→up generation by generation while the camera climbs, then one step-back reveal with a gilt pulse; once per session, replayable, skippable, reduced-motion-safe.

**Architecture:** A pure cue-sheet builder (`entranceCues.ts`) turns the layout + viewport size into numbers (phases, camera beats, strata positions) that are unit-tested without GSAP or DOM. A timeline builder (`entrance.ts`) turns cues + the rendered SVG into one GSAP timeline. A composable (`useEntranceCeremony.ts`) owns gating (session, deep-link, orientation, replay). OakTree only renders data attributes + the strata layer; TreeView wires the composable, the replay button, and interruption. State-first throughout: the full tree is always rendered and correct; the ceremony only choreographs its appearance.

**Tech Stack:** Vue 3 + TS, GSAP 3.13 timeline (core only), Vitest/jsdom with gsap mocked in unit tests.

**Spec:** `docs/superpowers/specs/2026-06-12-oak-motion-design.md` §3 (on main). Motion module interfaces from PR #70 (`motion/tokens`, `motion/reducedMotion`, `motion/camera`, `motion/fade`, `motion/stateTween`) are landed on main.

---

## Environment prerequisites (read first)

- **Node:** system Node 18 shadows the required portable Node 22. In every shell: PowerShell `$env:PATH = "$env:LOCALAPPDATA\Programs\nodejs-22;$env:PATH"`.
- **Working directory for npm/vitest:** `src/frontend/` of the worktree. Full `npm test` ≈ 30–75 s; use ≥300 s timeouts.
- **Worktree/branch:** created by the controller (harness `EnterWorktree`); commit to the current branch; it is pushed as `feat/oak-ceremony` at PR time.
- **jsdom gaps that shape the tests:** no `matchMedia` (treat missing as "no reduced motion"), no `SVGPathElement.getTotalLength` (entrance falls back to a nominal length), unreliable computed SVG paint. gsap is ALWAYS mocked in unit tests via `vi.hoisted` + `vi.mock('gsap', …)`.

## Scope decisions (locked)

- The ceremony **auto-plays only in vertical orientation** (the canonical oak). When evaluation happens in horizontal mode, the session is marked played and nothing animates; the replay button shows only in vertical mode. (The spec storyboards are all vertical; a horizontal ride is out of scope for PR 2.)
- Union (marriage) links **fade in** rather than draw — they are dashed (`stroke-dasharray: 2 3`), and the dashoffset draw technique cannot coexist with a dash pattern.
- Era strata numerals use one representative year per generation (median birth year of the band).
- During the ceremony the TimeRail is hidden via opacity (token-driven CSS transition — allowed off-tree per spec §2) and returns at the finale; the backdrop strata are the timeline meanwhile.
- A window resize mid-ceremony is an accepted edge: the timeline keeps writing the viewport each tick and wins; the final state still lands on the precomputed finale. (The ceremony lasts ≤ ~5.3 s for the seed family.)

## File structure

| File | Responsibility |
| --- | --- |
| Create `src/frontend/src/motion/entranceCues.ts` (+spec) | Pure cue sheet: generation phases (nodes/links/timing/camera Y), ride zoom & X, era strata (year, y, side, ride/final X), finale viewport, durations. No DOM, no gsap. |
| Create `src/frontend/src/motion/entrance.ts` (+spec) | GSAP timeline from cues + rendered SVG: hide-set, per-phase draw/fade/settle + camera climb, strata surfacing, step-back + numeral slide + ring pulse, `skip()`, cleanup. |
| Create `src/frontend/src/motion/useEntranceCeremony.ts` (+spec) | Gating: `sessionStorage["oak-entrance-played"]`, deep-link skip, orientation rule, replay, active state, cue lifecycle. |
| Modify `src/frontend/src/components/OakTree.vue` (+spec additions) | `entranceCues` prop → strata layer markup; `data-entrance-*` attributes on branches/unions/nodes; `defineExpose({ entranceTargets })`. |
| Modify `src/frontend/src/views/TreeView.vue` | Wire composable; rail opacity while active; replay button; interruption capture handlers. |
| Modify `src/frontend/src/i18n/messages/{en,ru,be}.ts` | `entrance.replay` — "Grow the tree" / «Вырастить дерево» / «Вырасціць дрэва». |

---

### Task 1: Workspace setup + plan doc

**Files:** Create `docs/superpowers/plans/2026-06-13-oak-entrance-ceremony.md` (copy), `src/frontend` deps.

- [ ] **Step 1:** Verify you are in the fresh worktree on its own branch off current main: `git log --oneline -1` shows main's tip; `git status --porcelain` clean.
- [ ] **Step 2:** Copy this plan into the worktree:

```powershell
Copy-Item C:\Users\perov\Code\My\family-tree\docs\superpowers\plans\2026-06-13-oak-entrance-ceremony.md docs\superpowers\plans\
```

- [ ] **Step 3:** Install deps and verify the baseline: from `src/frontend`: `npm install`, then `npm test` → expected **334 tests / 47 files** pass.
- [ ] **Step 4:** Commit the plan:

```bash
git add docs/superpowers/plans/2026-06-13-oak-entrance-ceremony.md
git commit -m "docs: implementation plan for the oak entrance ceremony

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Cue-sheet builder (pure)

**Files:**
- Create: `src/frontend/src/motion/entranceCues.ts`
- Test: `src/frontend/src/motion/entranceCues.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/src/motion/entranceCues.spec.ts
import { describe, it, expect } from 'vitest';
import { buildLayout } from '../layout/treeLayout';
import { fitToBounds } from '../interactions/panZoom';
import { buildEntranceCues } from './entranceCues';
import type { FamilyGraph, PersonSummary } from '../types/family';

function person(id: string, birthYear: number, parents: Partial<PersonSummary['parents']> = {}): PersonSummary {
  return {
    id,
    givenName: { ru: id, be: null, en: id },
    surname: { ru: null, be: null, en: null },
    maidenName: null,
    sex: 'male',
    birthYear,
    deathYear: null,
    vocation: 'other',
    portrait: null,
    portraitVideo: null,
    parents: { motherId: null, fatherId: null, ...parents },
    marriedIntoFamily: false,
    isDefaultRoot: false
  };
}

// Three generations: grandparent gp (1850) → parent pa (1880) + spouse sp → focus fo (1910)
const graph: FamilyGraph = {
  people: [
    person('gp', 1850),
    person('pa', 1880, { fatherId: 'gp' }),
    person('sp', 1882),
    person('fo', 1910, { fatherId: 'pa', motherId: 'sp' })
  ],
  unions: [
    { id: 'u1', partnerIds: ['gp'], childIds: ['pa'] },
    { id: 'u2', partnerIds: ['pa', 'sp'], childIds: ['fo'] }
  ]
};

const SIZE = { width: 800, height: 600 };

describe('buildEntranceCues', () => {
  const layout = buildLayout(graph, { focusId: 'fo' });
  const cues = buildEntranceCues(layout, SIZE)!;

  it('orders phases oldest generation first and assigns every node exactly once', () => {
    expect(cues).not.toBeNull();
    const gens = cues.phases.map(p => p.generation);
    expect(gens).toEqual([...gens].sort((a, b) => a - b));
    const ids = cues.phases.flatMap(p => p.nodeIds).sort();
    expect(ids).toEqual(layout.nodes.map(n => n.id).sort());
  });

  it('draws each descent link in its target generation phase and fades unions in their band', () => {
    const genOf = new Map(layout.nodes.map(n => [n.id, n.generation]));
    for (const phase of cues.phases) {
      for (const linkId of phase.drawLinkIds) {
        const link = layout.links.find(l => l.id === linkId)!;
        expect(link.kind).toBe('descent');
        expect(genOf.get(link.target)).toBe(phase.generation);
      }
      for (const linkId of phase.fadeLinkIds) {
        const link = layout.links.find(l => l.id === linkId)!;
        expect(link.kind).toBe('union');
        expect(genOf.get(link.target)).toBe(phase.generation);
      }
    }
    const allLinkIds = cues.phases.flatMap(p => [...p.drawLinkIds, ...p.fadeLinkIds]).sort();
    expect(allLinkIds).toEqual(layout.links.map(l => l.id).sort());
  });

  it('rides at fit-width zoom capped at natural size, with a fixed horizontal translate', () => {
    const expectedK = Math.min(1, (SIZE.width - 120) / layout.width);
    expect(cues.rideK).toBeCloseTo(expectedK, 6);
    const centerX = (layout.bounds.minX + layout.bounds.maxX) / 2;
    expect(cues.rideX).toBeCloseTo(SIZE.width / 2 - centerX * cues.rideK, 6);
  });

  it('keeps each phase duration within the calm band and the total under six seconds', () => {
    for (const phase of cues.phases) {
      expect(phase.duration).toBeGreaterThanOrEqual(0.45);
      expect(phase.duration).toBeLessThanOrEqual(0.9);
    }
    expect(cues.total).toBeLessThan(6);
    expect(cues.finaleStart).toBeCloseTo(cues.phases.length * cues.phases[0].duration, 6);
  });

  it('places one stratum per phase, alternating sides, whole inside the ride window', () => {
    expect(cues.strata).toHaveLength(cues.phases.length);
    cues.strata.forEach((stratum, i) => {
      expect(stratum.side).toBe(i % 2 === 0 ? 'right' : 'left');
      const screenX = stratum.rideX * cues.rideK + cues.rideX;
      expect(screenX).toBeCloseTo(stratum.side === 'right' ? SIZE.width - 72 : 72, 4);
      const finalScreenX = stratum.finalX * cues.finale.k + cues.finale.x;
      expect(finalScreenX).toBeCloseTo(stratum.side === 'right' ? SIZE.width - 72 : 72, 4);
      expect(stratum.y).toBeCloseTo(layout.scale.yForYear(stratum.year), 6);
    });
  });

  it('ends on the standard fitted view', () => {
    expect(cues.finale).toEqual(fitToBounds(layout.bounds, SIZE, 60, 1));
  });

  it('anchors the dawn light on the tree centre line', () => {
    expect(cues.dawnX).toBeCloseTo((layout.bounds.minX + layout.bounds.maxX) / 2, 6);
  });

  it('returns null for an empty layout or a degenerate viewport', () => {
    expect(buildEntranceCues({ ...layout, nodes: [] }, SIZE)).toBeNull();
    expect(buildEntranceCues(layout, { width: 0, height: 600 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — must fail:** `npx vitest run src/motion/entranceCues.spec.ts` → cannot resolve `./entranceCues`.

- [ ] **Step 3: Implement**

```ts
// src/frontend/src/motion/entranceCues.ts
import type { TreeLayout, LayoutNode } from '../layout/treeLayout';
import { fitToBounds, type Size, type Viewport } from '../interactions/panZoom';
import { motionTokens } from './tokens';

export interface GenerationPhase {
  generation: number;
  nodeIds: string[];
  drawLinkIds: string[]; // descent links whose target is born in this phase
  fadeLinkIds: string[]; // dashed union links — dashoffset drawing can't coexist with a dash pattern
  bandY: number;         // world y the camera centres on
  cameraY: number;       // precomputed viewport.y for that centring (clamped to content)
  year: number;          // median birth year of the band — the stratum label
  start: number;         // seconds from ceremony start
  duration: number;
}

export interface Stratum {
  year: number;
  label: string;
  y: number;
  side: 'left' | 'right';
  rideX: number;  // world x while riding (whole inside the ride window)
  finalX: number; // world x after the step-back (whole at the screen edge)
  start: number;
}

export interface EntranceCues {
  rideK: number;
  rideX: number; // constant horizontal translate for the whole climb — no sideways motion
  dawnX: number; // world x of the dawn-light glow (the tree's horizontal centre)
  phases: GenerationPhase[];
  strata: Stratum[];
  finale: Viewport;
  finaleStart: number;
  finaleDuration: number;
  total: number;
}

const PADDING = 60;        // matches usePanZoom's fit padding
const MAX_RIDE_K = 1;      // never enlarge cards past natural size
const MIN_PHASE = 0.45;    // seconds — keeps 10-generation families under ~5.3 s total
const MAX_PHASE = 0.9;
const FINALE_DURATION = 0.8;
const STRATUM_MARGIN = 72; // screen px between a numeral anchor and the frame edge

// Pure cue sheet: every number the entrance timeline needs, derived from the
// layout and the viewport size. No DOM, no gsap — fully unit-testable.
export function buildEntranceCues(layout: TreeLayout, size: Size): EntranceCues | null {
  if (layout.nodes.length === 0 || size.width <= 0 || size.height <= 0) {
    return null;
  }

  const byGeneration = new Map<number, LayoutNode[]>();
  for (const node of layout.nodes) {
    const row = byGeneration.get(node.generation) ?? [];
    row.push(node);
    byGeneration.set(node.generation, row);
  }
  const generations = [...byGeneration.keys()].sort((a, b) => a - b);

  const genOf = new Map(layout.nodes.map(node => [node.id, node.generation]));
  const drawByGen = new Map<number, string[]>();
  const fadeByGen = new Map<number, string[]>();
  for (const link of layout.links) {
    const gen = genOf.get(link.target) ?? 0;
    const bucket = link.kind === 'descent' ? drawByGen : fadeByGen;
    const list = bucket.get(gen) ?? [];
    list.push(link.id);
    bucket.set(gen, list);
  }

  const rideK = Math.min(MAX_RIDE_K, (size.width - PADDING * 2) / Math.max(1, layout.width));
  const centerX = (layout.bounds.minX + layout.bounds.maxX) / 2;
  const rideX = size.width / 2 - centerX * rideK;

  // Clamp band centring so the window never overshoots the content vertically.
  const halfWindow = size.height / 2 / rideK;
  const padWorld = PADDING / rideK;
  const cyMin = layout.bounds.minY - padWorld + halfWindow;
  const cyMax = layout.bounds.maxY + padWorld - halfWindow;
  const clampCy = (cy: number): number =>
    cyMin > cyMax
      ? (layout.bounds.minY + layout.bounds.maxY) / 2 // window taller than the tree — no travel
      : Math.min(Math.max(cy, cyMin), cyMax);

  const phaseDuration = Math.min(
    MAX_PHASE,
    Math.max(MIN_PHASE, (motionTokens.ceremony.duration - FINALE_DURATION) / generations.length)
  );

  const phases: GenerationPhase[] = generations.map((generation, i) => {
    const row = byGeneration.get(generation)!;
    const bandY = row.reduce((total, node) => total + node.y, 0) / row.length;
    const years = row.map(node => node.year).sort((a, b) => a - b);
    const year = years[Math.floor(years.length / 2)];
    return {
      generation,
      nodeIds: row.map(node => node.id),
      drawLinkIds: drawByGen.get(generation) ?? [],
      fadeLinkIds: fadeByGen.get(generation) ?? [],
      bandY,
      cameraY: size.height / 2 - clampCy(bandY) * rideK,
      year,
      start: i * phaseDuration,
      duration: phaseDuration
    };
  });

  const finale = fitToBounds(layout.bounds, size, PADDING, MAX_RIDE_K);
  const strata: Stratum[] = phases.map((phase, i) => {
    const side: 'left' | 'right' = i % 2 === 0 ? 'right' : 'left';
    const edge = (margin: number, x: number, k: number): number =>
      side === 'right' ? (size.width - margin - x) / k : (margin - x) / k;
    return {
      year: phase.year,
      label: String(phase.year),
      y: layout.scale.yForYear(phase.year),
      side,
      rideX: edge(STRATUM_MARGIN, rideX, rideK),
      finalX: edge(STRATUM_MARGIN, finale.x, finale.k),
      start: phase.start
    };
  });

  const finaleStart = generations.length * phaseDuration;
  return {
    rideK,
    rideX,
    dawnX: centerX,
    phases,
    strata,
    finale,
    finaleStart,
    finaleDuration: FINALE_DURATION,
    total: finaleStart + FINALE_DURATION
  };
}
```

- [ ] **Step 4: Run — must pass:** `npx vitest run src/motion/entranceCues.spec.ts` → 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/motion/entranceCues.ts src/motion/entranceCues.spec.ts
git commit -m "feat(motion): pure cue sheet for the entrance ceremony

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Entrance timeline builder

**Files:**
- Create: `src/frontend/src/motion/entrance.ts`
- Test: `src/frontend/src/motion/entrance.spec.ts`

- [ ] **Step 1: Write the failing test** (gsap fully mocked; a fake SVG provides `querySelectorAll`)

```ts
// src/frontend/src/motion/entrance.spec.ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { Viewport } from '../interactions/panZoom';
import type { EntranceCues } from './entranceCues';
import { playEntrance } from './entrance';

const mocks = vi.hoisted(() => {
  const timeline = {
    to: vi.fn(function (this: unknown) { return this; }),
    progress: vi.fn(),
    kill: vi.fn()
  };
  return {
    timeline,
    timelineFactory: vi.fn(() => timeline),
    set: vi.fn(),
    killTweensOf: vi.fn()
  };
});
vi.mock('gsap', () => ({
  default: { timeline: mocks.timelineFactory, set: mocks.set, killTweensOf: mocks.killTweensOf }
}));

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && matches,
    media,
    addEventListener() {},
    removeEventListener() {}
  }));
}

const cues: EntranceCues = {
  rideK: 0.8,
  rideX: 40,
  dawnX: 0,
  phases: [
    { generation: -1, nodeIds: ['gp'], drawLinkIds: [], fadeLinkIds: [], bandY: 800, cameraY: -340, year: 1850, start: 0, duration: 0.6 },
    { generation: 0, nodeIds: ['fo'], drawLinkIds: ['d:gp->fo'], fadeLinkIds: [], bandY: 400, cameraY: -20, year: 1910, start: 0.6, duration: 0.6 }
  ],
  strata: [
    { year: 1850, label: '1850', y: 820, side: 'right', rideX: 860, finalX: 1020, start: 0 },
    { year: 1910, label: '1910', y: 420, side: 'left', rideX: -60, finalX: -180, start: 0.6 }
  ],
  finale: { x: 10, y: -5, k: 0.6 },
  finaleStart: 1.2,
  finaleDuration: 0.8,
  total: 2
};

const fakeSvg = { querySelectorAll: () => [] } as unknown as SVGSVGElement;

beforeEach(() => {
  mocks.timelineFactory.mockClear();
  mocks.timeline.to.mockClear();
  mocks.timeline.progress.mockClear();
  mocks.timeline.kill.mockClear();
  mocks.set.mockClear();
  mocks.killTweensOf.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('playEntrance', () => {
  it('under reduced motion: jumps to the finale, reports done, builds no timeline', () => {
    stubMatchMedia(true);
    const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
    const onDone = vi.fn();
    const handle = playEntrance({ svg: fakeSvg, viewport, cues, onDone });
    expect(handle).toBeNull();
    expect(viewport.value).toEqual(cues.finale);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mocks.timelineFactory).not.toHaveBeenCalled();
  });

  it('starts the camera at the oldest band and finishes on the finale via onComplete', () => {
    stubMatchMedia(false);
    const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
    const onDone = vi.fn();
    const handle = playEntrance({ svg: fakeSvg, viewport, cues, onDone });
    expect(handle).not.toBeNull();
    // camera snapped to the ride start before the timeline runs
    expect(viewport.value).toEqual({ x: cues.rideX, y: cues.phases[0].cameraY, k: cues.rideK });
    // camera beats: one tween per phase + the step-back
    const cameraTweens = mocks.timeline.to.mock.calls.filter(call => call[0] && typeof call[0] === 'object' && 'k' in (call[0] as object));
    expect(cameraTweens).toHaveLength(cues.phases.length + 1);
    // completing the timeline lands exactly on the finale and reports done
    const config = mocks.timelineFactory.mock.calls[0][0] as { onComplete: () => void };
    config.onComplete();
    expect(viewport.value).toEqual(cues.finale);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('skip() renders the end state immediately', () => {
    stubMatchMedia(false);
    const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
    const handle = playEntrance({ svg: fakeSvg, viewport, cues, onDone: vi.fn() })!;
    handle.skip();
    expect(mocks.timeline.progress).toHaveBeenCalledWith(1, false);
    expect(mocks.timeline.kill).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — must fail:** `npx vitest run src/motion/entrance.spec.ts` → cannot resolve `./entrance`.

- [ ] **Step 3: Implement**

```ts
// src/frontend/src/motion/entrance.ts
import gsap from 'gsap';
import type { Ref } from 'vue';
import type { Viewport } from '../interactions/panZoom';
import type { EntranceCues } from './entranceCues';
import { prefersReducedMotion } from './reducedMotion';

export interface EntranceContext {
  svg: SVGSVGElement;
  viewport: Ref<Viewport>;
  cues: EntranceCues;
  onDone: () => void;
}

export interface EntranceHandle {
  /** Render the end state immediately (interruption / tap-to-skip). */
  skip(): void;
}

const PULSE_COLOR = '#e3cf93'; // --gilt-light

// jsdom has no getTotalLength; a generous nominal length still draws correctly
// (overshoot only makes the draw finish marginally early).
function pathLength(el: Element): number {
  const path = el as SVGPathElement;
  return typeof path.getTotalLength === 'function' ? Math.max(1, path.getTotalLength()) : 1000;
}

// Build and start the ceremony timeline. The caller has already rendered the
// FULL tree (state first) — this only choreographs its appearance. Under
// reduced motion it applies the end state instantly and returns null.
export function playEntrance(ctx: EntranceContext): EntranceHandle | null {
  const { svg, viewport, cues, onDone } = ctx;
  if (prefersReducedMotion()) {
    viewport.value = { ...cues.finale };
    onDone();
    return null;
  }

  const sel = (query: string): Element[] => Array.from(svg.querySelectorAll(query));
  const touched: Element[] = [];
  const camera = { x: cues.rideX, y: cues.phases[0]?.cameraY ?? cues.finale.y, k: cues.rideK };
  const syncCamera = (): void => {
    viewport.value = { x: camera.x, y: camera.y, k: camera.k };
  };

  function finish(): void {
    gsap.killTweensOf(touched);
    gsap.set(touched, { clearProps: 'all' });
    viewport.value = { ...cues.finale };
    onDone();
  }

  const tl = gsap.timeline({ onComplete: finish, defaults: { ease: 'power2.inOut' } });

  // Camera to the roots before the first painted frame of the ceremony.
  syncCamera();

  // The dawn light: a soft gilt glow riding the growth front up the trunk line.
  const dawn = sel('[data-entrance-dawn]');
  touched.push(...dawn);
  if (dawn.length) {
    gsap.set(dawn, { opacity: 0, attr: { cy: cues.phases[0]?.bandY ?? 0 } });
    tl.to(dawn, { opacity: 1, duration: 0.3 }, 0);
    tl.to(dawn, { opacity: 0, duration: 0.3 }, cues.finaleStart);
  }

  for (const phase of cues.phases) {
    const nodes = sel(`[data-entrance-node="${phase.generation}"]`);
    const draws = sel(`[data-entrance-draw="${phase.generation}"]`);
    const fades = sel(`[data-entrance-fade="${phase.generation}"]`);
    const stratum = sel(`[data-stratum="${phase.year}"]`);
    touched.push(...nodes, ...draws, ...fades, ...stratum);

    // Hide everything this phase reveals (synchronous — before the browser paints).
    gsap.set(nodes, { opacity: 0 });
    gsap.set(fades, { opacity: 0 });
    gsap.set(stratum, { opacity: 0, y: 12 });
    for (const el of draws) {
      const length = pathLength(el);
      gsap.set(el, { strokeDasharray: length, strokeDashoffset: length });
    }

    // The camera climbs to the generation's band across the phase; the dawn
    // glow rides the same beat along the trunk line.
    tl.to(camera, { y: phase.cameraY, duration: phase.duration, onUpdate: syncCamera }, phase.start);
    if (dawn.length) {
      tl.to(dawn, { attr: { cy: phase.bandY }, duration: phase.duration }, phase.start);
    }
    if (draws.length) {
      tl.to(
        draws,
        { strokeDashoffset: 0, duration: phase.duration * 0.7, stagger: phase.duration * 0.05 },
        phase.start
      );
    }
    if (fades.length) {
      tl.to(fades, { opacity: 1, duration: phase.duration * 0.4 }, phase.start + phase.duration * 0.4);
    }
    if (nodes.length) {
      // Medallions settle just behind the growth front.
      tl.to(
        nodes,
        {
          opacity: 1,
          duration: phase.duration * 0.5,
          stagger: Math.min(0.05, (phase.duration * 0.3) / Math.max(1, nodes.length))
        },
        phase.start + phase.duration * 0.35
      );
    }
    if (stratum.length) {
      // The era surfaces from the parchment as the growth front arrives.
      tl.to(stratum, { opacity: 1, y: 0, duration: Math.min(0.5, phase.duration) }, phase.start);
    }
  }

  // Step-back reveal: the fitted view, numerals gliding out to the screen edges.
  tl.to(
    camera,
    { x: cues.finale.x, y: cues.finale.y, k: cues.finale.k, duration: cues.finaleDuration, onUpdate: syncCamera },
    cues.finaleStart
  );
  for (const stratum of cues.strata) {
    const numerals = sel(`[data-stratum="${stratum.year}"] text`);
    touched.push(...numerals);
    if (numerals.length) {
      tl.to(numerals, { attr: { x: stratum.finalX }, duration: cues.finaleDuration }, cues.finaleStart);
    }
  }
  // Every ring pulses gilt once — the family, complete.
  const rings = sel('.oak__gilt-band');
  touched.push(...rings);
  if (rings.length) {
    tl.to(
      rings,
      { stroke: PULSE_COLOR, strokeWidth: '+=1.5', duration: 0.18, yoyo: true, repeat: 1 },
      cues.finaleStart + cues.finaleDuration * 0.5
    );
  }

  return {
    skip(): void {
      tl.progress(1, false); // renders the end state and fires onComplete → finish()
      tl.kill();
    }
  };
}
```

- [ ] **Step 4: Run — must pass:** `npx vitest run src/motion/entrance.spec.ts` → 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/motion/entrance.ts src/motion/entrance.spec.ts
git commit -m "feat(motion): entrance ceremony timeline builder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: OakTree renders the entrance hooks

**Files:**
- Modify: `src/frontend/src/components/OakTree.vue`
- Test: `src/frontend/src/components/OakTree.spec.ts` (extend)

- [ ] **Step 1: Extend the spec — failing tests.** Read `OakTree.spec.ts` first; it has a hoisted gsap mock, a `graph` fixture, `buildLayout` usage, and Pinia setup. Add at the top of the file with the other imports:

```ts
import { buildEntranceCues } from '../motion/entranceCues';
```

and inside the existing `describe`:

```ts
  it('renders the era strata layer only when entrance cues are provided', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const cues = buildEntranceCues(layout, { width: 800, height: 600 })!;
    const without = mount(OakTree, { props: { layout } });
    expect(without.find('[data-test="strata"]').exists()).toBe(false);
    const wrapper = mount(OakTree, { props: { layout, entranceCues: cues } });
    expect(wrapper.find('[data-test="strata"]').exists()).toBe(true);
    expect(wrapper.findAll('.oak__stratum')).toHaveLength(cues.strata.length);
  });

  it('tags branches, unions and nodes with their entrance generation', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    const genOf = new Map(layout.nodes.map(n => [n.id, n.generation]));
    for (const branch of wrapper.findAll('[data-test="branch"]')) {
      const gen = Number(branch.attributes('data-entrance-draw'));
      const link = layout.links.find(l => l.id === branch.attributes('data-link-id'))!;
      expect(gen).toBe(genOf.get(link.target));
    }
    for (const node of wrapper.findAll('[data-test="node"]')) {
      expect(node.attributes('data-entrance-node')).toBeDefined();
    }
  });

  it('renders the dawn-light glow alongside the strata', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const cues = buildEntranceCues(layout, { width: 800, height: 600 })!;
    const wrapper = mount(OakTree, { props: { layout, entranceCues: cues } });
    const dawn = wrapper.find('[data-entrance-dawn]');
    expect(dawn.exists()).toBe(true);
    expect(Number(dawn.attributes('cx'))).toBeCloseTo(cues.dawnX, 4);
  });

  it('exposes entrance targets (svg element + the live viewport ref)', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    const targets = (wrapper.vm as unknown as { entranceTargets: () => { svg: SVGSVGElement | null; viewport: { value: { k: number } } } }).entranceTargets();
    expect(targets.svg).toBe(wrapper.find('svg').element);
    expect(typeof targets.viewport.value.k).toBe('number');
  });
```

- [ ] **Step 2: Run — must fail:** `npx vitest run src/components/OakTree.spec.ts` → the four new tests fail (no prop, no attrs, no dawn, no expose); existing tests pass.

- [ ] **Step 3: Implement in OakTree.vue.** Read the file first.

(a) Script — extend the props and add imports/helpers:

```ts
import type { EntranceCues } from '../motion/entranceCues';
```

```ts
const props = defineProps<{
  layout: TreeLayout;
  selectedId?: string | null;
  orientation?: 'vertical' | 'horizontal';
  centerRequest?: CenterRequest | null;
  entranceCues?: EntranceCues | null;
}>();
```

After the `unionLinks` computed, add:

```ts
// Entrance hooks: every link/node is tagged with the generation whose ceremony
// phase reveals it (a link belongs to the generation of its target).
const generationById = computed(() => new Map(props.layout.nodes.map(node => [node.id, node.generation])));
function linkGeneration(link: LayoutLink): number {
  return generationById.value.get(link.target) ?? 0;
}

// The ceremony composable needs the raw refs; template-ref exposure would
// auto-unwrap them, so hand them out through a function instead.
defineExpose({
  entranceTargets: () => ({ svg: svgRef.value, viewport })
});
```

(b) Template — first child inside `<g class="oak__viewport" …>` (BEFORE `<g class="oak__branches">` — the strata are the third plan, behind everything):

```html
      <g v-if="entranceCues" class="oak__strata" aria-hidden="true" data-test="strata">
        <g v-for="s in entranceCues.strata" :key="s.year" class="oak__stratum" :data-stratum="s.year">
          <line
            class="oak__stratum-line"
            :x1="layout.bounds.minX - 400" :x2="layout.bounds.maxX + 400" :y1="s.y" :y2="s.y"
          />
          <text
            class="oak__stratum-year"
            :x="s.rideX" :y="s.y - 12"
            :text-anchor="s.side === 'right' ? 'end' : 'start'"
          >{{ s.label }}</text>
        </g>
        <!-- second plan: the dawn light the ceremony drives up the trunk line -->
        <circle
          data-entrance-dawn
          :cx="entranceCues.dawnX"
          :cy="entranceCues.phases[0]?.bandY ?? 0"
          r="120"
          fill="url(#oak-dawn)"
        />
      </g>
```

and in `<defs>` (next to the existing gradients):

```html
      <radialGradient id="oak-dawn">
        <stop offset="0%" stop-color="#e3cf93" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#e3cf93" stop-opacity="0" />
      </radialGradient>
```

The branch `<path>` gains two attributes (`data-link-id` for the spec's lookup, the draw tag for the ceremony):

```html
          :data-link-id="link.id"
          :data-entrance-draw="linkGeneration(link)"
```

The union `<line>` gains:

```html
          :data-entrance-fade="linkGeneration(link)"
```

The node `<g>` (the one with `data-test="node"`) gains:

```html
          :data-entrance-node="node.generation"
```

(c) Style — inside the `.oak { … }` block:

```scss
  &__stratum-line {
    stroke: var(--ink-soft);
    stroke-width: 1;
    opacity: 0.16;
  }
  &__stratum-year {
    font-family: var(--font-display);
    font-size: 64px;
    fill: var(--gilt);
    fill-opacity: 0.16;
  }
```

- [ ] **Step 4: Run — must pass:** `npx vitest run src/components/OakTree.spec.ts` → all pass (15 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/OakTree.vue src/components/OakTree.spec.ts
git commit -m "feat(oak): era strata layer and entrance generation tags

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Gating composable

**Files:**
- Create: `src/frontend/src/motion/useEntranceCeremony.ts`
- Test: `src/frontend/src/motion/useEntranceCeremony.spec.ts`

- [ ] **Step 1: Write the failing test** (entrance module mocked; storage injected; everything else real)

```ts
// src/frontend/src/motion/useEntranceCeremony.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick, ref } from 'vue';
import { buildLayout, type TreeLayout } from '../layout/treeLayout';
import type { Viewport } from '../interactions/panZoom';
import { useEntranceCeremony, ENTRANCE_PLAYED_KEY } from './useEntranceCeremony';
import type { FamilyGraph, PersonSummary } from '../types/family';

const { playEntranceMock } = vi.hoisted(() => ({
  playEntranceMock: vi.fn()
}));
vi.mock('./entrance', () => ({ playEntrance: playEntranceMock }));

function person(id: string, birthYear: number, parents: Partial<PersonSummary['parents']> = {}): PersonSummary {
  return {
    id,
    givenName: { ru: id, be: null, en: id },
    surname: { ru: null, be: null, en: null },
    maidenName: null,
    sex: 'male',
    birthYear,
    deathYear: null,
    vocation: 'other',
    portrait: null,
    portraitVideo: null,
    parents: { motherId: null, fatherId: null, ...parents },
    marriedIntoFamily: false,
    isDefaultRoot: false
  };
}

const graph: FamilyGraph = {
  people: [person('gp', 1850), person('fo', 1910, { fatherId: 'gp' })],
  unions: [{ id: 'u1', partnerIds: ['gp'], childIds: ['fo'] }]
};

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; }
  } as Storage;
}

function fakeOak() {
  const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
  const svg = {
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 800, height: 600 })
  } as unknown as SVGSVGElement;
  return { entranceTargets: () => ({ svg, viewport }) };
}

function harness(opts: { deepLink?: boolean; orientation?: 'vertical' | 'horizontal'; storage?: Storage } = {}) {
  const storage = opts.storage ?? fakeStorage();
  const layout = ref<TreeLayout | null>(null);
  const orientation = ref<'vertical' | 'horizontal'>(opts.orientation ?? 'vertical');
  const oak = ref<ReturnType<typeof fakeOak> | null>(null);
  const ceremony = useEntranceCeremony({
    layout,
    orientation,
    oak,
    isDeepLink: () => opts.deepLink ?? false,
    storage
  });
  return { storage, layout, orientation, oak, ceremony };
}

beforeEach(() => {
  playEntranceMock.mockReset().mockReturnValue({ skip: vi.fn() });
});

describe('useEntranceCeremony', () => {
  it('auto-plays once when oak and layout become ready, and marks the session', async () => {
    const h = harness();
    h.layout.value = buildLayout(graph, { focusId: 'fo' });
    h.oak.value = fakeOak();
    await nextTick(); // watcher (post flush)
    await nextTick(); // strata render tick before playEntrance
    expect(playEntranceMock).toHaveBeenCalledTimes(1);
    expect(h.storage.getItem(ENTRANCE_PLAYED_KEY)).toBe('1');
    expect(h.ceremony.active.value).toBe(true);
  });

  it('does not auto-play again in the same session, but replay() forces it', async () => {
    const storage = fakeStorage();
    storage.setItem(ENTRANCE_PLAYED_KEY, '1');
    const h = harness({ storage });
    h.layout.value = buildLayout(graph, { focusId: 'fo' });
    h.oak.value = fakeOak();
    await nextTick();
    await nextTick();
    expect(playEntranceMock).not.toHaveBeenCalled();
    h.ceremony.replay();
    await nextTick();
    expect(playEntranceMock).toHaveBeenCalledTimes(1);
  });

  it('a deep link marks the session played without playing', async () => {
    const h = harness({ deepLink: true });
    h.layout.value = buildLayout(graph, { focusId: 'fo' });
    h.oak.value = fakeOak();
    await nextTick();
    await nextTick();
    expect(playEntranceMock).not.toHaveBeenCalled();
    expect(h.storage.getItem(ENTRANCE_PLAYED_KEY)).toBe('1');
  });

  it('horizontal orientation marks played without playing, and hides replay', async () => {
    const h = harness({ orientation: 'horizontal' });
    h.layout.value = buildLayout(graph, { focusId: 'fo' });
    h.oak.value = fakeOak();
    await nextTick();
    await nextTick();
    expect(playEntranceMock).not.toHaveBeenCalled();
    expect(h.storage.getItem(ENTRANCE_PLAYED_KEY)).toBe('1');
    expect(h.ceremony.canReplay.value).toBe(false);
  });

  it('clears active and cues when the ceremony reports done', async () => {
    const h = harness();
    h.layout.value = buildLayout(graph, { focusId: 'fo' });
    h.oak.value = fakeOak();
    await nextTick();
    await nextTick();
    const ctx = playEntranceMock.mock.calls[0][0] as { onDone: () => void };
    ctx.onDone();
    expect(h.ceremony.active.value).toBe(false);
    expect(h.ceremony.cues.value).toBeNull();
  });

  it('skip() is a safe no-op when nothing is playing', () => {
    const h = harness();
    expect(() => h.ceremony.skip()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run — must fail:** `npx vitest run src/motion/useEntranceCeremony.spec.ts` → cannot resolve `./useEntranceCeremony`.

- [ ] **Step 3: Implement**

```ts
// src/frontend/src/motion/useEntranceCeremony.ts
import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { TreeLayout } from '../layout/treeLayout';
import type { Viewport } from '../interactions/panZoom';
import { buildEntranceCues, type EntranceCues } from './entranceCues';
import { playEntrance, type EntranceHandle } from './entrance';
import { prefersReducedMotion } from './reducedMotion';

export const ENTRANCE_PLAYED_KEY = 'oak-entrance-played';

export interface EntranceOakTargets {
  svg: SVGSVGElement | null;
  viewport: Ref<Viewport>;
}

export interface UseEntranceCeremonyOptions {
  layout: Ref<TreeLayout | null>;
  orientation: Ref<'vertical' | 'horizontal'>;
  oak: Ref<{ entranceTargets(): EntranceOakTargets } | null>;
  isDeepLink: () => boolean;
  /** Injectable for tests; defaults to sessionStorage (once per browser session). */
  storage?: Storage;
}

export interface EntranceCeremony {
  cues: Ref<EntranceCues | null>;
  active: Ref<boolean>;
  canReplay: ComputedRef<boolean>;
  replay: () => void;
  skip: () => void;
}

// Owns WHEN the ceremony runs: once per session, skipped for deep links and
// horizontal orientation, replayable on demand. HOW it runs lives in
// entrance.ts; WHAT it animates comes from entranceCues.ts.
export function useEntranceCeremony(options: UseEntranceCeremonyOptions): EntranceCeremony {
  const storage = options.storage ?? sessionStorage;
  const cues = ref<EntranceCues | null>(null);
  const active = ref(false);
  let handle: EntranceHandle | null = null;

  const played = (): boolean => storage.getItem(ENTRANCE_PLAYED_KEY) === '1';
  const markPlayed = (): void => storage.setItem(ENTRANCE_PLAYED_KEY, '1');

  function start(): void {
    const oak = options.oak.value;
    const layout = options.layout.value;
    if (!oak || !layout || active.value) {
      return;
    }
    markPlayed();
    if (options.orientation.value !== 'vertical') {
      return;
    }
    const targets = oak.entranceTargets();
    if (!targets.svg) {
      return;
    }
    const rect = targets.svg.getBoundingClientRect();
    const built = buildEntranceCues(layout, { width: rect.width, height: rect.height });
    if (!built) {
      return;
    }
    cues.value = built;
    active.value = true;
    // The strata layer must be in the DOM before the timeline queries it.
    void nextTick(() => {
      handle = playEntrance({
        svg: targets.svg!,
        viewport: targets.viewport,
        cues: built,
        onDone: () => {
          active.value = false;
          cues.value = null;
          handle = null;
        }
      });
    });
  }

  // Auto-play when the oak and the layout are first ready in this session.
  watch(
    [options.oak, options.layout],
    ([oak, layout]) => {
      if (!oak || !layout || played()) {
        return;
      }
      if (options.isDeepLink()) {
        markPlayed();
        return;
      }
      start();
    },
    { flush: 'post' }
  );

  // Note: prefersReducedMotion() is re-read whenever a dependency changes; an
  // OS toggle mid-session is picked up on the next layout/orientation change.
  const canReplay = computed(
    () =>
      !active.value &&
      options.layout.value !== null &&
      options.orientation.value === 'vertical' &&
      !prefersReducedMotion()
  );

  return {
    cues,
    active,
    canReplay,
    replay: start,
    skip: () => handle?.skip()
  };
}
```

- [ ] **Step 4: Run — must pass:** `npx vitest run src/motion/useEntranceCeremony.spec.ts` → 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/motion/useEntranceCeremony.ts src/motion/useEntranceCeremony.spec.ts
git commit -m "feat(motion): once-per-session entrance gating with replay

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: TreeView wiring, replay button, i18n

**Files:**
- Modify: `src/frontend/src/views/TreeView.vue`
- Modify: `src/frontend/src/i18n/messages/en.ts`, `ru.ts`, `be.ts`

The gating logic is fully unit-tested in Task 5; this task is thin template wiring, verified by the full suite (TreeView.spec mounts must stay green) and live in Task 7.

- [ ] **Step 1: i18n keys.** In each messages file, add a top-level `entrance` section (after the `search` section, matching each file's style):

`en.ts`: `entrance: { replay: 'Grow the tree' },`
`ru.ts`: `entrance: { replay: 'Вырастить дерево' },`
`be.ts`: `entrance: { replay: 'Вырасціць дрэва' },`

- [ ] **Step 2: TreeView script.** Read the file first. Add imports:

```ts
import { useEntranceCeremony } from '../motion/useEntranceCeremony';
```

After the `layout` computed (`const layout = computed(...)`), add:

```ts
// Entrance ceremony: once per session the oak grows from its roots. The oak
// component hands out its svg + viewport refs; this view owns the gating,
// the replay control, and tap-to-skip.
const oakRef = ref<InstanceType<typeof OakTree> | null>(null);
const { cues: entranceCues, active: entranceActive, canReplay, replay, skip: skipEntrance } = useEntranceCeremony({
  layout,
  orientation: computed(() => ui.orientation),
  oak: oakRef,
  isDeepLink: () => route.name === 'person'
});
```

- [ ] **Step 3: TreeView template.** The rail line becomes (hidden during the ceremony, returning on a token-driven fade):

```html
      <TimeRail
        class="tree-view__rail"
        :scale="layout.scale"
        :viewport="oakViewport"
        :orientation="ui.orientation"
        :style="{ opacity: entranceActive ? 0 : 1, transition: 'opacity var(--motion-fade-ms) ease' }"
      />
```

The oak container gains capture-phase interruption handlers and the replay button; the OakTree gets the ref + cues:

```html
      <div
        class="tree-view__oak"
        @pointerdown.capture="skipEntrance"
        @wheel.capture="skipEntrance"
        @touchstart.capture="skipEntrance"
        @keydown.capture="skipEntrance"
      >
        <OakTree ref="oakRef" :layout="layout" :selected-id="selectedId" :orientation="ui.orientation" :center-request="centerRequest" :entrance-cues="entranceCues" @select="onSelect" @viewport="onViewport" />
        <button
          v-if="canReplay"
          type="button"
          class="tree-view__replay"
          data-test="entrance-replay"
          :aria-label="t('entrance.replay')"
          @click="replay"
        >&#10227; {{ t('entrance.replay') }}</button>
      </div>
```

- [ ] **Step 4: TreeView style.** Inside `.tree-view { … }`:

```scss
  &__replay {
    position: absolute; right: 14px; bottom: 14px; z-index: 2;
    display: inline-flex; align-items: center; gap: 7px;
    padding: 7px 14px; border-radius: 9px; cursor: pointer;
    background: linear-gradient(#f8f2df, #f1e7cb);
    border: 1px solid var(--gilt); color: var(--ink);
    font-family: var(--font-display); font-size: 14px; letter-spacing: 0.4px;
    box-shadow: 0 4px 12px var(--shadow);
    &:hover { border-color: var(--gilt-deep); }
    &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  }
```

(The button must be a child of `.tree-view__oak`, which is `position: relative` already.)

- [ ] **Step 5: Full suite + build:**

`npm test` → expected **355 tests / 50 files** (334 + 8 cues + 3 entrance + 4 OakTree + 6 gating; file count 47 + 3). If `TreeView.spec.ts` fails on the new wiring (e.g. sessionStorage gating auto-playing in its mounts), the correct fix is: in `TreeView.spec.ts`'s `beforeEach`, add `sessionStorage.setItem('oak-entrance-played', '1');` (import the key from `../motion/useEntranceCeremony` if preferred) so view tests never start a ceremony — report this in your summary if applied.
`npm run build` → vue-tsc + vite green.

- [ ] **Step 6: Commit**

```bash
git add src/views/TreeView.vue src/i18n/messages/en.ts src/i18n/messages/ru.ts src/i18n/messages/be.ts
git commit -m "feat(tree): wire the entrance ceremony — replay control, rail handoff, tap-to-skip

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(Include `src/views/TreeView.spec.ts` in the add if Step 5's gating line was needed.)

---

### Task 7: Gates + live verification

**Run all from the worktree.**

- [ ] **Step 1:** `npm test` → all pass (expected 355/50). `npm run build` → green. From the worktree root: `dotnet test` → 42/42.

- [ ] **Step 2: Live verification (controller-assisted — preview tools live in the session).** Known environment facts: `preview_start` resolves `.claude/launch.json` against the MAIN checkout, so a temporary config must point npm at this worktree on a spare port (e.g. `"runtimeArgs": ["--prefix", "<worktree>\\src\\frontend", "run", "dev", "--", "--port", "5199"]`), reverted afterwards; the API runs separately (`dotnet run --project src/backend/FamilyTree.Api`). The headless preview window is `document.hidden`, which **freezes GSAP's ticker** — the ceremony will hold at its first frame. Verify accordingly:

  1. Fresh state: `sessionStorage.clear()` + reload, enter the tree. Expect: strata layer present (`[data-test="strata"]`), branches hidden (`strokeDashoffset > 0` inline on `[data-entrance-draw]`), nodes at `opacity: 0`, viewport at ride start (k = rideK, not the fitted k) — all set synchronously despite the frozen ticker.
  2. Skip path: dispatch a `pointerdown` on the oak svg → expect viewport == finale, all inline entrance props cleared, strata layer unmounted (`cues` null), rail visible again.
  3. Reload (same session) → ceremony does NOT restart (sessionStorage gate); replay button present; clicking it re-enters state 1; skip again.
  4. Deep link: `sessionStorage.clear()`, navigate to `/person/<id>` directly, reload → no ceremony, tree fully visible.
  5. Reduced motion: emulate via CDP if available, else assert `playEntrance`'s reduced path through unit tests only (already covered).
  6. Console: zero errors/warnings throughout.

- [ ] **Step 3:** The full visual run (smoothness, pacing, the dawn of each era) can only be judged in a visible browser — flag to the owner to watch it at http://localhost:5199 (or the dev server of their choice) before merging.

---

### Task 8: PR

- [ ] **Step 1:** `git push -u origin HEAD:feat/oak-ceremony`
- [ ] **Step 2:** `gh pr create --base main --head feat/oak-ceremony --title "The oak grows: once a session, the family rises from its roots"` with a body summarizing: the three new motion files + their test counts, the OakTree/TreeView wiring, scope decisions (vertical-only auto-play, fading unions), the live-verification results, and the owner to-do (watch the ceremony in a visible browser). End the body with the Claude Code attribution line.
- [ ] **Step 3:** Stop — the owner reviews and merges.

---

## Self-review notes (for the executor)

- **Spec §3 coverage:** all three plans (strata layer ✓ behind branches; dawn light ✓ — a radial-gradient circle, no SVG filters, riding `phase.bandY` on the same beats as the camera; oak draw ✓), growth-front sync (phase windows shared by links/nodes/strata/dawn ✓), camera policy (fit-width ride, vertical-only climb, no lateral tracking, clamped band centring, step-back ✓), backdrop year placement (ride window + corner glide, computed from both camera windows ✓), rules table (session gate ✓, deep-link skip ✓, interruption ✓, replay ✓ named "Grow the tree" with ru/be strings from the spec, reduced motion ✓, duration budget ✓ via phase clamps).
- **Known sequencing trap from PR 1:** never capture pre-patch state in child pre-watchers; not applicable here (the ceremony hides elements via gsap.set before first paint, no captures), but if review feedback adds state-driven tweens, use `onBeforeUpdate`.
- **Type consistency:** `EntranceCues`/`GenerationPhase`/`Stratum` defined once in entranceCues.ts and imported everywhere; `entranceTargets()` returns `{ svg, viewport }` — matches between OakTree's expose, the composable's `EntranceOakTargets`, and entrance.ts's context.
