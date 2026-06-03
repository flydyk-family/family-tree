# Frontend Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the oak interactive — pan/zoom (drag + wheel on desktop, one-finger pan + pinch on touch), select a member to open a localized glass popup (normal + expanded layouts), and deep-link to a member via `/person/:id`.

**Architecture:** Pure, unit-tested math/format modules (`panZoom`, `lifespan`) drive thin Vue components, mirroring the existing `timeScale`/`treeLayout` split. Viewport math is screen-space so the SVG uses a transform group instead of a fitted `viewBox`. Selection + popup state lives in a Pinia `selectionStore`; the popup's open/closed state derives from the route param so in-app clicks and `/person/:id` deep links share one path. All popup data fields render through the existing `localize(text, locale)` helper; all UI labels through vue-i18n `t()`.

**Tech Stack:** Vue 3 (`<script setup>`, Composition API) + TypeScript, Pinia, Vue Router, vue-i18n, SCSS, Vitest + Vue Test Utils.

**Spec references:** `docs/superpowers/specs/2026-06-03-family-tree-design.md` §5 (data model used by the popup), §7 (glass popup: normal + expanded layouts, responsive), §9 (routes, Pinia state, pan/zoom, select → popup).

---

## File Structure

**New files**
- `src/frontend/src/types/family.ts` — *modify*: add `LifeEvent`, `Residence`, `SocialLink`, `PersonDetail`.
- `src/frontend/src/api/familyApi.ts` — *modify*: add `fetchPerson(id)`.
- `src/frontend/src/api/familyApi.spec.ts` — *modify*: cover `fetchPerson`.
- `src/frontend/src/format/lifespan.ts` — *new*: pure `formatLifespan(birth, death)`.
- `src/frontend/src/format/lifespan.spec.ts` — *new*.
- `src/frontend/src/interactions/panZoom.ts` — *new*: pure viewport math.
- `src/frontend/src/interactions/panZoom.spec.ts` — *new*.
- `src/frontend/src/interactions/usePanZoom.ts` — *new*: composable wiring DOM events → viewport math.
- `src/frontend/src/interactions/usePanZoom.spec.ts` — *new*.
- `src/frontend/src/stores/selectionStore.ts` — *new*: selected person + popup mode + fetched detail.
- `src/frontend/src/stores/selectionStore.spec.ts` — *new*.
- `src/frontend/src/components/PersonPopup.vue` — *new*: glass popup (normal + expanded).
- `src/frontend/src/components/PersonPopup.spec.ts` — *new*.

**Modified files**
- `src/frontend/src/components/OakTree.vue` — wrap content in a pan/zoom transform group; emit `select`; node keyboard a11y; highlight selected node.
- `src/frontend/src/components/OakTree.spec.ts` — assert select emit + selected highlight.
- `src/frontend/src/views/TreeView.vue` — render popup from route param; wire select → router push; pass selected id to OakTree.
- `src/frontend/src/views/TreeView.spec.ts` — cover select → popup-open via route.
- `src/frontend/src/router/index.ts` — add `/person/:id` route.
- `src/frontend/src/i18n/messages/{ru,be,en}.ts` — add `person`, `vocation`, `social` label namespaces.
- `src/frontend/src/i18n/messages/messages.spec.ts` — *new*: assert catalog key parity across locales.
- `src/frontend/src/styles/tokens.scss` — add glass CSS custom properties.

---

## Task 1: Person detail types + `fetchPerson` API

**Files:**
- Modify: `src/frontend/src/types/family.ts`
- Modify: `src/frontend/src/api/familyApi.ts`
- Test: `src/frontend/src/api/familyApi.spec.ts`

These types mirror the backend `PersonDto` (camelCase JSON). `birth.place`, `residence.place` are `LocalizedText`.

- [ ] **Step 1: Add the detail types**

Append to `src/frontend/src/types/family.ts` (keep existing `LocalizedText`, `ParentsRef`, `PersonSummary`, `Union`, `FamilyGraph`):

```ts
export interface LifeEvent {
  year: number | null;
  month: number | null;
  day: number | null;
  approx: boolean;
  place: LocalizedText | null;
}

export interface Residence {
  place: LocalizedText;
  fromYear: number | null;
  toYear: number | null;
  mapUrl: string | null;
}

export interface SocialLink {
  type: string;
  url: string;
}

export interface PersonDetail {
  id: string;
  givenName: LocalizedText;
  surname: LocalizedText;
  maidenName: LocalizedText | null;
  sex: string;
  birth: LifeEvent;
  death: LifeEvent | null;
  vocation: string;
  summary: LocalizedText | null;
  biography: LocalizedText | null;
  portrait: string | null;
  gallery: string[];
  links: SocialLink[];
  residences: Residence[];
  parents: ParentsRef;
  marriedIntoFamily: boolean;
  isDefaultRoot: boolean;
}
```

- [ ] **Step 2: Write the failing test for `fetchPerson`**

Add to `src/frontend/src/api/familyApi.spec.ts` (inside the file, after the existing `describe`):

```ts
import { fetchPerson } from './familyApi';
import type { PersonDetail } from '../types/family';

const detail = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: null, en: 'Tadeusz' }
} as unknown as PersonDetail;

describe('fetchPerson', () => {
  it('requests the person endpoint and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => detail });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchPerson('p-0016');

    expect(fetchMock).toHaveBeenCalledWith('/api/people/p-0016');
    expect(result).toEqual(detail);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(fetchPerson('missing')).rejects.toThrow('404');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm --prefix src/frontend test -- familyApi`
Expected: FAIL — `fetchPerson` is not exported.

- [ ] **Step 4: Implement `fetchPerson`**

Append to `src/frontend/src/api/familyApi.ts`:

```ts
import type { FamilyGraph, PersonDetail } from '../types/family';

// ...existing fetchFamilyGraph unchanged...

export async function fetchPerson(id: string, baseUrl = ''): Promise<PersonDetail> {
  const response = await fetch(`${baseUrl}/api/people/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to load person ${id}: ${response.status}`);
  }
  return (await response.json()) as PersonDetail;
}
```

(Merge the `PersonDetail` import into the existing `import type { FamilyGraph } from '../types/family';` line.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix src/frontend test -- familyApi`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/types/family.ts src/frontend/src/api/familyApi.ts src/frontend/src/api/familyApi.spec.ts
git commit -m "feat(frontend): add PersonDetail types and fetchPerson API"
```

---

## Task 2: `formatLifespan` pure formatter

Locale-neutral year range for the popup: years only, `~` prefix for approximate dates, en-dash separator, living person shows an open-ended range.

**Files:**
- Create: `src/frontend/src/format/lifespan.ts`
- Test: `src/frontend/src/format/lifespan.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/format/lifespan.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatLifespan } from './lifespan';
import type { LifeEvent } from '../types/family';

const ev = (year: number | null, approx = false): LifeEvent => ({
  year, month: null, day: null, approx, place: null
});

describe('formatLifespan', () => {
  it('renders birth and death years separated by an en dash', () => {
    expect(formatLifespan(ev(1762), ev(1828))).toBe('1762–1828');
  });

  it('marks approximate years with a leading tilde', () => {
    expect(formatLifespan(ev(1762, true), ev(1828, true))).toBe('~1762–~1828');
  });

  it('leaves the death side open for a living person', () => {
    expect(formatLifespan(ev(1962), null)).toBe('1962–');
  });

  it('renders only the death year when birth year is unknown', () => {
    expect(formatLifespan(ev(null), ev(1900))).toBe('–1900');
  });

  it('returns an empty string when no years are known', () => {
    expect(formatLifespan(ev(null), null)).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix src/frontend test -- lifespan`
Expected: FAIL — `formatLifespan` not found.

- [ ] **Step 3: Implement the formatter**

Create `src/frontend/src/format/lifespan.ts`:

```ts
import type { LifeEvent } from '../types/family';

function year(event: LifeEvent | null): string {
  if (!event || event.year == null) {
    return '';
  }
  return `${event.approx ? '~' : ''}${event.year}`;
}

// Locale-neutral lifespan: "1762–1828", "~1762–~1828", "1962–" (living),
// "–1900" (unknown birth), or "" when nothing is known.
export function formatLifespan(birth: LifeEvent | null, death: LifeEvent | null): string {
  const birthText = year(birth);
  const deathText = year(death);
  if (birthText === '' && deathText === '') {
    return '';
  }
  return `${birthText}–${deathText}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix src/frontend test -- lifespan`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/format/lifespan.ts src/frontend/src/format/lifespan.spec.ts
git commit -m "feat(frontend): add locale-neutral formatLifespan helper"
```

---

## Task 3: `panZoom` pure viewport math

A `Viewport` is `{ x, y, k }` in **screen-pixel space**: a content point `c` maps to screen `x + c*k`. All functions are pure so they are fully unit-tested; the composable (Task 4) only wires DOM events to these.

**Files:**
- Create: `src/frontend/src/interactions/panZoom.ts`
- Test: `src/frontend/src/interactions/panZoom.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/interactions/panZoom.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { IDENTITY, clampScale, panBy, zoomAt, pinchZoom, fitToBounds } from './panZoom';

describe('clampScale', () => {
  it('clamps below the minimum and above the maximum', () => {
    expect(clampScale(0.05, { min: 0.2, max: 5 })).toBe(0.2);
    expect(clampScale(99, { min: 0.2, max: 5 })).toBe(5);
    expect(clampScale(1, { min: 0.2, max: 5 })).toBe(1);
  });
});

describe('panBy', () => {
  it('translates without changing scale', () => {
    expect(panBy({ x: 10, y: 20, k: 2 }, 5, -3)).toEqual({ x: 15, y: 17, k: 2 });
  });
});

describe('zoomAt', () => {
  it('keeps the pivot point stationary while scaling', () => {
    const start = { ...IDENTITY };
    const next = zoomAt(start, 2, { x: 100, y: 50 }, { min: 0.2, max: 5 });
    expect(next.k).toBe(2);
    // content point under pivot before == after: (pivot - x)/k is invariant
    expect((100 - start.x) / start.k).toBeCloseTo((100 - next.x) / next.k);
    expect((50 - start.y) / start.k).toBeCloseTo((50 - next.y) / next.k);
  });

  it('respects scale limits and adjusts translation by the realized ratio', () => {
    const next = zoomAt({ x: 0, y: 0, k: 4 }, 10, { x: 0, y: 0 }, { min: 0.2, max: 5 });
    expect(next.k).toBe(5); // clamped, not 40
  });
});

describe('pinchZoom', () => {
  it('scales by the distance ratio about the midpoint', () => {
    const next = pinchZoom({ ...IDENTITY }, 100, 200, { x: 0, y: 0 }, { min: 0.2, max: 5 });
    expect(next.k).toBe(2);
  });
});

describe('fitToBounds', () => {
  it('centers and scales content to fit the viewport with padding', () => {
    const bounds = { minX: 0, maxX: 100, minY: 0, maxY: 50 };
    const vp = fitToBounds(bounds, { width: 240, height: 140 }, 20);
    // available 200x100; k = min(200/100, 100/50) = 2
    expect(vp.k).toBe(2);
    // content center (50,25) maps to viewport center (120,70): x = 120 - 50*2 = 20
    expect(vp.x).toBe(20);
    expect(vp.y).toBe(20);
  });

  it('returns identity when the viewport or content has no size', () => {
    expect(fitToBounds({ minX: 0, maxX: 0, minY: 0, maxY: 0 }, { width: 100, height: 100 }, 10)).toEqual(IDENTITY);
    expect(fitToBounds({ minX: 0, maxX: 10, minY: 0, maxY: 10 }, { width: 0, height: 0 }, 10)).toEqual(IDENTITY);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix src/frontend test -- panZoom`
Expected: FAIL — module not found / exports missing.

- [ ] **Step 3: Implement the math**

Create `src/frontend/src/interactions/panZoom.ts`:

```ts
export interface Viewport {
  x: number;
  y: number;
  k: number;
}

export interface ScaleLimits {
  min: number;
  max: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Size {
  width: number;
  height: number;
}

export const IDENTITY: Viewport = { x: 0, y: 0, k: 1 };
export const DEFAULT_LIMITS: ScaleLimits = { min: 0.2, max: 6 };

export function clampScale(k: number, limits: ScaleLimits): number {
  return Math.min(limits.max, Math.max(limits.min, k));
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { x: vp.x + dx, y: vp.y + dy, k: vp.k };
}

// Scale by `factor` while keeping the screen-space `pivot` over the same content point.
export function zoomAt(vp: Viewport, factor: number, pivot: Point, limits: ScaleLimits): Viewport {
  const k = clampScale(vp.k * factor, limits);
  const ratio = k / vp.k;
  return {
    x: pivot.x - (pivot.x - vp.x) * ratio,
    y: pivot.y - (pivot.y - vp.y) * ratio,
    k
  };
}

// Pinch: scale by the ratio of finger distances about their midpoint.
export function pinchZoom(
  vp: Viewport,
  prevDistance: number,
  nextDistance: number,
  midpoint: Point,
  limits: ScaleLimits
): Viewport {
  if (prevDistance <= 0) {
    return vp;
  }
  return zoomAt(vp, nextDistance / prevDistance, midpoint, limits);
}

// Center the content bounds in the viewport with uniform padding on all sides.
export function fitToBounds(bounds: Bounds, size: Size, padding: number): Viewport {
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  const availableWidth = size.width - padding * 2;
  const availableHeight = size.height - padding * 2;
  if (contentWidth <= 0 || contentHeight <= 0 || availableWidth <= 0 || availableHeight <= 0) {
    return { ...IDENTITY };
  }
  const k = Math.min(availableWidth / contentWidth, availableHeight / contentHeight);
  const contentCenterX = (bounds.minX + bounds.maxX) / 2;
  const contentCenterY = (bounds.minY + bounds.maxY) / 2;
  return {
    x: size.width / 2 - contentCenterX * k,
    y: size.height / 2 - contentCenterY * k,
    k
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix src/frontend test -- panZoom`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/interactions/panZoom.ts src/frontend/src/interactions/panZoom.spec.ts
git commit -m "feat(frontend): add pure pan/zoom viewport math"
```

---

## Task 4: `usePanZoom` composable

Wires DOM events (wheel, mouse drag, touch pan/pinch) to the Task 3 math. Holds the reactive `viewport`, exposes a `transform` string for the SVG group, measures the SVG element for the initial fit, and exposes a `dragMoved` flag so the node click in Task 6 can ignore clicks that ended a drag.

**Files:**
- Create: `src/frontend/src/interactions/usePanZoom.ts`
- Test: `src/frontend/src/interactions/usePanZoom.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/interactions/usePanZoom.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, ref, h } from 'vue';
import { mount } from '@vue/test-utils';
import { usePanZoom } from './usePanZoom';
import type { Bounds } from './panZoom';

function host(bounds: Bounds | null) {
  const api: { current?: ReturnType<typeof usePanZoom> } = {};
  const Comp = defineComponent({
    setup() {
      const boundsRef = ref<Bounds | null>(bounds);
      const pz = usePanZoom({ boundsRef, padding: 40 });
      api.current = pz;
      return () => h('svg', { ref: pz.svgRef });
    }
  });
  const wrapper = mount(Comp);
  return { wrapper, pz: api.current! };
}

beforeEach(() => {
  // jsdom lacks ResizeObserver; provide a no-op so onMounted does not throw
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

describe('usePanZoom', () => {
  it('starts at identity transform before any interaction or measurement', () => {
    const { pz } = host(null);
    expect(pz.transform.value).toBe('translate(0,0) scale(1)');
  });

  it('pans by pointer drag delta', async () => {
    const { pz } = host(null);
    pz.onPointerDown({ clientX: 100, clientY: 100, button: 0, preventDefault() {} } as PointerEvent);
    pz.onPointerMove({ clientX: 130, clientY: 90, preventDefault() {} } as PointerEvent);
    pz.onPointerUp({} as PointerEvent);
    expect(pz.viewport.value.x).toBe(30);
    expect(pz.viewport.value.y).toBe(-10);
    expect(pz.dragMoved.value).toBe(true);
  });

  it('zooms toward the cursor on wheel', () => {
    const { pz } = host(null);
    const before = pz.viewport.value.k;
    pz.onWheel({ deltaY: -100, clientX: 400, clientY: 300, preventDefault() {} } as WheelEvent);
    expect(pz.viewport.value.k).toBeGreaterThan(before);
  });

  it('does not flag a drag for a click without movement', () => {
    const { pz } = host(null);
    pz.onPointerDown({ clientX: 50, clientY: 50, button: 0, preventDefault() {} } as PointerEvent);
    pz.onPointerUp({} as PointerEvent);
    expect(pz.dragMoved.value).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix src/frontend test -- usePanZoom`
Expected: FAIL — `usePanZoom` not found.

- [ ] **Step 3: Implement the composable**

Create `src/frontend/src/interactions/usePanZoom.ts`:

```ts
import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import {
  DEFAULT_LIMITS,
  IDENTITY,
  fitToBounds,
  panBy,
  pinchZoom,
  zoomAt,
  type Bounds,
  type ScaleLimits,
  type Viewport
} from './panZoom';

interface UsePanZoomOptions {
  boundsRef: Ref<Bounds | null>;
  padding?: number;
  limits?: ScaleLimits;
}

const DRAG_THRESHOLD = 4; // px of movement before a press counts as a drag
const WHEEL_STEP = 0.0015; // zoom sensitivity per wheel delta unit

export function usePanZoom(options: UsePanZoomOptions) {
  const padding = options.padding ?? 60;
  const limits = options.limits ?? DEFAULT_LIMITS;
  const svgRef = ref<SVGSVGElement | null>(null);
  const viewport = ref<Viewport>({ ...IDENTITY });
  const dragMoved = ref(false);
  const userAdjusted = ref(false);

  let dragging = false;
  let lastPointer = { x: 0, y: 0 };
  let downAt = { x: 0, y: 0 };
  const activeTouches = new Map<number, { x: number; y: number }>();
  let pinchPrevDistance = 0;

  const transform = computed(
    () => `translate(${viewport.value.x},${viewport.value.y}) scale(${viewport.value.k})`
  );

  function rectOf(): DOMRect | null {
    return svgRef.value?.getBoundingClientRect() ?? null;
  }

  function toLocal(clientX: number, clientY: number) {
    const rect = rectOf();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: clientX, y: clientY };
  }

  function fit(): void {
    const rect = rectOf();
    if (!rect || !options.boundsRef.value) {
      return;
    }
    viewport.value = fitToBounds(options.boundsRef.value, { width: rect.width, height: rect.height }, padding);
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    userAdjusted.value = true;
    const factor = Math.exp(-event.deltaY * WHEEL_STEP);
    viewport.value = zoomAt(viewport.value, factor, toLocal(event.clientX, event.clientY), limits);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    dragging = true;
    dragMoved.value = false;
    downAt = { x: event.clientX, y: event.clientY };
    lastPointer = downAt;
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) {
      return;
    }
    event.preventDefault();
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    if (Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > DRAG_THRESHOLD) {
      dragMoved.value = true;
      userAdjusted.value = true;
    }
    viewport.value = panBy(viewport.value, dx, dy);
  }

  function onPointerUp(_event: PointerEvent): void {
    dragging = false;
  }

  function touchPoints(touches: TouchList) {
    return Array.from(touches).map(touch => ({
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY
    }));
  }

  function onTouchStart(event: TouchEvent): void {
    activeTouches.clear();
    for (const point of touchPoints(event.touches)) {
      activeTouches.set(point.id, { x: point.x, y: point.y });
    }
    if (activeTouches.size === 2) {
      const [a, b] = [...activeTouches.values()];
      pinchPrevDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  function onTouchMove(event: TouchEvent): void {
    event.preventDefault();
    userAdjusted.value = true;
    const points = touchPoints(event.touches);
    if (points.length === 1) {
      const previous = activeTouches.get(points[0].id);
      if (previous) {
        viewport.value = panBy(viewport.value, points[0].x - previous.x, points[0].y - previous.y);
      }
      activeTouches.set(points[0].id, { x: points[0].x, y: points[0].y });
      return;
    }
    if (points.length >= 2) {
      const [a, b] = points;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const midpoint = toLocal((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (pinchPrevDistance > 0) {
        viewport.value = pinchZoom(viewport.value, pinchPrevDistance, distance, midpoint, limits);
      }
      pinchPrevDistance = distance;
      activeTouches.set(a.id, { x: a.x, y: a.y });
      activeTouches.set(b.id, { x: b.x, y: b.y });
    }
  }

  function onTouchEnd(event: TouchEvent): void {
    activeTouches.clear();
    for (const point of touchPoints(event.touches)) {
      activeTouches.set(point.id, { x: point.x, y: point.y });
    }
    pinchPrevDistance = 0;
  }

  let observer: ResizeObserver | null = null;
  onMounted(() => {
    fit();
    if (typeof ResizeObserver !== 'undefined' && svgRef.value) {
      observer = new ResizeObserver(() => {
        if (!userAdjusted.value) {
          fit();
        }
      });
      observer.observe(svgRef.value);
    }
  });
  onBeforeUnmount(() => observer?.disconnect());

  // Re-fit when the rendered tree changes, unless the user has taken control.
  watch(
    () => options.boundsRef.value,
    () => {
      if (!userAdjusted.value) {
        fit();
      }
    }
  );

  return {
    svgRef,
    viewport,
    transform,
    dragMoved,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix src/frontend test -- usePanZoom`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/interactions/usePanZoom.ts src/frontend/src/interactions/usePanZoom.spec.ts
git commit -m "feat(frontend): add usePanZoom composable wiring drag/wheel/pinch"
```

---

## Task 5: `selectionStore` Pinia store

Holds the selected person id, popup mode (`normal`/`expanded`), and the fetched full detail with loading/error — mirroring `familyStore`'s async `load` pattern.

**Files:**
- Create: `src/frontend/src/stores/selectionStore.ts`
- Test: `src/frontend/src/stores/selectionStore.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/stores/selectionStore.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../api/familyApi', () => ({ fetchPerson: vi.fn() }));
import { fetchPerson } from '../api/familyApi';
import { useSelectionStore } from './selectionStore';
import type { PersonDetail } from '../types/family';

const detail = { id: 'p-0016', vocation: 'teacher' } as unknown as PersonDetail;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchPerson).mockReset();
});

describe('selectionStore', () => {
  it('opens a person: fetches detail and starts in normal mode', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail);
    const store = useSelectionStore();

    await store.open('p-0016');

    expect(fetchPerson).toHaveBeenCalledWith('p-0016');
    expect(store.detail).toEqual(detail);
    expect(store.mode).toBe('normal');
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('records an error when the fetch fails', async () => {
    vi.mocked(fetchPerson).mockRejectedValue(new Error('boom'));
    const store = useSelectionStore();

    await store.open('p-0016');

    expect(store.error).toBe('boom');
    expect(store.detail).toBeNull();
  });

  it('expand and collapse toggle the popup mode', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail);
    const store = useSelectionStore();
    await store.open('p-0016');

    store.expand();
    expect(store.mode).toBe('expanded');
    store.collapse();
    expect(store.mode).toBe('normal');
  });

  it('close clears the selection', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail);
    const store = useSelectionStore();
    await store.open('p-0016');

    store.close();

    expect(store.selectedId).toBeNull();
    expect(store.detail).toBeNull();
    expect(store.mode).toBe('normal');
  });

  it('does not refetch when opening the already-selected person', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail);
    const store = useSelectionStore();
    await store.open('p-0016');
    await store.open('p-0016');

    expect(fetchPerson).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix src/frontend test -- selectionStore`
Expected: FAIL — `useSelectionStore` not found.

- [ ] **Step 3: Implement the store**

Create `src/frontend/src/stores/selectionStore.ts`:

```ts
import { defineStore } from 'pinia';
import type { PersonDetail } from '../types/family';
import { fetchPerson } from '../api/familyApi';

export type PopupMode = 'normal' | 'expanded';

interface SelectionState {
  selectedId: string | null;
  detail: PersonDetail | null;
  mode: PopupMode;
  loading: boolean;
  error: string | null;
}

export const useSelectionStore = defineStore('selection', {
  state: (): SelectionState => ({
    selectedId: null,
    detail: null,
    mode: 'normal',
    loading: false,
    error: null
  }),
  actions: {
    async open(id: string): Promise<void> {
      // Already showing this person's detail — keep it (and the current mode).
      if (this.selectedId === id && this.detail) {
        return;
      }
      this.selectedId = id;
      this.mode = 'normal';
      this.loading = true;
      this.error = null;
      this.detail = null;
      try {
        const detail = await fetchPerson(id);
        // Guard against a race: a newer open() may have superseded this one.
        if (this.selectedId === id) {
          this.detail = detail;
        }
      } catch (cause) {
        if (this.selectedId === id) {
          this.error = cause instanceof Error ? cause.message : 'Failed to load person';
        }
      } finally {
        if (this.selectedId === id) {
          this.loading = false;
        }
      }
    },
    expand(): void {
      this.mode = 'expanded';
    },
    collapse(): void {
      this.mode = 'normal';
    },
    close(): void {
      this.selectedId = null;
      this.detail = null;
      this.mode = 'normal';
      this.error = null;
      this.loading = false;
    }
  }
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix src/frontend test -- selectionStore`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/stores/selectionStore.ts src/frontend/src/stores/selectionStore.spec.ts
git commit -m "feat(frontend): add selectionStore for popup state and person detail"
```

---

## Task 6: OakTree — selection, keyboard a11y, highlight, pan/zoom group

Wrap the rendered content in a pan/zoom transform group, make nodes selectable (mouse + keyboard), highlight the selected node, and ignore the click that ends a drag.

**Files:**
- Modify: `src/frontend/src/components/OakTree.vue`
- Test: `src/frontend/src/components/OakTree.spec.ts`

- [ ] **Step 1: Write the failing tests**

Replace the body of the `describe('OakTree', …)` block in `src/frontend/src/components/OakTree.spec.ts` with these tests (keep the existing imports, `graph`, and `beforeEach`; add `selectedId` to the props where mounted):

```ts
describe('OakTree', () => {
  it('renders an svg with a node element per person and a branch per descent link', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="node"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-test="branch"]').length).toBeGreaterThanOrEqual(1);
  });

  it('renders localized node names and updates when the locale changes', async () => {
    const store = useLocaleStore();
    store.setLocale('en');
    expect(store.currentLocale).toBe('en');
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    const names = () => wrapper.findAll('.oak__name').map(node => node.text());
    expect(names()).toContain('Anna');

    store.setLocale('ru');
    await wrapper.vm.$nextTick();

    expect(names()).toContain('Анна');
  });

  it('emits select with the person id when a node is clicked', async () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    await wrapper.findAll('[data-test="node"]')[0].trigger('click');

    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual(['a']);
  });

  it('emits select when Enter is pressed on a focused node', async () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    await wrapper.findAll('[data-test="node"]')[1].trigger('keydown.enter');

    expect(wrapper.emitted('select')![0]).toEqual(['b']);
  });

  it('marks the selected node with a modifier class', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout, selectedId: 'b' } });

    const selected = wrapper.findAll('[data-test="node"]').filter(node => node.classes('oak__node--selected'));
    expect(selected).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix src/frontend test -- OakTree`
Expected: FAIL — no `select` emit, no `oak__node--selected` class.

- [ ] **Step 3: Update OakTree's script**

In `src/frontend/src/components/OakTree.vue`, replace the `<script setup>` block with (note: `usePanZoom`'s return is **destructured** so `svgRef`/`transform` are top-level bindings usable directly as `ref="svgRef"` / `:transform="transform"`):

```ts
<script setup lang="ts">
import { computed } from 'vue';
import type { TreeLayout, LayoutNode, LayoutLink } from '../layout/treeLayout';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { usePanZoom } from '../interactions/usePanZoom';
import type { Bounds } from '../interactions/panZoom';

const props = defineProps<{ layout: TreeLayout; selectedId?: string | null }>();
const emit = defineEmits<{ select: [id: string] }>();

const localeStore = useLocaleStore();

const boundsRef = computed<Bounds>(() => props.layout.bounds);
const {
  svgRef,
  transform,
  dragMoved,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTouchStart,
  onTouchMove,
  onTouchEnd
} = usePanZoom({ boundsRef });

function displayName(node: LayoutNode): string {
  return localize(node.person.givenName, localeStore.currentLocale);
}

function onNodeActivate(node: LayoutNode): void {
  // Ignore the click that ends a pan drag.
  if (dragMoved.value) {
    return;
  }
  emit('select', node.id);
}

function branchWidth(link: LayoutLink): number {
  // thicker near the trunk (small absolute generation), thinner toward twigs
  const node = props.layout.nodes.find(n => n.id === link.target);
  const generation = node ? Math.abs(node.generation) : 3;
  return Math.max(2, 12 - generation * 2.5);
}

function branchPath(link: LayoutLink): string {
  // organic vertical-ish curve from parent to child
  const midY = (link.y1 + link.y2) / 2;
  return `M ${link.x1} ${link.y1} C ${link.x1} ${midY}, ${link.x2} ${midY}, ${link.x2} ${link.y2}`;
}

function nodeRadius(node: LayoutNode): number {
  if (node.role === 'trunk') {
    return 11;
  }
  if (node.role === 'leaf') {
    return 7;
  }
  return 9;
}

const descentLinks = computed(() => props.layout.links.filter(link => link.kind === 'descent'));
const unionLinks = computed(() => props.layout.links.filter(link => link.kind === 'union'));
</script>
```

- [ ] **Step 4: Update OakTree's template**

Replace the `<template>` block with (SVG fills the container, content wrapped in the pan/zoom `<g>`, nodes interactive + highlightable):

```html
<template>
  <svg
    ref="svgRef"
    class="oak"
    data-test="oak-svg"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
    @touchstart.passive="onTouchStart"
    @touchmove.prevent="onTouchMove"
    @touchend="onTouchEnd"
  >
    <g class="oak__viewport" :transform="transform">
      <g class="oak__branches">
        <path
          v-for="link in descentLinks"
          :key="link.id"
          data-test="branch"
          :d="branchPath(link)"
          :stroke-width="branchWidth(link)"
          fill="none"
          stroke-linecap="round"
          class="oak__branch"
        />
      </g>

      <g class="oak__unions">
        <line
          v-for="link in unionLinks"
          :key="link.id"
          :x1="link.x1" :y1="link.y1" :x2="link.x2" :y2="link.y2"
          class="oak__union"
        />
      </g>

      <g class="oak__nodes">
        <g
          v-for="node in layout.nodes"
          :key="node.id"
          data-test="node"
          role="button"
          tabindex="0"
          :aria-label="displayName(node)"
          :transform="`translate(${node.x}, ${node.y})`"
          :class="['oak__node', `oak__node--${node.role}`, { 'oak__node--selected': node.id === selectedId }]"
          @click="onNodeActivate(node)"
          @keydown.enter.prevent="onNodeActivate(node)"
          @keydown.space.prevent="onNodeActivate(node)"
        >
          <circle :r="nodeRadius(node)" class="oak__medallion" />
          <text y="-14" text-anchor="middle" class="oak__name">{{ displayName(node) }}</text>
        </g>
      </g>
    </g>
  </svg>
</template>
```

Note: because `svgRef` is destructured to a top-level `const` binding, `ref="svgRef"` wires the SVG element into the composable's ref (the standard pattern for composables that return template refs). `transform` and `dragMoved` are top-level refs too, so they auto-unwrap in the template / `.value` in script.

- [ ] **Step 5: Update OakTree's styles**

In the `<style scoped lang="scss">` block, replace the top `.oak { … }` selector chain's opening so the SVG fills the container, and add interaction styles. Replace:

```scss
.oak {
  width: 100%;
  height: 100%;
  display: block;
```

with:

```scss
.oak {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none; // we handle pan/pinch ourselves
  cursor: grab;
  user-select: none;

  &:active { cursor: grabbing; }

  &__node {
    cursor: pointer;
    &:focus-visible { outline: none; }
    &:focus-visible .oak__medallion { stroke: var(--leaf-deep); stroke-width: 3; }
  }
  &__node--selected .oak__medallion {
    stroke: var(--leaf-deep);
    stroke-width: 3.5;
  }
```

(The remaining existing rules — `&__branch`, `&__union`, `&__medallion`, etc. — stay unchanged below.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix src/frontend test -- OakTree`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/OakTree.vue src/frontend/src/components/OakTree.spec.ts
git commit -m "feat(frontend): pan/zoom group, node selection, keyboard a11y, highlight in OakTree"
```

---

## Task 7: i18n label namespaces (person / vocation / social)

Add the popup's UI labels to all three catalogs, plus a parity test guarding against missing keys when a locale drifts.

**Files:**
- Modify: `src/frontend/src/i18n/messages/en.ts`
- Modify: `src/frontend/src/i18n/messages/ru.ts`
- Modify: `src/frontend/src/i18n/messages/be.ts`
- Create: `src/frontend/src/i18n/messages/messages.spec.ts`

- [ ] **Step 1: Write the failing parity test**

Create `src/frontend/src/i18n/messages/messages.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { en } from './en';
import { ru } from './ru';
import { be } from './be';

function keyPaths(object: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'object' && value !== null
      ? keyPaths(value as Record<string, unknown>, path)
      : [path];
  });
}

describe('message catalogs', () => {
  it('define the same key paths across ru, be, and en', () => {
    const enKeys = keyPaths(en).sort();
    expect(keyPaths(ru).sort()).toEqual(enKeys);
    expect(keyPaths(be).sort()).toEqual(enKeys);
  });

  it('include the person popup labels', () => {
    for (const catalog of [en, ru, be]) {
      const keys = keyPaths(catalog);
      expect(keys).toContain('person.expand');
      expect(keys).toContain('person.residences');
      expect(keys).toContain('vocation.teacher');
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix src/frontend test -- messages`
Expected: FAIL — `person.*` / `vocation.*` keys missing.

- [ ] **Step 3: Add labels to the English catalog**

Replace `src/frontend/src/i18n/messages/en.ts` with:

```ts
export const en = {
  app: {
    title: 'Family Tree'
  },
  status: {
    loading: 'Loading family…',
    error: 'Could not load the family tree.'
  },
  picker: {
    label: 'Change language'
  },
  person: {
    close: 'Close',
    expand: 'More',
    collapse: 'Less',
    nee: 'née',
    biography: 'Biography',
    residences: 'Residences',
    links: 'Links',
    viewOnMap: 'Open in Google Maps',
    present: 'present',
    loading: 'Loading…',
    error: 'Could not load this person.'
  },
  vocation: {
    teacher: 'Teacher',
    church: 'Church',
    writer: 'Writer',
    office: 'Office worker',
    other: 'Other'
  },
  social: {
    facebook: 'Facebook',
    instagram: 'Instagram'
  }
};
```

- [ ] **Step 4: Add labels to the Russian catalog**

Replace `src/frontend/src/i18n/messages/ru.ts` with:

```ts
export const ru = {
  app: {
    title: 'Семейное древо'
  },
  status: {
    loading: 'Загрузка семьи…',
    error: 'Не удалось загрузить семейное древо.'
  },
  picker: {
    label: 'Сменить язык'
  },
  person: {
    close: 'Закрыть',
    expand: 'Подробнее',
    collapse: 'Свернуть',
    nee: 'урожд.',
    biography: 'Биография',
    residences: 'Места жительства',
    links: 'Ссылки',
    viewOnMap: 'Открыть в Google Картах',
    present: 'наст. время',
    loading: 'Загрузка…',
    error: 'Не удалось загрузить данные человека.'
  },
  vocation: {
    teacher: 'Учитель',
    church: 'Церковь',
    writer: 'Писатель',
    office: 'Служащий',
    other: 'Другое'
  },
  social: {
    facebook: 'Facebook',
    instagram: 'Instagram'
  }
};
```

- [ ] **Step 5: Add labels to the Belarusian catalog**

Replace `src/frontend/src/i18n/messages/be.ts` with:

```ts
export const be = {
  app: {
    title: 'Сямейнае дрэва'
  },
  status: {
    loading: 'Загрузка сям’і…',
    error: 'Не ўдалося загрузіць сямейнае дрэва.'
  },
  picker: {
    label: 'Змяніць мову'
  },
  person: {
    close: 'Закрыць',
    expand: 'Падрабязней',
    collapse: 'Згарнуць',
    nee: 'дзяв.',
    biography: 'Біяграфія',
    residences: 'Месцы жыхарства',
    links: 'Спасылкі',
    viewOnMap: 'Адкрыць у Google Картах',
    present: 'цяпер',
    loading: 'Загрузка…',
    error: 'Не ўдалося загрузіць звесткі пра чалавека.'
  },
  vocation: {
    teacher: 'Настаўнік',
    church: 'Царква',
    writer: 'Пісьменнік',
    office: 'Служачы',
    other: 'Іншае'
  },
  social: {
    facebook: 'Facebook',
    instagram: 'Instagram'
  }
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm --prefix src/frontend test -- messages`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/i18n/messages/
git commit -m "feat(frontend): add person/vocation/social i18n labels with parity test"
```

---

## Task 8: Glass popup tokens

Add the glass surface custom properties used by the popup.

**Files:**
- Modify: `src/frontend/src/styles/tokens.scss`

- [ ] **Step 1: Add glass tokens**

In `src/frontend/src/styles/tokens.scss`, inside the `:root { … }` block, after the existing `--ink-soft:` line, add:

```scss
  // Glass popup surface (§7): translucent parchment with a thin bark border.
  --glass-bg: rgba(240, 233, 214, 0.62);
  --glass-border: rgba(95, 82, 64, 0.38);
  --glass-shadow: 0 12px 40px rgba(74, 63, 51, 0.28);
  --scrim: rgba(74, 63, 51, 0.28);
```

- [ ] **Step 2: Verify the stylesheet still compiles**

Run: `npm --prefix src/frontend run build`
Expected: build succeeds (Sass compiles the new variables; no usage yet).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/styles/tokens.scss
git commit -m "feat(frontend): add glass popup design tokens"
```

---

## Task 9: PersonPopup — normal layout

The glass popup's normal layout: portrait (or initials fallback), name (+ née), lifespan, vocation, summary, and `More`/close controls. Data fields localized via `localize`, labels via `t()`. Responsive: centered modal on desktop, bottom sheet on mobile. A11y: `role="dialog"`, `aria-modal`, Esc + scrim close, focus moves into the dialog on open.

**Files:**
- Create: `src/frontend/src/components/PersonPopup.vue`
- Test: `src/frontend/src/components/PersonPopup.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/frontend/src/components/PersonPopup.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PersonPopup from './PersonPopup.vue';
import { useSelectionStore } from '../stores/selectionStore';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonDetail } from '../types/family';

const tadeusz: PersonDetail = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: 'Тадэвуш', en: 'Tadeusz' },
  surname: { ru: 'Ковальский', be: 'Кавальскі', en: 'Kowalski' },
  maidenName: null,
  sex: 'male',
  birth: { year: 1962, month: 4, day: null, approx: false, place: { ru: 'Варшава', be: 'Варшава', en: 'Warsaw' } },
  death: null,
  vocation: 'teacher',
  summary: { ru: 'Учитель истории.', be: null, en: 'A history teacher.' },
  biography: { ru: 'Длинная биография.', be: null, en: 'A longer biography.' },
  portrait: null,
  gallery: [],
  links: [{ type: 'facebook', url: 'https://facebook.com/example' }],
  residences: [{ place: { ru: 'Варшава', be: null, en: 'Warsaw' }, fromYear: 1962, toYear: null, mapUrl: 'https://maps.google.com/?q=Warszawa' }],
  parents: { motherId: 'p-0014', fatherId: 'p-0013' },
  marriedIntoFamily: false,
  isDefaultRoot: true
};

function mountWith(detail: PersonDetail) {
  const store = useSelectionStore();
  store.$patch({ selectedId: detail.id, detail, mode: 'normal', loading: false, error: null });
  return mount(PersonPopup, { global: { plugins: [i18n] } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
});

describe('PersonPopup (normal)', () => {
  it('renders the dialog with name, lifespan, and summary', () => {
    const wrapper = mountWith(tadeusz);

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Tadeusz');
    expect(wrapper.text()).toContain('Kowalski');
    expect(wrapper.text()).toContain('1962–');
    expect(wrapper.text()).toContain('A history teacher.');
  });

  it('renders the localized vocation label', () => {
    const wrapper = mountWith(tadeusz);
    expect(wrapper.text()).toContain('Teacher');
  });

  it('shows initials when there is no portrait', () => {
    const wrapper = mountWith(tadeusz);
    expect(wrapper.find('[data-test="portrait-fallback"]').text()).toBe('T');
  });

  it('expands when the More control is clicked', async () => {
    const wrapper = mountWith(tadeusz);
    const store = useSelectionStore();

    await wrapper.find('[data-test="expand"]').trigger('click');

    expect(store.mode).toBe('expanded');
  });

  it('emits close when the close control is clicked', async () => {
    const wrapper = mountWith(tadeusz);

    await wrapper.find('[data-test="close"]').trigger('click');

    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('emits close on Escape', async () => {
    const wrapper = mountWith(tadeusz);

    await wrapper.find('[data-test="dialog"]').trigger('keydown.esc');

    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix src/frontend test -- PersonPopup`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement PersonPopup (normal layout)**

Create `src/frontend/src/components/PersonPopup.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useSelectionStore } from '../stores/selectionStore';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatLifespan } from '../format/lifespan';
import type { LocalizedText } from '../types/family';

const emit = defineEmits<{ close: [] }>();

const { t, te } = useI18n({ useScope: 'global' });
const selection = useSelectionStore();
const localeStore = useLocaleStore();
const { detail, mode, loading, error } = storeToRefs(selection);

const dialogRef = ref<HTMLElement | null>(null);

function loc(text: LocalizedText | null | undefined): string {
  return localize(text, localeStore.currentLocale);
}

const fullName = computed(() => {
  if (!detail.value) {
    return '';
  }
  return `${loc(detail.value.givenName)} ${loc(detail.value.surname)}`.trim();
});

const maidenName = computed(() => (detail.value?.maidenName ? loc(detail.value.maidenName) : ''));

const lifespan = computed(() =>
  detail.value ? formatLifespan(detail.value.birth, detail.value.death) : ''
);

const initial = computed(() => fullName.value.charAt(0).toUpperCase());

const vocationLabel = computed(() => {
  const vocation = detail.value?.vocation;
  if (!vocation) {
    return '';
  }
  const key = `vocation.${vocation}`;
  return te(key) ? t(key) : vocation;
});

function onClose(): void {
  emit('close');
}

onMounted(() => {
  dialogRef.value?.focus();
});
</script>

<template>
  <div class="popup" data-test="person-popup">
    <div class="popup__scrim" data-test="scrim" @click="onClose" />
    <section
      ref="dialogRef"
      class="popup__dialog"
      :class="{ 'popup__dialog--expanded': mode === 'expanded' }"
      data-test="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="popup-name"
      tabindex="-1"
      @keydown.esc.stop="onClose"
    >
      <button
        type="button"
        class="popup__close"
        data-test="close"
        :aria-label="t('person.close')"
        @click="onClose"
      >
        ✕
      </button>

      <p v-if="loading" class="popup__status">{{ t('person.loading') }}</p>
      <p v-else-if="error" class="popup__status popup__status--error">{{ t('person.error') }}</p>

      <template v-else-if="detail">
        <header class="popup__head">
          <div class="popup__portrait">
            <span class="popup__initial" data-test="portrait-fallback">{{ initial }}</span>
          </div>
          <div class="popup__heading">
            <h2 id="popup-name" class="popup__name">{{ fullName }}</h2>
            <p v-if="maidenName" class="popup__maiden">{{ t('person.nee') }} {{ maidenName }}</p>
            <p class="popup__life">{{ lifespan }}</p>
            <p class="popup__vocation">{{ vocationLabel }}</p>
          </div>
        </header>

        <p v-if="loc(detail.summary)" class="popup__summary">{{ loc(detail.summary) }}</p>

        <!-- expanded section is added in the next task -->

        <footer class="popup__actions">
          <button
            v-if="mode === 'normal'"
            type="button"
            class="popup__expand"
            data-test="expand"
            @click="selection.expand()"
          >
            {{ t('person.expand') }}
          </button>
          <button
            v-else
            type="button"
            class="popup__expand"
            data-test="collapse"
            @click="selection.collapse()"
          >
            {{ t('person.collapse') }}
          </button>
        </footer>
      </template>
    </section>
  </div>
</template>

<style scoped lang="scss">
.popup {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;

  &__scrim {
    position: absolute;
    inset: 0;
    background: var(--scrim);
  }

  &__dialog {
    position: relative;
    z-index: 1;
    width: min(420px, calc(100vw - 32px));
    max-height: min(80vh, 640px);
    overflow-y: auto;
    padding: 20px 22px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 14px;
    box-shadow: var(--glass-shadow);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--ink);
    font-family: Georgia, serif;

    &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  }

  &__close {
    position: absolute;
    top: 10px;
    right: 12px;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--ink-soft);
    font-size: 15px;
    cursor: pointer;
    &:hover { background: rgba(95, 82, 64, 0.12); }
    &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  }

  &__status {
    margin: 8px 0;
    font-style: italic;
    &--error { color: #8a3b32; }
  }

  &__head {
    display: flex;
    gap: 14px;
    align-items: center;
  }

  &__portrait {
    flex: 0 0 auto;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 1px solid var(--glass-border);
    background: var(--parchment-2);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__initial {
    font-size: 26px;
    color: var(--ink-soft);
  }

  &__name {
    margin: 0;
    font-size: 19px;
  }

  &__maiden,
  &__life,
  &__vocation {
    margin: 2px 0 0;
    font-size: 13px;
    color: var(--ink-soft);
  }

  &__summary {
    margin: 14px 0 0;
    line-height: 1.5;
    font-size: 14px;
  }

  &__actions {
    margin-top: 16px;
    display: flex;
    gap: 10px;
  }

  &__expand {
    padding: 6px 14px;
    background: var(--parchment-2);
    border: 1px solid var(--ink-soft);
    border-radius: 6px;
    color: var(--ink);
    font: inherit;
    cursor: pointer;
    &:hover { background: var(--parchment); }
    &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  }
}

// mobile-first: bottom sheet on phones (§7 responsive)
@media (max-width: 640px) {
  .popup {
    align-items: flex-end;
    justify-content: stretch;

    &__dialog {
      width: 100%;
      max-height: 85vh;
      border-radius: 16px 16px 0 0;
    }
  }
}
</style>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix src/frontend test -- PersonPopup`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonPopup.vue src/frontend/src/components/PersonPopup.spec.ts
git commit -m "feat(frontend): add glass PersonPopup normal layout"
```

---

## Task 10: PersonPopup — expanded layout

Add the expanded section: biography, residences (each linking to Google Maps), and social links. Shown only when `mode === 'expanded'`.

**Files:**
- Modify: `src/frontend/src/components/PersonPopup.vue`
- Test: `src/frontend/src/components/PersonPopup.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block to `src/frontend/src/components/PersonPopup.spec.ts` (reuses `tadeusz`, `mountWith`, and `beforeEach` already in the file):

```ts
describe('PersonPopup (expanded)', () => {
  it('hides biography, residences, and links in normal mode', () => {
    const wrapper = mountWith(tadeusz);
    expect(wrapper.find('[data-test="biography"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="residences"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="links"]').exists()).toBe(false);
  });

  it('shows biography, residences with map links, and social links when expanded', async () => {
    const wrapper = mountWith(tadeusz);
    useSelectionStore().expand();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="biography"]').text()).toContain('A longer biography.');

    const residences = wrapper.find('[data-test="residences"]');
    expect(residences.text()).toContain('Warsaw');
    const mapLink = residences.find('a');
    expect(mapLink.attributes('href')).toBe('https://maps.google.com/?q=Warszawa');
    expect(mapLink.attributes('target')).toBe('_blank');

    const links = wrapper.find('[data-test="links"]');
    const social = links.find('a');
    expect(social.attributes('href')).toBe('https://facebook.com/example');
    expect(social.text()).toContain('Facebook');
  });

  it('localizes the residence place name with the active locale', async () => {
    const wrapper = mountWith(tadeusz);
    useLocaleStore().setLocale('ru');
    useSelectionStore().expand();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="residences"]').text()).toContain('Варшава');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix src/frontend test -- PersonPopup`
Expected: FAIL — no `biography`/`residences`/`links` sections.

- [ ] **Step 3: Add the expanded markup**

In `src/frontend/src/components/PersonPopup.vue`, add these helpers to the `<script setup>` block (after `vocationLabel`):

```ts
function socialLabel(type: string): string {
  const key = `social.${type}`;
  return te(key) ? t(key) : type;
}

function residenceYears(fromYear: number | null, toYear: number | null): string {
  const from = fromYear ?? '';
  const to = toYear ?? t('person.present');
  if (from === '' && toYear == null) {
    return '';
  }
  return `${from}–${to}`;
}
```

Then replace the placeholder comment `<!-- expanded section is added in the next task -->` in the template with:

```html
<section v-if="mode === 'expanded'" class="popup__expanded">
  <div v-if="loc(detail.biography)" class="popup__block">
    <h3 class="popup__block-title">{{ t('person.biography') }}</h3>
    <p class="popup__bio" data-test="biography">{{ loc(detail.biography) }}</p>
  </div>

  <div v-if="detail.residences.length" class="popup__block">
    <h3 class="popup__block-title">{{ t('person.residences') }}</h3>
    <ul class="popup__list" data-test="residences">
      <li v-for="(residence, index) in detail.residences" :key="index" class="popup__residence">
        <span class="popup__place">{{ loc(residence.place) }}</span>
        <span class="popup__years">{{ residenceYears(residence.fromYear, residence.toYear) }}</span>
        <a
          v-if="residence.mapUrl"
          class="popup__map"
          :href="residence.mapUrl"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="t('person.viewOnMap')"
        >🗺</a>
      </li>
    </ul>
  </div>

  <div v-if="detail.links.length" class="popup__block">
    <h3 class="popup__block-title">{{ t('person.links') }}</h3>
    <ul class="popup__list popup__links" data-test="links">
      <li v-for="link in detail.links" :key="link.url">
        <a :href="link.url" target="_blank" rel="noopener noreferrer">{{ socialLabel(link.type) }}</a>
      </li>
    </ul>
  </div>
</section>
```

- [ ] **Step 4: Add the expanded styles**

In the `<style scoped lang="scss">` block, inside the `.popup { … }` selector (e.g. after the `&__summary` rule), add:

```scss
  &__expanded {
    margin-top: 16px;
    border-top: 1px solid var(--glass-border);
    padding-top: 12px;
  }

  &__block { margin-top: 12px; }

  &__block-title {
    margin: 0 0 6px;
    font-size: 13px;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--ink-soft);
  }

  &__bio { margin: 0; line-height: 1.55; font-size: 14px; }

  &__list {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 14px;
  }

  &__residence {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 0;
  }

  &__years { color: var(--ink-soft); font-size: 13px; }

  &__map { text-decoration: none; }

  &__links a { color: var(--leaf-deep); }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm --prefix src/frontend test -- PersonPopup`
Expected: PASS (9 tests total — 6 normal + 3 expanded).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/PersonPopup.vue src/frontend/src/components/PersonPopup.spec.ts
git commit -m "feat(frontend): add expanded popup with biography, residences, and links"
```

---

## Task 11: Routing + TreeView wiring + deep link

Add the `/person/:id` route (same `TreeView` component), drive the popup from the route param, wire node selection → `router.push`, and close → back to `/`. This makes in-app clicks and direct `/person/:id` loads share one path.

**Files:**
- Modify: `src/frontend/src/router/index.ts`
- Modify: `src/frontend/src/views/TreeView.vue`
- Test: `src/frontend/src/views/TreeView.spec.ts`

- [ ] **Step 1: Add the deep-link route**

Replace `src/frontend/src/router/index.ts` with:

```ts
import { createRouter, createWebHistory } from 'vue-router';
import TreeView from '../views/TreeView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'tree', component: TreeView },
    { path: '/person/:id', name: 'person', component: TreeView }
  ]
});
```

- [ ] **Step 2: Write the failing TreeView tests**

Replace `src/frontend/src/views/TreeView.spec.ts` with (adds a real router so route-driven popup behavior can be tested):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { i18n } from '../i18n';
import type { FamilyGraph, PersonDetail } from '../types/family';

vi.mock('../api/familyApi', () => ({ fetchFamilyGraph: vi.fn(), fetchPerson: vi.fn() }));
import { fetchFamilyGraph, fetchPerson } from '../api/familyApi';
import TreeView from './TreeView.vue';

const graph: FamilyGraph = {
  people: [
    { id: 'a', givenName: { ru: 'А', be: null, en: 'A' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'male', birthYear: 1850, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true },
    { id: 'b', givenName: { ru: 'Б', be: null, en: 'B' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'female', birthYear: 1880, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: 'a' }, marriedIntoFamily: false, isDefaultRoot: false }
  ],
  unions: [{ id: 'u', partnerIds: ['a'], marriageYear: null, childIds: ['b'] }]
};

const detailB = {
  id: 'b',
  givenName: { ru: 'Б', be: null, en: 'B' },
  surname: { ru: 'Икс', be: null, en: 'X' },
  maidenName: null, sex: 'female',
  birth: { year: 1880, month: null, day: null, approx: false, place: null },
  death: null, vocation: 'other', summary: null, biography: null,
  portrait: null, gallery: [], links: [], residences: [],
  parents: { motherId: null, fatherId: 'a' }, marriedIntoFamily: false, isDefaultRoot: false
} as PersonDetail;

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'tree', component: TreeView },
      { path: '/person/:id', name: 'person', component: TreeView }
    ]
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchFamilyGraph).mockReset().mockResolvedValue(graph);
  vi.mocked(fetchPerson).mockReset().mockResolvedValue(detailB);
});

describe('TreeView', () => {
  it('loads the graph and renders the oak and year axis', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });

    await flushPromises();

    expect(wrapper.find('.oak').exists()).toBe(true);
    expect(wrapper.find('.year-axis').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="node"]')).toHaveLength(2);
    expect(wrapper.find('[data-test="person-popup"]').exists()).toBe(false);
  });

  it('navigates to /person/:id when a node is selected', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();

    await wrapper.findAll('[data-test="node"]')[1].trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('person');
    expect(router.currentRoute.value.params.id).toBe('b');
  });

  it('opens the popup for the person in the route on a deep link', async () => {
    const router = makeRouter();
    router.push('/person/b');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });

    await flushPromises();

    expect(wrapper.find('[data-test="person-popup"]').exists()).toBe(true);
    expect(fetchPerson).toHaveBeenCalledWith('b');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm --prefix src/frontend test -- TreeView`
Expected: FAIL — TreeView does not yet emit selection navigation or render the popup.

- [ ] **Step 4: Wire TreeView**

Replace the `<script setup>` block in `src/frontend/src/views/TreeView.vue` with:

```ts
<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { useSelectionStore } from '../stores/selectionStore';
import { buildLayout } from '../layout/treeLayout';
import YearAxis from '../components/YearAxis.vue';
import OakTree from '../components/OakTree.vue';
import PersonPopup from '../components/PersonPopup.vue';

const store = useFamilyStore();
const selection = useSelectionStore();
const { people, unions, focusId, loading, error } = storeToRefs(store);
const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();

onMounted(() => {
  if (store.people.length === 0) {
    void store.load();
  }
});

const selectedId = computed(() => {
  const id = route.params.id;
  return typeof id === 'string' ? id : null;
});

// Keep the selection store in sync with the route param (covers deep links and
// in-app navigation alike).
watch(
  selectedId,
  id => {
    if (id) {
      void selection.open(id);
    } else {
      selection.close();
    }
  },
  { immediate: true }
);

function onSelect(id: string): void {
  void router.push({ name: 'person', params: { id } });
}

function onClose(): void {
  void router.push({ name: 'tree' });
}

const layout = computed(() => {
  if (!focusId.value || people.value.length === 0) {
    return null;
  }
  return buildLayout({ people: people.value, unions: unions.value }, { focusId: focusId.value });
});
</script>
```

- [ ] **Step 5: Update TreeView's template**

Replace the `<template>` block in `src/frontend/src/views/TreeView.vue` with:

```html
<template>
  <main class="tree-view">
    <p v-if="loading" class="tree-view__status">{{ t('status.loading') }}</p>
    <p v-else-if="error" class="tree-view__status tree-view__status--error">{{ t('status.error') }}</p>
    <div v-else-if="layout" class="tree-view__canvas">
      <YearAxis class="tree-view__axis" :scale="layout.scale" :step="25" />
      <div class="tree-view__oak">
        <OakTree :layout="layout" :selected-id="selectedId" @select="onSelect" />
      </div>
    </div>

    <PersonPopup v-if="selectedId" @close="onClose" />
  </main>
</template>
```

(The `<style scoped lang="scss">` block stays unchanged.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix src/frontend test -- TreeView`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/router/index.ts src/frontend/src/views/TreeView.vue src/frontend/src/views/TreeView.spec.ts
git commit -m "feat(frontend): route-driven popup and /person/:id deep link"
```

---

## Task 12: Full suite, type-check, and manual verification

Confirm the whole frontend is green, types compile, and the interactions work end-to-end against the running backend.

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `npm --prefix src/frontend test`
Expected: PASS — all spec files green (existing + new).

- [ ] **Step 2: Type-check and build**

Run: `npm --prefix src/frontend run build`
Expected: `vue-tsc` reports no type errors and Vite builds successfully.

- [ ] **Step 3: Start the backend, then the frontend dev server**

Backend (from `src/backend/FamilyTree.Api`): `dotnet run`
Frontend: `npm --prefix src/frontend run dev`

Use the preview tools (per the verification workflow) to load `http://localhost:5173/` and verify:
- **Pan/zoom:** drag pans the oak; mouse wheel zooms toward the cursor; the tree stays centered on first load.
- **Select → popup:** clicking a node opens the glass popup (normal layout: name, lifespan, vocation, summary) and the URL becomes `/person/<id>`; the selected node is highlighted.
- **Expand:** clicking **More** reveals biography, residences (with a working Google-Maps link), and social links (use the default-root person `p-0016`, who has all three).
- **Deep link:** loading `http://localhost:5173/person/p-0007` directly opens that person's popup over the oak.
- **Localization:** switching language in the app bar re-localizes the popup data fields (name, place, summary) and labels (More/Biography/Residences/vocation).
- **Responsive:** narrow the viewport (or `preview_resize` to a phone width) — the popup becomes a bottom sheet.

Capture a screenshot of the expanded popup as proof.

- [ ] **Step 4: Commit any fixes**

If verification surfaces issues, fix the source, re-run the affected spec, and commit. Otherwise no commit is needed for this task.

---

## Self-Review (completed by the plan author)

**1. Spec coverage**

| Spec requirement | Task |
| --- | --- |
| §9 Pan/zoom: drag + wheel desktop, one-finger pan + pinch touch | Tasks 3, 4, 6 |
| §9 Routes `/` and `/person/:id` deep link | Task 11 |
| §9 Pinia state: selected person, popup mode, zoom/pan viewport | Tasks 4 (viewport via composable), 5 (selection + mode) |
| §9 Select member → glass popup | Tasks 6, 9 |
| §7 Glass styling (translucent, blur, thin border) | Tasks 8, 9 |
| §7 Normal layout: portrait, birth–death, vocation, key fact, expand | Tasks 2, 9 |
| §7 Expanded: biography, residences w/ Google-Maps links, social links | Task 10 |
| §7 Responsive: centered modal desktop, bottom sheet mobile | Tasks 9, 10 |
| Localized via `localize` (data) + vue-i18n (labels) | Tasks 7, 9, 10 |

**2. Placeholder scan:** No `TBD`/`TODO`/"handle edge cases"; every code step shows full code. The single inline comment placeholder in Task 9's template (`<!-- expanded section is added in the next task -->`) is explicitly replaced in Task 10 Step 3.

**3. Type consistency:** `Viewport`, `Bounds`, `ScaleLimits`, `Point`, `Size` defined in Task 3 and imported in Task 4. `PersonDetail`/`LifeEvent`/`Residence`/`SocialLink` defined in Task 1, used in Tasks 2, 5, 9, 10, 11. `usePanZoom` returns (`svgRef`, `viewport`, `transform`, `dragMoved`, handlers) match OakTree's usage in Task 6. `useSelectionStore` shape (`selectedId`, `detail`, `mode`, `loading`, `error`, `open`/`expand`/`collapse`/`close`) consistent across Tasks 5, 9, 10, 11. `formatLifespan(birth, death)` signature consistent between Tasks 2 and 9.

**Notes for the implementer:**
- Run all `npm` commands with the `--prefix src/frontend` flag (or `cd src/frontend` first) — the package is under `src/frontend`, not the repo root.
- Seed data has **no portraits**, so the initials fallback is the normal path; the portrait `<img>` is intentionally omitted in this iteration (gallery + portraits deferred per §7/§12).
```
