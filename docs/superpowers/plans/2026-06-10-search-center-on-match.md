# Search Centers the Tree on Found People — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing in the nav-bar search pans/zooms the oak so the matched person's medallion is centered; Enter cycles matches (youngest first); off-tree matches re-root the layout; the search field shows a `current / total` counter; matched cards get an antique-gold full-card highlight.

**Architecture:** A shared `useSearchMatches()` composable (whole-graph, locale-aware matching) feeds both the search field counter and `TreeView`'s target resolution. `uiStore` carries the query + an Enter-cycling cursor. `TreeView` resolves the target (re-rooting via `familyStore.setFocus` when the match is off-layout) and passes a sequenced `centerRequest` prop to `OakTree`, which drives a new animated `centerOnPoint` camera API in `usePanZoom` built on a pure `centerOn` helper in `panZoom.ts`.

**Tech Stack:** Vue 3 + TypeScript, Pinia, vue-i18n, SCSS, Vitest + @vue/test-utils (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-10-search-center-on-match-design.md`

---

## Environment notes (read first)

- **Work in this worktree/branch** (`claude/inspiring-tesla-8152d8`). Commit after every task. Do NOT merge or push without the owner's say-so.
- **Node:** the system Node 18 shadows the required Node 22. Before any `npm`/`npx` command, prepend the portable Node 22 to PATH (PowerShell):

  ```powershell
  $env:PATH = "$env:LOCALAPPDATA\Programs\nodejs-22;$env:PATH"
  ```

- All frontend commands run from `src/frontend`.
- Run a single spec file: `npx vitest run src/<path>.spec.ts`. Run everything: `npm test`.

## File map

| File | Change |
| --- | --- |
| `src/frontend/src/interactions/panZoom.ts` | Add pure `centerOn()`, `CenterRequest` type, readable-zoom constants |
| `src/frontend/src/interactions/panZoom.spec.ts` | Tests for `centerOn` |
| `src/frontend/src/stores/uiStore.ts` (+ spec) | `searchCursor` state, `advanceSearchCursor()`, reset in `setSearch()` |
| `src/frontend/src/composables/useSearchMatches.ts` (+ spec, new) | Whole-graph match list, ordering, cursor → current target |
| `src/frontend/src/i18n/messages/{en,ru,be}.ts` | `search.matches` aria-label key |
| `src/frontend/src/components/SearchField.vue` (+ spec) | Enter → advance cursor; `current / total` counter |
| `src/frontend/src/interactions/usePanZoom.ts` (+ spec) | `animateTo()` glide, `centerOnPoint()`, gesture cancellation |
| `src/frontend/src/components/OakTree.vue` (+ spec) | `centerRequest` prop + camera watcher; gold match-highlight CSS |
| `src/frontend/src/views/TreeView.vue` (+ spec) | Debounced target resolution, re-focus, `:center-request` |
| `src/frontend/src/styles/tokens.scss` | `--match-paper` token |
| `src/frontend/src/components/PersonMedallion.vue` | 0.2 s fill/stroke transitions |

---

### Task 1: Pure camera math — `centerOn` in panZoom.ts

**Files:**
- Modify: `src/frontend/src/interactions/panZoom.ts`
- Test: `src/frontend/src/interactions/panZoom.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/frontend/src/interactions/panZoom.spec.ts` (and add `centerOn` to the import from `./panZoom`):

```ts
describe('centerOn', () => {
  it('puts the content point at the screen centre at the current scale', () => {
    const vp = centerOn({ x: 100, y: 50 }, { width: 800, height: 600 }, 2);
    expect(vp).toEqual({ x: 400 - 200, y: 300 - 100, k: 2 });
  });

  it('keeps the scale when at or above the readability threshold', () => {
    expect(centerOn({ x: 0, y: 0 }, { width: 100, height: 100 }, 0.8).k).toBe(0.8);
    expect(centerOn({ x: 0, y: 0 }, { width: 100, height: 100 }, 3).k).toBe(3);
  });

  it('raises a low scale to natural size so the centred card is legible', () => {
    const vp = centerOn({ x: 100, y: 50 }, { width: 800, height: 600 }, 0.5);
    expect(vp.k).toBe(1);
    expect(vp.x).toBe(400 - 100);
    expect(vp.y).toBe(300 - 50);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `src/frontend`): `npx vitest run src/interactions/panZoom.spec.ts`
Expected: FAIL — `centerOn` is not exported.

- [ ] **Step 3: Implement `centerOn` + the `CenterRequest` type**

Append to `src/frontend/src/interactions/panZoom.ts`:

```ts
export const READABLE_SCALE_THRESHOLD = 0.8;
export const READABLE_SCALE = 1;

// A sequenced camera command: centre the node with this id. `seq` increases on
// every request so repeating the same target still re-triggers the move.
export interface CenterRequest {
  id: string;
  seq: number;
}

// Put a content-space point at the screen centre. Below the readability
// threshold the scale is raised to natural size so the centred card is
// legible; otherwise the user's zoom is preserved and the move is pan-only.
export function centerOn(point: Point, size: Size, currentK: number): Viewport {
  const k = currentK < READABLE_SCALE_THRESHOLD ? READABLE_SCALE : currentK;
  return {
    x: size.width / 2 - point.x * k,
    y: size.height / 2 - point.y * k,
    k
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/interactions/panZoom.spec.ts`
Expected: PASS (all suites in the file).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/interactions/panZoom.ts src/frontend/src/interactions/panZoom.spec.ts
git commit -m "Add centerOn camera math with the readable-zoom rule"
```

---

### Task 2: Search cursor in uiStore

**Files:**
- Modify: `src/frontend/src/stores/uiStore.ts`
- Test: `src/frontend/src/stores/uiStore.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append inside `describe('uiStore', ...)` in `src/frontend/src/stores/uiStore.spec.ts`:

```ts
  it('advanceSearchCursor increments the cursor', () => {
    const ui = useUiStore();
    expect(ui.searchCursor).toBe(0);
    ui.advanceSearchCursor();
    ui.advanceSearchCursor();
    expect(ui.searchCursor).toBe(2);
  });

  it('setSearch stores the query and resets the cursor', () => {
    const ui = useUiStore();
    ui.advanceSearchCursor();
    ui.setSearch('anna');
    expect(ui.search).toBe('anna');
    expect(ui.searchCursor).toBe(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/stores/uiStore.spec.ts`
Expected: FAIL — `searchCursor` undefined / `advanceSearchCursor` is not a function.

- [ ] **Step 3: Implement**

In `src/frontend/src/stores/uiStore.ts`:

```ts
interface UiState {
  orientation: Orientation;
  search: string;
  searchCursor: number;
}
```

```ts
  state: (): UiState => ({
    orientation: 'vertical',
    search: '',
    searchCursor: 0
  }),
```

Replace `setSearch` and add the new action:

```ts
    setSearch(query: string): void {
      this.search = query;
      this.searchCursor = 0;
    },
    advanceSearchCursor(): void {
      this.searchCursor += 1;
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/stores/uiStore.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/stores/uiStore.ts src/frontend/src/stores/uiStore.spec.ts
git commit -m "Track an Enter-cycling search cursor in the ui store"
```

---

### Task 3: `useSearchMatches` composable

**Files:**
- Create: `src/frontend/src/composables/useSearchMatches.ts`
- Test: `src/frontend/src/composables/useSearchMatches.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/frontend/src/composables/useSearchMatches.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSearchMatches, personMatchesQuery } from './useSearchMatches';
import { useFamilyStore } from '../stores/familyStore';
import { useUiStore } from '../stores/uiStore';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonSummary } from '../types/family';

function person(id: string, given: string, surname: string, birthYear: number | null): PersonSummary {
  return {
    id,
    givenName: { ru: given, be: null, en: given },
    surname: { ru: surname, be: null, en: surname },
    maidenName: null,
    sex: 'male',
    birthYear,
    deathYear: null,
    vocation: 'other',
    portrait: null,
    parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false,
    isDefaultRoot: false
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  useFamilyStore().people = [
    person('a', 'Anna', 'Oak', 1850),
    person('b', 'Boris', 'Oak', 1880),
    person('c', 'Anton', 'Pine', 1920),
    person('d', 'Nadia', 'Oak', null)
  ];
});

describe('personMatchesQuery', () => {
  it('matches a case-insensitive substring of the given name or surname', () => {
    const p = person('x', 'Anna', 'Oak', 1900);
    expect(personMatchesQuery(p, 'ann', 'en')).toBe(true);
    expect(personMatchesQuery(p, 'OAK', 'en')).toBe(true);
    expect(personMatchesQuery(p, 'zzz', 'en')).toBe(false);
  });

  it('never matches a blank query', () => {
    expect(personMatchesQuery(person('x', 'Anna', 'Oak', 1900), '   ', 'en')).toBe(false);
  });
});

describe('useSearchMatches', () => {
  it('returns no matches for a blank query', () => {
    const { matches, total, currentIndex, current } = useSearchMatches();
    expect(matches.value).toEqual([]);
    expect(total.value).toBe(0);
    expect(currentIndex.value).toBe(-1);
    expect(current.value).toBeNull();
  });

  it('orders matches youngest first, people without a birth year last', () => {
    useUiStore().setSearch('oak');
    const { matches } = useSearchMatches();
    expect(matches.value.map(p => p.id)).toEqual(['b', 'a', 'd']);
  });

  it('targets the cursor match modulo the total, wrapping around', () => {
    const ui = useUiStore();
    ui.setSearch('oak');
    const { current, currentIndex } = useSearchMatches();
    expect(current.value?.id).toBe('b');
    ui.advanceSearchCursor();
    expect(current.value?.id).toBe('a');
    ui.advanceSearchCursor();
    ui.advanceSearchCursor(); // 3 % 3 -> wraps to the first
    expect(currentIndex.value).toBe(0);
    expect(current.value?.id).toBe('b');
  });

  it('matches across the whole graph by given name too', () => {
    useUiStore().setSearch('an');
    const { matches } = useSearchMatches();
    // Anton (1920) is younger than Anna (1850)
    expect(matches.value.map(p => p.id)).toEqual(['c', 'a']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/composables/useSearchMatches.spec.ts`
Expected: FAIL — cannot resolve `./useSearchMatches`.

- [ ] **Step 3: Implement the composable**

Create `src/frontend/src/composables/useSearchMatches.ts`:

```ts
import { computed } from 'vue';
import { useFamilyStore } from '../stores/familyStore';
import { useUiStore } from '../stores/uiStore';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import type { Locale } from '../constants/locales';
import type { PersonSummary } from '../types/family';

// Shared search predicate: the query is a case-insensitive substring of the
// localized given name or surname (mirrors the tree highlight rule).
export function personMatchesQuery(person: PersonSummary, query: string, locale: Locale): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return false;
  }
  const given = localize(person.givenName, locale).toLowerCase();
  const surname = localize(person.surname, locale).toLowerCase();
  return given.includes(q) || surname.includes(q);
}

// Single source of truth for nav-bar search: who matches the query, in what
// order they are visited (youngest first; unknown birth years last), and which
// match the camera currently targets via the Enter-cycling cursor.
export function useSearchMatches() {
  const family = useFamilyStore();
  const ui = useUiStore();
  const locale = useLocaleStore();

  const matches = computed<PersonSummary[]>(() =>
    family.people
      .filter(person => personMatchesQuery(person, ui.search, locale.currentLocale))
      .sort((a, b) => (b.birthYear ?? -Infinity) - (a.birthYear ?? -Infinity))
  );
  const total = computed(() => matches.value.length);
  // 0-based index of the camera target; -1 when there are no matches.
  const currentIndex = computed(() => (total.value === 0 ? -1 : ui.searchCursor % total.value));
  const current = computed<PersonSummary | null>(() =>
    currentIndex.value < 0 ? null : matches.value[currentIndex.value]
  );

  return { matches, total, currentIndex, current };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/composables/useSearchMatches.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/composables/useSearchMatches.ts src/frontend/src/composables/useSearchMatches.spec.ts
git commit -m "Add useSearchMatches: whole-graph search with youngest-first cycling"
```

---

### Task 4: Search field — Enter cycling + match counter

**Files:**
- Modify: `src/frontend/src/components/SearchField.vue`
- Modify: `src/frontend/src/i18n/messages/en.ts:54`, `src/frontend/src/i18n/messages/ru.ts:54`, `src/frontend/src/i18n/messages/be.ts:54`
- Test: `src/frontend/src/components/SearchField.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `src/frontend/src/components/SearchField.spec.ts`, add imports and a fixture helper at the top (after the existing imports):

```ts
import { useFamilyStore } from '../stores/familyStore';
import type { PersonSummary } from '../types/family';

function person(id: string, given: string, surname: string, birthYear: number | null): PersonSummary {
  return {
    id,
    givenName: { ru: given, be: null, en: given },
    surname: { ru: surname, be: null, en: surname },
    maidenName: null,
    sex: 'male',
    birthYear,
    deathYear: null,
    vocation: 'other',
    portrait: null,
    parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false,
    isDefaultRoot: false
  };
}
```

Append inside `describe('SearchField', ...)`:

```ts
  it('Enter advances the search cursor only when the query is non-blank', async () => {
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    const ui = useUiStore();

    await wrapper.get('[data-test="search-input"]').trigger('keydown.enter');
    expect(ui.searchCursor).toBe(0);

    await wrapper.get('[data-test="search-input"]').setValue('an');
    await wrapper.get('[data-test="search-input"]').trigger('keydown.enter');
    expect(ui.searchCursor).toBe(1);
  });

  it('shows a current/total counter for a non-blank query', async () => {
    useFamilyStore().people = [person('a', 'Anna', 'Oak', 1850), person('b', 'Boris', 'Oak', 1880)];
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    const ui = useUiStore();

    await wrapper.get('[data-test="search-input"]').setValue('oak');
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 / 2');

    ui.advanceSearchCursor();
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('2 / 2');
  });

  it('hides the counter when the query is blank', () => {
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    expect(wrapper.find('[data-test="search-count"]').exists()).toBe(false);
  });

  it('shows 0 when nothing matches', async () => {
    useFamilyStore().people = [person('a', 'Anna', 'Oak', 1850)];
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    await wrapper.get('[data-test="search-input"]').setValue('zzz');
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('0');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/SearchField.spec.ts`
Expected: FAIL — `[data-test="search-count"]` not found; cursor stays 0 on Enter.

- [ ] **Step 3: Add the i18n key in all three locales**

In `src/frontend/src/i18n/messages/en.ts` line 54:

```ts
  search: { placeholder: 'Search by name…', label: 'Search', matches: 'Matches found' },
```

In `src/frontend/src/i18n/messages/ru.ts` line 54:

```ts
  search: { placeholder: 'Поиск по имени…', label: 'Поиск', matches: 'Найдено совпадений' },
```

In `src/frontend/src/i18n/messages/be.ts` line 54:

```ts
  search: { placeholder: 'Пошук па імені…', label: 'Пошук', matches: 'Знойдзена супадзенняў' },
```

- [ ] **Step 4: Implement the component changes**

Replace the `<script setup>` block of `src/frontend/src/components/SearchField.vue`:

```ts
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUiStore } from '../stores/uiStore';
import { useSearchMatches } from '../composables/useSearchMatches';

const ui = useUiStore();
const { t } = useI18n({ useScope: 'global' });
const value = computed({ get: () => ui.search, set: v => ui.setSearch(v) });

const { total, currentIndex } = useSearchMatches();
const showCounter = computed(() => ui.search.trim() !== '');
const counter = computed(() => (total.value === 0 ? '0' : `${currentIndex.value + 1} / ${total.value}`));

function onEnter(): void {
  if (ui.search.trim() !== '') {
    ui.advanceSearchCursor();
  }
}
```

In the template, add the Enter handler to the input and the counter span after it:

```html
    <input
      v-model="value"
      type="search"
      class="search__input"
      data-test="search-input"
      :aria-label="t('search.label')"
      :placeholder="t('search.placeholder')"
      @search="value = ($event.target as HTMLInputElement).value"
      @keydown.enter="onEnter"
    />
    <span
      v-if="showCounter"
      class="search__count"
      :class="{ 'search__count--empty': total === 0 }"
      data-test="search-count"
      role="status"
      :aria-label="t('search.matches')"
    >{{ counter }}</span>
```

In the scoped styles, add inside `.search { ... }`:

```scss
  &__count {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--ink-soft);
    white-space: nowrap;
    &--empty { color: var(--ink-faint); }
  }
```

- [ ] **Step 5: Run the tests to verify they pass (plus i18n parity)**

Run: `npx vitest run src/components/SearchField.spec.ts src/i18n/messages/messages.spec.ts`
Expected: PASS — including the messages parity spec (the `matches` key exists in all three locales).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/SearchField.vue src/frontend/src/components/SearchField.spec.ts src/frontend/src/i18n/messages/en.ts src/frontend/src/i18n/messages/ru.ts src/frontend/src/i18n/messages/be.ts
git commit -m "Search field: Enter cycles matches and a current/total counter appears"
```

---

### Task 5: Camera glide — `animateTo` + `centerOnPoint` in usePanZoom

**Files:**
- Modify: `src/frontend/src/interactions/usePanZoom.ts`
- Test: `src/frontend/src/interactions/usePanZoom.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append inside `describe('usePanZoom', ...)` in `src/frontend/src/interactions/usePanZoom.spec.ts`. Also extend the existing `import { describe, it, expect, beforeEach, vi } from 'vitest';` — `vi` is already imported, nothing to change there.

```ts
  function stubRect(pz: ReturnType<typeof usePanZoom>, width = 200, height = 200): void {
    (pz.svgRef.value as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      () => ({ width, height, left: 0, top: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} }) as DOMRect;
  }

  it('centerOnPoint jumps instantly when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {}
    }));
    const { pz } = host(null);
    stubRect(pz);

    pz.centerOnPoint({ x: 30, y: 40 });

    // rect 200x200, k=1 (>= 0.8 keeps the zoom): x = 100 - 30, y = 100 - 40
    expect(pz.viewport.value).toEqual({ x: 70, y: 60, k: 1 });
    vi.unstubAllGlobals();
  });

  it('centerOnPoint glides toward the target over animation frames', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { pz } = host(null);
    stubRect(pz);

    pz.centerOnPoint({ x: 60, y: 40 }); // target: {x: 40, y: 60, k: 1}
    expect(frames).toHaveLength(1);

    frames[0](175); // halfway: ease-in-out(0.5) = 0.5
    expect(pz.viewport.value.x).toBeCloseTo(20);
    expect(pz.viewport.value.y).toBeCloseTo(30);

    frames[1](350); // done
    expect(pz.viewport.value).toEqual({ x: 40, y: 60, k: 1 });
    expect(frames).toHaveLength(2); // no frame scheduled past completion

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a pointer press cancels an in-flight glide', () => {
    const frames: FrameRequestCallback[] = [];
    const cancelSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { pz } = host(null);
    stubRect(pz);

    pz.centerOnPoint({ x: 60, y: 40 });
    pz.onPointerDown({ clientX: 10, clientY: 10, button: 0, preventDefault() {} } as PointerEvent);

    expect(cancelSpy).toHaveBeenCalledWith(1);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a glide counts as a user adjustment so a resize will not refit', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {}
    }));
    const { pz } = host({ minX: 0, maxX: 1000, minY: 0, maxY: 1000 });
    stubRect(pz);

    pz.centerOnPoint({ x: 30, y: 40 });
    const after = { ...pz.viewport.value };
    pz.fit(); // a manual fit still works…
    expect(pz.viewport.value).not.toEqual(after);
    vi.unstubAllGlobals();
  });
```

> Note: the last test only proves `centerOnPoint` moved the camera and `fit()` is still callable; the `userAdjusted` flag is internal — its resize behavior is covered by the existing ResizeObserver wiring, which checks `userAdjusted` before refitting.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/interactions/usePanZoom.spec.ts`
Expected: FAIL — `pz.centerOnPoint` is not a function.

- [ ] **Step 3: Implement glide + cancellation**

In `src/frontend/src/interactions/usePanZoom.ts`:

1. Extend the import from `./panZoom`:

```ts
import {
  DEFAULT_LIMITS,
  IDENTITY,
  centerOn,
  fitToBounds,
  panBy,
  pinchZoom,
  zoomAt,
  type Bounds,
  type Point,
  type ScaleLimits,
  type Viewport
} from './panZoom';
```

2. Add a module constant next to `DRAG_THRESHOLD` / `WHEEL_STEP`:

```ts
const GLIDE_MS = 350; // search "go to person" camera glide duration
```

3. Inside `usePanZoom`, after the `pinchPrevDistance` declaration, add:

```ts
  let glideHandle: number | null = null;

  function cancelGlide(): void {
    if (glideHandle != null) {
      cancelAnimationFrame(glideHandle);
      glideHandle = null;
    }
  }

  function prefersReducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  }

  // Glide the camera to `target`. Counts as a user adjustment so a later
  // resize won't undo a search jump. Instant under prefers-reduced-motion.
  function animateTo(target: Viewport, durationMs = GLIDE_MS): void {
    cancelGlide();
    userAdjusted.value = true;
    if (durationMs <= 0 || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      viewport.value = { ...target };
      return;
    }
    const from = { ...viewport.value };
    const startedAt = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = easeInOutQuad(t);
      viewport.value = {
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        k: from.k + (target.k - from.k) * eased
      };
      glideHandle = t < 1 ? requestAnimationFrame(step) : null;
    };
    glideHandle = requestAnimationFrame(step);
  }

  // Centre a content-space point in the SVG (the search "go to person" move).
  function centerOnPoint(point: Point): void {
    const rect = rectOf();
    if (!rect) {
      return;
    }
    animateTo(centerOn(point, { width: rect.width, height: rect.height }, viewport.value.k));
  }
```

4. Cancel the glide on every user gesture — add `cancelGlide();` as the first statement of `onWheel` (before `event.preventDefault()` is fine, keep it first), and in `onPointerDown` right after the `button !== 0` guard, and as the first statement of `onTouchStart`.

5. Clean up on unmount — extend the existing `onBeforeUnmount`:

```ts
  onBeforeUnmount(() => {
    observer?.disconnect();
    cancelGlide();
  });
```

6. Export the new API — add `animateTo` and `centerOnPoint` to the returned object:

```ts
  return {
    fit,
    svgRef,
    viewport,
    transform,
    dragMoved,
    animateTo,
    centerOnPoint,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/interactions/usePanZoom.spec.ts`
Expected: PASS (existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/interactions/usePanZoom.ts src/frontend/src/interactions/usePanZoom.spec.ts
git commit -m "usePanZoom: animated centerOnPoint glide with gesture cancellation"
```

---

### Task 6: OakTree — `centerRequest` prop drives the camera

**Files:**
- Modify: `src/frontend/src/components/OakTree.vue`
- Test: `src/frontend/src/components/OakTree.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append inside `describe('OakTree', ...)` in `src/frontend/src/components/OakTree.spec.ts`, and add `vi` to the vitest import (`import { describe, it, expect, beforeEach, vi } from 'vitest';`):

```ts
  function stubSvgRect(wrapper: ReturnType<typeof mount>, width = 800, height = 600): void {
    (wrapper.find('svg').element as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      () => ({ width, height, left: 0, top: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} }) as DOMRect;
  }

  function stubReducedMotion(): void {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {}
    }));
  }

  it('centers the camera on the requested person', async () => {
    stubReducedMotion();
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    stubSvgRect(wrapper);
    const node = layout.nodes.find(n => n.id === 'b')!;

    await wrapper.setProps({ centerRequest: { id: 'b', seq: 1 } });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.oak__viewport').attributes('transform'))
      .toBe(`translate(${400 - node.x},${300 - node.y}) scale(1)`);
    vi.unstubAllGlobals();
  });

  it('re-centers when the same person is requested again after a pan', async () => {
    stubReducedMotion();
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    stubSvgRect(wrapper);
    const node = layout.nodes.find(n => n.id === 'b')!;
    const centered = `translate(${400 - node.x},${300 - node.y}) scale(1)`;

    await wrapper.setProps({ centerRequest: { id: 'b', seq: 1 } });
    await wrapper.vm.$nextTick();

    // user pans away…
    await wrapper.find('svg').trigger('pointerdown', { clientX: 100, clientY: 100, button: 0 });
    await wrapper.find('svg').trigger('pointermove', { clientX: 160, clientY: 130 });
    await wrapper.find('svg').trigger('pointerup');
    expect(wrapper.get('.oak__viewport').attributes('transform')).not.toBe(centered);

    // …Enter re-issues the same target with a new seq → camera returns
    await wrapper.setProps({ centerRequest: { id: 'b', seq: 2 } });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.oak__viewport').attributes('transform')).toBe(centered);
    vi.unstubAllGlobals();
  });

  it('ignores a request for a person missing from the layout', async () => {
    stubReducedMotion();
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    stubSvgRect(wrapper);
    const before = wrapper.get('.oak__viewport').attributes('transform');

    await wrapper.setProps({ centerRequest: { id: 'ghost', seq: 1 } });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.oak__viewport').attributes('transform')).toBe(before);
    vi.unstubAllGlobals();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/OakTree.spec.ts`
Expected: FAIL — the transform never changes (the prop does not exist yet).

- [ ] **Step 3: Implement the prop + watcher**

In `src/frontend/src/components/OakTree.vue`:

1. Extend the type-only import from `../interactions/panZoom`:

```ts
import type { Bounds, CenterRequest, Viewport } from '../interactions/panZoom';
```

2. Extend the props:

```ts
const props = defineProps<{
  layout: TreeLayout;
  selectedId?: string | null;
  orientation?: 'vertical' | 'horizontal';
  centerRequest?: CenterRequest | null;
}>();
```

3. Add `centerOnPoint` to the destructuring of `usePanZoom(...)` (alongside `fit`, `svgRef`, …).

4. Add the camera watcher AFTER the existing orientation watcher (`watch(() => props.orientation, ...)`) — order matters, see the comment:

```ts
// Search navigation: glide the camera to the requested person. Watches layout
// too, so a search re-focus or an orientation flip re-centers the target at
// its new coordinates. Declared after the orientation re-fit watcher so both
// run in the same post flush and the centering wins.
watch(
  [() => props.centerRequest, () => props.layout],
  ([request]) => {
    if (!request) {
      return;
    }
    const node = props.layout.nodes.find(n => n.id === request.id);
    if (node) {
      centerOnPoint({ x: node.x, y: node.y });
    }
  },
  { flush: 'post' }
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/OakTree.spec.ts`
Expected: PASS (existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/OakTree.vue src/frontend/src/components/OakTree.spec.ts
git commit -m "OakTree: sequenced centerRequest prop glides the camera to a person"
```

---

### Task 7: TreeView wiring — debounced targeting + re-focus

**Files:**
- Modify: `src/frontend/src/views/TreeView.vue`
- Test: `src/frontend/src/views/TreeView.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `src/frontend/src/views/TreeView.spec.ts`:

1. Add imports:

```ts
import OakTree from '../components/OakTree.vue';
import { useFamilyStore } from '../stores/familyStore';
import { useLocaleStore } from '../stores/localeStore';
```

2. Add a third, **unconnected** person to the shared `graph` fixture so an off-layout match exists (the layout rooted at `a` contains only `a` and `b`; existing node-count assertions stay valid):

```ts
    { id: 'c', givenName: { ru: 'Ц', be: null, en: 'C' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'male', birthYear: 1900, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false }
```

3. Append the new tests inside `describe('TreeView', ...)`:

```ts
  it('search re-roots the tree when the match is outside the rendered layout', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();
    useLocaleStore().setLocale('en');
    const ui = useUiStore();
    const family = useFamilyStore();
    expect(family.focusId).toBe('a');

    // Person c is the youngest 'X' and is NOT in the layout rooted at a.
    vi.useFakeTimers();
    ui.setSearch('X');
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await flushPromises();

    expect(family.focusId).toBe('c');
    expect(wrapper.findComponent(OakTree).props('centerRequest')).toMatchObject({ id: 'c' });
  });

  it('Enter cycles to the next match immediately, re-rooting only when needed', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();
    useLocaleStore().setLocale('en');
    const ui = useUiStore();
    const family = useFamilyStore();

    vi.useFakeTimers();
    ui.setSearch('X');
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await flushPromises();
    expect(family.focusId).toBe('c'); // youngest first

    ui.advanceSearchCursor(); // Enter: next youngest is b, off c's layout → re-root
    await flushPromises();
    expect(family.focusId).toBe('b');
    expect(wrapper.findComponent(OakTree).props('centerRequest')).toMatchObject({ id: 'b' });

    ui.advanceSearchCursor(); // a is b's father — already in b's layout → no re-root
    await flushPromises();
    expect(family.focusId).toBe('b');
    expect(wrapper.findComponent(OakTree).props('centerRequest')).toMatchObject({ id: 'a' });
  });

  it('Enter with a single match re-issues the request with a new seq', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();
    useLocaleStore().setLocale('en');
    const ui = useUiStore();

    vi.useFakeTimers();
    ui.setSearch('B'); // matches only person b
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await flushPromises();
    const first = wrapper.findComponent(OakTree).props('centerRequest') as { id: string; seq: number };
    expect(first).toMatchObject({ id: 'b' });

    ui.advanceSearchCursor();
    await flushPromises();
    const second = wrapper.findComponent(OakTree).props('centerRequest') as { id: string; seq: number };
    expect(second.id).toBe('b');
    expect(second.seq).toBeGreaterThan(first.seq);
  });

  it('clearing the search clears the center request without moving focus', async () => {
    const router = makeRouter();
    router.push('/');
    await router.isReady();
    const wrapper = mount(TreeView, { global: { plugins: [router, i18n] } });
    await flushPromises();
    useLocaleStore().setLocale('en');
    const ui = useUiStore();
    const family = useFamilyStore();

    vi.useFakeTimers();
    ui.setSearch('X');
    await wrapper.vm.$nextTick();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    await flushPromises();
    expect(family.focusId).toBe('c');

    ui.setSearch('');
    await flushPromises();

    expect(wrapper.findComponent(OakTree).props('centerRequest')).toBeNull();
    expect(family.focusId).toBe('c'); // re-focus persists like any navigation
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/views/TreeView.spec.ts`
Expected: existing tests PASS, new tests FAIL (`focusId` stays `'a'`; `centerRequest` prop undefined).

- [ ] **Step 3: Implement the wiring**

In `src/frontend/src/views/TreeView.vue`:

1. Extend imports:

```ts
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useSearchMatches } from '../composables/useSearchMatches';
import type { CenterRequest, Viewport } from '../interactions/panZoom';
```

(The `Viewport` type import already exists — merge `CenterRequest` into it.)

2. After the `layout` computed at the bottom of the script block, add:

```ts
const SEARCH_CENTER_DEBOUNCE_MS = 300;

// Search → camera: follow the current match. Typing is debounced; Enter
// (cursor change) is an explicit command and applies immediately. A match
// outside the rendered layout re-roots the tree onto that person first.
const { current } = useSearchMatches();
const centerRequest = ref<CenterRequest | null>(null);
let centerSeq = 0;
let searchDebounce: ReturnType<typeof setTimeout> | null = null;

function clearSearchDebounce(): void {
  if (searchDebounce != null) {
    clearTimeout(searchDebounce);
    searchDebounce = null;
  }
}

watch(
  [() => current.value?.id ?? null, () => ui.searchCursor],
  ([id, cursor], [, prevCursor]) => {
    clearSearchDebounce();
    if (!id) {
      centerRequest.value = null;
      return;
    }
    const apply = (): void => {
      if (baseLayout.value && !baseLayout.value.nodes.some(node => node.id === id)) {
        store.setFocus(id);
      }
      centerRequest.value = { id, seq: ++centerSeq };
    };
    if (cursor !== prevCursor) {
      apply();
    } else {
      searchDebounce = setTimeout(() => {
        searchDebounce = null;
        apply();
      }, SEARCH_CENTER_DEBOUNCE_MS);
    }
  }
);

onBeforeUnmount(clearSearchDebounce);
```

3. In the template, pass the prop to OakTree:

```html
        <OakTree :layout="layout" :selected-id="selectedId" :orientation="ui.orientation" :center-request="centerRequest" @select="onSelect" @viewport="onViewport" />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/views/TreeView.spec.ts`
Expected: PASS (all, including the pre-existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/TreeView.vue src/frontend/src/views/TreeView.spec.ts
git commit -m "TreeView: search targets glide the camera and re-root the oak when needed"
```

---

### Task 8: Antique-gold match highlight

**Files:**
- Modify: `src/frontend/src/styles/tokens.scss`
- Modify: `src/frontend/src/components/OakTree.vue` (styles only)
- Modify: `src/frontend/src/components/PersonMedallion.vue` (styles only)

This task is CSS-only; the `oak__node--match` class application is already covered by the existing OakTree spec ("highlights nodes whose name matches the search query"). Visual confirmation happens in Task 9.

- [ ] **Step 1: Add the token**

In `src/frontend/src/styles/tokens.scss`, add the SCSS variable after `$umber: #9c5a32;`:

```scss
$match-paper:  #f8e7af; // search-match scroll fill (antique gold)
```

and the CSS custom property after `--umber: #{$umber};` in `:root`:

```scss
  --match-paper: #{$match-paper};
```

- [ ] **Step 2: Replace the match rule in OakTree.vue**

In `src/frontend/src/components/OakTree.vue`, replace the line:

```scss
.oak__node--match :deep(.oak__medallion) { stroke: var(--leaf-bright); stroke-width: 3.5; }
```

with:

```scss
// Match highlight (antique gold): the whole cartouche reads "illuminated" —
// scroll paper, roll ends, and portrait ring all shift to the gilt family.
.oak__node--match :deep(.oak__scroll-body) {
  fill: var(--match-paper);
  stroke: var(--gilt-deep);
  stroke-width: 1.4;
}
.oak__node--match :deep(.oak__scroll-roll) {
  stroke: var(--gilt-deep);
}
.oak__node--match :deep(.oak__medallion) {
  stroke: var(--gilt-deep);
  stroke-width: 4.5;
}
// Selection beats match on the ring (the scroll stays gold).
.oak__node--match :deep(.oak__medallion--selected) {
  stroke: var(--leaf-deep);
  stroke-width: 3.5;
}
```

- [ ] **Step 3: Add transitions in PersonMedallion.vue**

In `src/frontend/src/components/PersonMedallion.vue` scoped styles:

To `.oak__scroll-body` add:

```scss
  transition: fill 0.2s ease, stroke 0.2s ease;
```

To `.oak__scroll-roll` add:

```scss
  transition: stroke 0.2s ease;
```

To `.oak__gilt-band` add:

```scss
  transition: stroke 0.2s ease, stroke-width 0.2s ease;
```

- [ ] **Step 4: Run the frontend suite (regression check)**

Run: `npm test`
Expected: PASS — no spec asserts the old `--leaf-bright` stroke, so this is a pure-CSS change.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/styles/tokens.scss src/frontend/src/components/OakTree.vue src/frontend/src/components/PersonMedallion.vue
git commit -m "Match highlight: the whole card turns antique gold instead of a faint ring"
```

---

### Task 9: Full verification + live check

**Files:** none (verification only)

- [ ] **Step 1: Full frontend suite + production type-check**

From `src/frontend`:

```powershell
npm test
npm run build
```

Expected: all Vitest suites PASS; `vue-tsc` type-check and Vite build succeed with no errors.

- [ ] **Step 2: Backend sanity (untouched, but it is the PR gate)**

From the repo root:

```powershell
dotnet test
```

Expected: PASS (no backend changes were made).

- [ ] **Step 3: Live verification in the running app**

Start both processes (API from repo root, frontend from `src/frontend`):

```powershell
dotnet run --project src/backend/FamilyTree.Api   # http://localhost:5037
npm run dev                                       # http://localhost:5173
```

Then verify in the browser (use the harness preview tools / gstack browse against `http://localhost:5173`):

1. Type a name fragment into the nav-bar search → after ~300 ms the oak glides so the youngest match's card is centered; matched cards show the antique-gold cartouche; counter shows `1 / N`.
2. Press Enter repeatedly → the camera steps through matches youngest → oldest and wraps; the counter advances `2 / N`, `3 / N`, … back to `1 / N`.
3. Search for a person on a branch not currently rendered (someone outside the focus subtree) → the oak re-roots onto them and centers their card; clearing the search leaves the new root in place.
4. Zoom far out (scale clearly below 0.8), search again → the glide also zooms back in to natural size.
5. Start a glide and immediately drag → the glide stops; the drag wins.
6. Clear the query → the counter disappears and the camera stays put.
7. Take a screenshot of a centered gold-highlighted match as proof.

- [ ] **Step 4: Final commit (if any fixups were needed)**

```bash
git status   # confirm clean, or commit fixups with a descriptive message
```

---

### Task 10: Finish the branch

- [ ] Use the **superpowers:finishing-a-development-branch** skill: push the branch, open a PR into `main` (`gh pr create --base main`), and **stop** — the repo owner reviews and merges (squash). Do not self-merge.

PR title suggestion: *"Search navigates the oak: center on matches, cycle with Enter, gold highlight"*.
