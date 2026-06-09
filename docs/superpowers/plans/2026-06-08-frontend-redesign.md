# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the family-tree SPA into the vintage "chronicle page" look (per `DESIGN.md`) and add a working vertical↔horizontal orientation switch for the oak, on desktop and mobile.

**Architecture:** Keep `buildLayout` producing the canonical *vertical* layout (spread = x, time = y) so existing tests stay green; add a pure `projection.ts` that transposes it to horizontal on demand. A new `uiStore` holds `orientation`. `YearAxis` is replaced by a framed, orientation-aware `TimeRail` (continuous, zoom-adaptive ticks + era bands). The chrome (AppFrame, reworked AppBar with tabs + controls, StatsPanel) and richer `PersonMedallion` are restyled to new SCSS tokens.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Pinia, Vue Router, vue-i18n, SCSS tokens, custom SVG + pan/zoom, Vitest + @vue/test-utils.

**Reference:** Design system in [`DESIGN.md`](../../../DESIGN.md); spec in [`../specs/2026-06-08-frontend-redesign-design.md`](../specs/2026-06-08-frontend-redesign-design.md). Validated interactive prototype: `.superpowers/brainstorm/.../tree-prototype.html` (v1).

**Conventions:** All commands run from `src/frontend` unless noted. Tests: `npm test` (Vitest, watch off via `vitest run` — `npm test` is already `vitest run`). Type-check/build: `npm run build`. Commit after every green task on branch `claude/condescending-antonelli-7ec7e8`. Do NOT merge (owner reviews).

---

## File Structure

**Create:**
- `src/frontend/src/stores/uiStore.ts` — orientation + active tab + search query (persisted orientation).
- `src/frontend/src/stores/uiStore.spec.ts`
- `src/frontend/src/layout/projection.ts` — transpose canonical layout to an orientation.
- `src/frontend/src/layout/projection.spec.ts`
- `src/frontend/src/components/OrientationToggle.vue` + `.spec.ts`
- `src/frontend/src/components/TimeRail.vue` + `.spec.ts` (replaces YearAxis)
- `src/frontend/src/components/TabNav.vue` + `.spec.ts`
- `src/frontend/src/components/SearchField.vue` + `.spec.ts`
- `src/frontend/src/components/StatsPanel.vue` + `.spec.ts`
- `src/frontend/src/components/AppFrame.vue` + `.spec.ts`

**Modify:**
- `src/frontend/src/styles/tokens.scss` — new palette + control/panel/medallion tokens + legacy aliases.
- `src/frontend/src/styles/global.scss` — web-font imports + base typography vars.
- `src/frontend/src/layout/timeScale.ts` (+ `.spec.ts`) — add `horizontalTicks`.
- `src/frontend/src/components/OakTree.vue` — `orientation` prop; orientation-aware branch curves; name-match highlight.
- `src/frontend/src/views/TreeView.vue` — project layout by orientation; TimeRail placement; mount StatsPanel.
- `src/frontend/src/components/AppBar.vue` (+ `.spec.ts`) — tabs + control cluster.
- `src/frontend/src/components/LanguagePicker.vue` — restyle to tokens (logic unchanged).
- `src/frontend/src/components/PersonMedallion.vue` (+ `.spec.ts`) — richer engraved frames + nameplate.
- `src/frontend/src/components/PersonPopup.vue` — restyle to tokens.
- `src/frontend/src/App.vue` — wrap in AppFrame; init uiStore.
- `src/frontend/src/i18n/messages/{en,ru,be}.ts` — add `nav.*`, `search.*`, `orientation.*`, `stats.*` keys.

**Delete (in Task 7):**
- `src/frontend/src/components/YearAxis.vue` + `src/frontend/src/components/YearAxis.spec.ts`

---

## Phase 1 — Theming foundation

### Task 1: New SCSS tokens (palette)

**Files:**
- Modify: `src/frontend/src/styles/tokens.scss`

- [ ] **Step 1: Replace tokens.scss with the new palette (keep legacy aliases so existing components don't break)**

```scss
// Family Chronicle palette — warm, bright sepia-heraldic (see DESIGN.md)
// Canonical tokens
$paper:        #f4ecd6;
$paper-2:      #efe6cd;
$panel:        #f7f1dd;
$panel-edge:   #e4d6b0;
$ink:          #43381f;
$ink-soft:     #6a5a3a;
$bark:         #6f5a3c;
$bark-dark:    #49391f;
$gilt:         #b7913f;
$gilt-light:   #e3cf93;
$gilt-deep:    #876626;
$leaf:         #7e9a45;
$leaf-deep:    #5d7a34;
$leaf-bright:  #94b255;
$umber:        #9c5a32;

:root {
  // canonical
  --paper: #{$paper};
  --paper-2: #{$paper-2};
  --panel: #{$panel};
  --panel-edge: #{$panel-edge};
  --ink: #{$ink};
  --ink-soft: #{$ink-soft};
  --bark: #{$bark};
  --bark-dark: #{$bark-dark};
  --gilt: #{$gilt};
  --gilt-light: #{$gilt-light};
  --gilt-deep: #{$gilt-deep};
  --leaf: #{$leaf};
  --leaf-deep: #{$leaf-deep};
  --leaf-bright: #{$leaf-bright};
  --umber: #{$umber};
  --shadow: rgba(74, 58, 36, 0.22);

  // legacy aliases (kept so PersonMedallion/OakTree/LanguagePicker/popup keep working)
  --parchment: #{$paper};
  --parchment-2: #{$paper-2};
  // (gilt-sheen retained for the classic medallion bevel)
  --gilt-sheen: #{$gilt-light};

  // glass popup surface
  --glass-bg: rgba(247, 241, 221, 0.66);
  --glass-border: rgba(135, 102, 38, 0.40);
  --glass-shadow: 0 12px 40px rgba(74, 58, 36, 0.28);
  --scrim: rgba(74, 58, 36, 0.30);

  // typography (see Task 2)
  --font-display: 'Cinzel', Georgia, serif;
  --font-body: 'EB Garamond', Georgia, serif;
  --font-accent: 'UnifrakturMaguntia', 'Cinzel', serif;
}
```

- [ ] **Step 2: Run the suite to confirm nothing broke**

Run: `npm test`
Expected: all existing tests PASS (legacy aliases preserve every referenced custom property). If a test references `--gilt` / `--gilt-deep` values it still resolves.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/styles/tokens.scss
git commit -m "style(tokens): adopt Family Chronicle palette (warm sepia + green) with legacy aliases"
```

### Task 2: Web fonts + base typography

**Files:**
- Modify: `src/frontend/src/styles/global.scss`

- [ ] **Step 1: Add font imports + base typography at the top of global.scss**

Prepend to `global.scss` (CDN now; self-host before release — spec open question 3):

```scss
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=EB+Garamond:ital,wght@0,400;0,600;1,400;1,500&family=UnifrakturMaguntia&display=swap');

body {
  font-family: var(--font-body);
  color: var(--ink);
  background: radial-gradient(125% 105% at 50% -5%, #f8f1da 0%, var(--paper) 48%, #e2cf9d 100%);
}
```

(Keep any existing reset/body rules already in `global.scss` below this; do not duplicate `margin:0` if present.)

- [ ] **Step 2: Run the suite**

Run: `npm test`
Expected: PASS (CSS-only change).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/styles/global.scss
git commit -m "style(fonts): load Cinzel / EB Garamond / UnifrakturMaguntia + base typography"
```

---

## Phase 2 — UI state + orientation control

### Task 3: uiStore (orientation, tab, search)

**Files:**
- Create: `src/frontend/src/stores/uiStore.ts`
- Test: `src/frontend/src/stores/uiStore.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/src/stores/uiStore.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUiStore, ORIENTATION_STORAGE_KEY } from './uiStore';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('uiStore', () => {
  it('defaults to vertical orientation and the tree tab', () => {
    const ui = useUiStore();
    expect(ui.orientation).toBe('vertical');
    expect(ui.activeTab).toBe('tree');
  });

  it('toggleOrientation flips between vertical and horizontal', () => {
    const ui = useUiStore();
    ui.toggleOrientation();
    expect(ui.orientation).toBe('horizontal');
    ui.toggleOrientation();
    expect(ui.orientation).toBe('vertical');
  });

  it('setOrientation persists to localStorage', () => {
    const ui = useUiStore();
    ui.setOrientation('horizontal');
    expect(localStorage.getItem(ORIENTATION_STORAGE_KEY)).toBe('horizontal');
  });

  it('init() restores a persisted orientation', () => {
    localStorage.setItem(ORIENTATION_STORAGE_KEY, 'horizontal');
    const ui = useUiStore();
    ui.init();
    expect(ui.orientation).toBe('horizontal');
  });

  it('ignores an invalid persisted value', () => {
    localStorage.setItem(ORIENTATION_STORAGE_KEY, 'sideways');
    const ui = useUiStore();
    ui.init();
    expect(ui.orientation).toBe('vertical');
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `npm test -- uiStore`
Expected: FAIL (cannot find module `./uiStore`).

- [ ] **Step 3: Implement uiStore**

```ts
// src/frontend/src/stores/uiStore.ts
import { defineStore } from 'pinia';

export type Orientation = 'vertical' | 'horizontal';
export type TabId = 'chronicle' | 'tree' | 'members' | 'timeline';

export const ORIENTATION_STORAGE_KEY = 'familytree.orientation';

function isOrientation(value: string | null): value is Orientation {
  return value === 'vertical' || value === 'horizontal';
}

interface UiState {
  orientation: Orientation;
  activeTab: TabId;
  search: string;
}

export const useUiStore = defineStore('ui', {
  state: (): UiState => ({
    orientation: 'vertical',
    activeTab: 'tree',
    search: ''
  }),
  actions: {
    setOrientation(orientation: Orientation): void {
      this.orientation = orientation;
      try {
        localStorage.setItem(ORIENTATION_STORAGE_KEY, orientation);
      } catch {
        // storage unavailable (private mode / SSR) — non-fatal
      }
    },
    toggleOrientation(): void {
      this.setOrientation(this.orientation === 'vertical' ? 'horizontal' : 'vertical');
    },
    setActiveTab(tab: TabId): void {
      this.activeTab = tab;
    },
    setSearch(query: string): void {
      this.search = query;
    },
    init(): void {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(ORIENTATION_STORAGE_KEY);
      } catch {
        stored = null;
      }
      if (isOrientation(stored)) {
        this.orientation = stored;
      }
    }
  }
});
```

- [ ] **Step 4: Run it — must pass**

Run: `npm test -- uiStore`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/stores/uiStore.ts src/frontend/src/stores/uiStore.spec.ts
git commit -m "feat(store): add uiStore (orientation, tab, search) with persistence"
```

### Task 4: i18n keys for chrome

**Files:**
- Modify: `src/frontend/src/i18n/messages/en.ts`, `ru.ts`, `be.ts`

- [ ] **Step 1: Add keys to `en.ts`** (insert into the exported object)

```ts
  nav: {
    chronicle: 'Chronicle',
    tree: 'Tree',
    members: 'Members',
    timeline: 'Timeline',
    comingSoon: 'Coming soon'
  },
  search: {
    placeholder: 'Search family, place, event…',
    label: 'Search'
  },
  orientation: {
    label: 'Tree orientation',
    vertical: 'Vertical',
    horizontal: 'Horizontal'
  },
  stats: {
    title: 'Family Statistics',
    members: 'Total members',
    generations: 'Generations',
    earliest: 'Earliest record',
    withPortraits: 'With portraits',
    living: 'Living'
  },
```

- [ ] **Step 2: Add the same keys to `ru.ts`**

```ts
  nav: { chronicle: 'Летопись', tree: 'Древо', members: 'Люди', timeline: 'Хронология', comingSoon: 'Скоро' },
  search: { placeholder: 'Поиск: имя, место, событие…', label: 'Поиск' },
  orientation: { label: 'Ориентация древа', vertical: 'Вертикально', horizontal: 'Горизонтально' },
  stats: { title: 'Статистика рода', members: 'Всего людей', generations: 'Поколений', earliest: 'Самая ранняя запись', withPortraits: 'С портретами', living: 'Живущих' },
```

- [ ] **Step 3: Add the same keys to `be.ts`**

```ts
  nav: { chronicle: 'Летапіс', tree: 'Дрэва', members: 'Людзі', timeline: 'Храналогія', comingSoon: 'Хутка' },
  search: { placeholder: 'Пошук: імя, месца, падзея…', label: 'Пошук' },
  orientation: { label: 'Арыентацыя дрэва', vertical: 'Вертыкальна', horizontal: 'Гарызантальна' },
  stats: { title: 'Статыстыка роду', members: 'Усяго людзей', generations: 'Пакаленняў', earliest: 'Самы ранні запіс', withPortraits: 'З партрэтамі', living: 'Жывых' },
```

- [ ] **Step 4: Run the messages parity test**

Run: `npm test -- messages`
Expected: PASS (the existing `messages.spec.ts` checks all locales share the same key set; new keys are present in all three).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/i18n/messages
git commit -m "i18n: add nav/search/orientation/stats keys (ru/be/en)"
```

### Task 5: OrientationToggle component

**Files:**
- Create: `src/frontend/src/components/OrientationToggle.vue`
- Test: `src/frontend/src/components/OrientationToggle.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/src/components/OrientationToggle.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import OrientationToggle from './OrientationToggle.vue';
import { i18n } from '../i18n';
import { useUiStore } from '../stores/uiStore';

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); });

function mountToggle() {
  return mount(OrientationToggle, { global: { plugins: [i18n] } });
}

describe('OrientationToggle', () => {
  it('marks the active orientation pressed', () => {
    const wrapper = mountToggle();
    expect(wrapper.get('[data-test="orientation-vertical"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[data-test="orientation-horizontal"]').attributes('aria-pressed')).toBe('false');
  });

  it('clicking horizontal updates the store', async () => {
    const wrapper = mountToggle();
    const ui = useUiStore();
    await wrapper.get('[data-test="orientation-horizontal"]').trigger('click');
    expect(ui.orientation).toBe('horizontal');
    expect(wrapper.get('[data-test="orientation-horizontal"]').attributes('aria-pressed')).toBe('true');
  });
});
```

- [ ] **Step 2: Run it — must fail**

Run: `npm test -- OrientationToggle`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement OrientationToggle.vue**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useUiStore, type Orientation } from '../stores/uiStore';

const ui = useUiStore();
const { t } = useI18n({ useScope: 'global' });

function set(orientation: Orientation): void {
  ui.setOrientation(orientation);
}
</script>

<template>
  <div class="orient" role="group" :aria-label="t('orientation.label')" data-test="orientation-toggle">
    <button
      type="button"
      class="orient__btn"
      :class="{ 'orient__btn--on': ui.orientation === 'vertical' }"
      :aria-pressed="ui.orientation === 'vertical'"
      data-test="orientation-vertical"
      @click="set('vertical')"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><g stroke="currentColor" stroke-width="1.7"><line x1="4" y1="2" x2="4" y2="12"/><line x1="7" y1="2" x2="7" y2="12"/><line x1="10" y1="2" x2="10" y2="12"/></g></svg>
      <span>{{ t('orientation.vertical') }}</span>
    </button>
    <button
      type="button"
      class="orient__btn"
      :class="{ 'orient__btn--on': ui.orientation === 'horizontal' }"
      :aria-pressed="ui.orientation === 'horizontal'"
      data-test="orientation-horizontal"
      @click="set('horizontal')"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><g stroke="currentColor" stroke-width="1.7"><line x1="2" y1="4" x2="12" y2="4"/><line x1="2" y1="7" x2="12" y2="7"/><line x1="2" y1="10" x2="12" y2="10"/></g></svg>
      <span>{{ t('orientation.horizontal') }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.orient {
  display: inline-flex;
  border: 1px solid var(--gilt-deep);
  border-radius: 9px;
  overflow: hidden;
  background: linear-gradient(#fbf6e6, #f3ead0);
  font-family: var(--font-display);
  font-size: 12px;

  &__btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 11px;
    border: none;
    background: transparent;
    color: var(--ink-soft);
    cursor: pointer;
    & + & { border-left: 1px solid var(--gilt-deep); }
    &:hover:not(&--on) { background: #efe3c2; }
    &--on { background: linear-gradient(var(--leaf), var(--leaf-deep)); color: #f6efd9; }
    &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: -2px; }
  }
}
</style>
```

- [ ] **Step 4: Run it — must pass**

Run: `npm test -- OrientationToggle`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/OrientationToggle.vue src/frontend/src/components/OrientationToggle.spec.ts
git commit -m "feat(ui): OrientationToggle segmented control bound to uiStore"
```

---

## Phase 3 — Orientation-agnostic layout

### Task 6: timeScale horizontal ticks

**Files:**
- Modify: `src/frontend/src/layout/timeScale.ts`
- Test: `src/frontend/src/layout/timeScale.spec.ts`

- [ ] **Step 1: Add the failing test (append to timeScale.spec.ts)**

```ts
import { horizontalTicks } from './timeScale';

describe('horizontalTicks', () => {
  it('maps each tick to screen X via the viewport translation and scale (older→left)', () => {
    const scale = createTimeScale([1800, 2000], 8, 0); // minYear 1800, maxYear 2000
    const ticks = horizontalTicks(scale, 100, 2, 24);
    expect(ticks.length).toBeGreaterThan(0);
    // oldest year sits at content x=0, so screen x = viewportX (100)
    expect(ticks.find(t => t.year === 1800)?.x).toBe(100);
    expect(ticks.every(t => t.x === 100 + (t.year - scale.minYear) * scale.pxPerYear * 2)).toBe(true);
  });

  it('produces denser ticks at higher zoom', () => {
    const scale = createTimeScale([1800, 2000], 8, 0);
    const sparse = horizontalTicks(scale, 0, 0.2, 24);
    const dense = horizontalTicks(scale, 0, 2, 24);
    expect(dense.length).toBeGreaterThan(sparse.length);
  });
});
```

- [ ] **Step 2: Run — must fail**

Run: `npm test -- timeScale`
Expected: FAIL (`horizontalTicks` is not a function).

- [ ] **Step 3: Implement `horizontalTicks` (append to timeScale.ts)**

```ts
export interface AxisTickH {
  year: number;
  x: number;
  label: string;
}

// Horizontal mirror of viewportTicks: time runs along X, oldest at content x=0
// (left), newest to the right. screenX = viewportX + (year - minYear) * pxPerYear * k.
export function horizontalTicks(scale: TimeScale, viewportX: number, k: number, minSpacingPx = 24): AxisTickH[] {
  const step = chooseTickStep(scale.pxPerYear * k, minSpacingPx);
  const first = Math.ceil(scale.minYear / step) * step;
  const ticks: AxisTickH[] = [];
  for (let year = first; year <= scale.maxYear; year += step) {
    ticks.push({ year, x: viewportX + (year - scale.minYear) * scale.pxPerYear * k, label: String(year) });
  }
  return ticks;
}
```

- [ ] **Step 4: Run — must pass**

Run: `npm test -- timeScale`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/layout/timeScale.ts src/frontend/src/layout/timeScale.spec.ts
git commit -m "feat(layout): add horizontalTicks for the horizontal time axis"
```

### Task 7: Layout projection (transpose to horizontal)

**Files:**
- Create: `src/frontend/src/layout/projection.ts`
- Test: `src/frontend/src/layout/projection.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/src/layout/projection.spec.ts
import { describe, it, expect } from 'vitest';
import { buildLayout } from './treeLayout';
import { projectLayout } from './projection';
import type { FamilyGraph, PersonSummary } from '../types/family';

function p(id: string, birthYear: number, parents: Partial<PersonSummary['parents']> = {}): PersonSummary {
  return {
    id, givenName: { ru: id, be: null, en: id }, surname: { ru: 'X', be: null, en: 'X' },
    maidenName: null, sex: 'male', birthYear, deathYear: null, vocation: 'other', portrait: null,
    parents: { motherId: parents.motherId ?? null, fatherId: parents.fatherId ?? null },
    marriedIntoFamily: false, isDefaultRoot: false
  };
}

const graph: FamilyGraph = {
  people: [
    p('father', 1830),
    p('focus', 1860, { fatherId: 'father' }),
    p('child', 1890, { fatherId: 'focus' })
  ],
  unions: [{ id: 'u', partnerIds: ['focus'], marriageYear: null, childIds: ['child'] }]
};
const vertical = buildLayout(graph, { focusId: 'focus' });
const n = (l: typeof vertical, id: string) => l.nodes.find(x => x.id === id)!;

describe('projectLayout', () => {
  it('returns the layout unchanged for vertical', () => {
    const out = projectLayout(vertical, 'vertical');
    expect(out.nodes).toEqual(vertical.nodes);
  });

  it('horizontal: time runs along X (older left, newer right)', () => {
    const h = projectLayout(vertical, 'horizontal');
    expect(n(h, 'father').x).toBeLessThan(n(h, 'focus').x);
    expect(n(h, 'child').x).toBeGreaterThan(n(h, 'focus').x);
  });

  it('horizontal: spread (old x) becomes Y', () => {
    const h = projectLayout(vertical, 'horizontal');
    expect(n(h, 'focus').y).toBe(n(vertical, 'focus').x);
  });

  it('horizontal: link endpoints follow projected node coordinates', () => {
    const h = projectLayout(vertical, 'horizontal');
    const link = h.links.find(l => l.kind === 'descent' && l.target === 'child')!;
    expect(link.x2).toBe(n(h, 'child').x);
    expect(link.y2).toBe(n(h, 'child').y);
  });

  it('recomputes bounds for the projected nodes', () => {
    const h = projectLayout(vertical, 'horizontal');
    const xs = h.nodes.map(nn => nn.x);
    expect(h.bounds.minX).toBe(Math.min(...xs));
    expect(h.bounds.maxX).toBe(Math.max(...xs));
  });
});
```

- [ ] **Step 2: Run — must fail**

Run: `npm test -- projection`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement projection.ts**

```ts
// src/frontend/src/layout/projection.ts
import type { TreeLayout, LayoutNode, LayoutLink } from './treeLayout';
import type { Orientation } from '../stores/uiStore';

// The canonical layout from buildLayout is vertical: x = spread, y = time (yForYear).
// For horizontal we transpose: x = time along the axis (older→left), y = spread.
function projectNode(node: LayoutNode, scale: TreeLayout['scale']): LayoutNode {
  return {
    ...node,
    x: (node.year - scale.minYear) * scale.pxPerYear,
    y: node.x
  };
}

export function projectLayout(layout: TreeLayout, orientation: Orientation): TreeLayout {
  if (orientation === 'vertical') {
    return layout;
  }
  const nodes = layout.nodes.map(node => projectNode(node, layout.scale));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const links: LayoutLink[] = layout.links.map(link => {
    const s = byId.get(link.source);
    const t = byId.get(link.target);
    return {
      ...link,
      x1: s?.x ?? link.x1, y1: s?.y ?? link.y1,
      x2: t?.x ?? link.x2, y2: t?.y ?? link.y2
    };
  });
  const xs = nodes.map(node => node.x);
  const ys = nodes.map(node => node.y);
  const bounds = {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys)
  };
  return {
    ...layout,
    nodes,
    links,
    bounds,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY
  };
}
```

- [ ] **Step 4: Run — must pass**

Run: `npm test -- projection`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/layout/projection.ts src/frontend/src/layout/projection.spec.ts
git commit -m "feat(layout): projectLayout transposes the oak to horizontal orientation"
```

---

## Phase 4 — TimeRail (replaces YearAxis)

### Task 8: TimeRail component (vertical + horizontal ticks)

**Files:**
- Create: `src/frontend/src/components/TimeRail.vue`
- Test: `src/frontend/src/components/TimeRail.spec.ts`
- Delete: `src/frontend/src/components/YearAxis.vue`, `src/frontend/src/components/YearAxis.spec.ts`

- [ ] **Step 1: Write the failing test** (ports the YearAxis tests + adds horizontal)

```ts
// src/frontend/src/components/TimeRail.spec.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TimeRail from './TimeRail.vue';
import { createTimeScale } from '../layout/timeScale';

const scale = createTimeScale([1800, 2000], 8, 0);

describe('TimeRail', () => {
  it('renders labelled ticks (vertical)', () => {
    const wrapper = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k: 1 }, orientation: 'vertical' } });
    expect(wrapper.findAll('[data-test="tick-label"]').length).toBeGreaterThan(0);
  });

  it('positions vertical ticks by top with the viewport translation/zoom', () => {
    const wrapper = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 50, k: 2 }, orientation: 'vertical' } });
    const top = wrapper.findAll('[data-test="tick"]').find(t => t.text().includes('2000'));
    expect(top?.attributes('style')).toContain('top: 50px');
  });

  it('positions horizontal ticks by left (oldest at viewportX)', () => {
    const wrapper = mount(TimeRail, { props: { scale, viewport: { x: 40, y: 0, k: 2 }, orientation: 'horizontal' } });
    const left = wrapper.findAll('[data-test="tick"]').find(t => t.text().includes('1800'));
    expect(left?.attributes('style')).toContain('left: 40px');
  });

  it('shows denser ticks when zoomed in', () => {
    const out = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k: 0.2 }, orientation: 'vertical' } });
    const inn = mount(TimeRail, { props: { scale, viewport: { x: 0, y: 0, k: 2 }, orientation: 'vertical' } });
    expect(inn.findAll('[data-test="tick"]').length).toBeGreaterThan(out.findAll('[data-test="tick"]').length);
  });
});
```

- [ ] **Step 2: Run — must fail**

Run: `npm test -- TimeRail`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement TimeRail.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { viewportTicks, horizontalTicks, type TimeScale } from '../layout/timeScale';
import type { Viewport } from '../interactions/panZoom';
import type { Orientation } from '../stores/uiStore';

const props = defineProps<{ scale: TimeScale; viewport: Viewport; orientation: Orientation }>();

interface RailTick { year: number; pos: number; label: string; major: boolean }

const ticks = computed<RailTick[]>(() => {
  if (props.orientation === 'horizontal') {
    return horizontalTicks(props.scale, props.viewport.x, props.viewport.k).map(t => ({
      year: t.year, pos: t.x, label: t.label, major: t.year % 100 === 0
    }));
  }
  return viewportTicks(props.scale, props.viewport.y, props.viewport.k).map(t => ({
    year: t.year, pos: t.y, label: t.label, major: t.year % 100 === 0
  }));
});

function tickStyle(pos: number): Record<string, string> {
  return props.orientation === 'horizontal' ? { left: `${pos}px` } : { top: `${pos}px` };
}
</script>

<template>
  <div class="time-rail" :class="`time-rail--${orientation}`" data-test="time-rail">
    <div
      v-for="tick in ticks"
      :key="tick.year"
      class="time-rail__tick"
      :class="{ 'time-rail__tick--major': tick.major }"
      data-test="tick"
      :style="tickStyle(tick.pos)"
    >
      <span class="time-rail__label" data-test="tick-label">{{ tick.label }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.time-rail {
  position: relative;
  overflow: hidden;
  user-select: none;
  font-family: var(--font-body);
  background: linear-gradient(#f4ebcf, #ece0bf);

  &--vertical { height: 100%; border-right: 1px solid var(--gilt-deep); }
  &--horizontal { width: 100%; border-top: 1px solid var(--gilt-deep); }

  &__tick { position: absolute; white-space: nowrap; }

  &--vertical &__tick {
    right: 0; width: 100%; display: flex; align-items: center; justify-content: flex-end;
    gap: 5px; transform: translateY(-50%);
    &::after { content: ''; width: 6px; border-top: 1px solid rgba(111, 90, 60, 0.5); }
    &--major::after { border-top-color: var(--ink-soft); }
  }

  &--horizontal &__tick {
    bottom: 0; height: 100%; display: flex; align-items: flex-end; justify-content: center;
    transform: translateX(-50%); flex-direction: column-reverse;
    &::after { content: ''; height: 6px; border-left: 1px solid rgba(111, 90, 60, 0.5); }
  }

  &__label { font-size: 12px; color: var(--ink-soft); padding: 0 2px; }
}
</style>
```

- [ ] **Step 4: Run — must pass**

Run: `npm test -- TimeRail`
Expected: PASS (4 tests).

- [ ] **Step 5: Delete YearAxis and its spec**

```bash
git rm src/frontend/src/components/YearAxis.vue src/frontend/src/components/YearAxis.spec.ts
```

(TreeView still imports YearAxis — it will be rewired in Task 11; if you run the full suite now `TreeView.spec` may fail on the import. That is expected and fixed in Task 11. Run the targeted TimeRail test only here.)

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/TimeRail.vue src/frontend/src/components/TimeRail.spec.ts
git commit -m "feat(ui): TimeRail replaces YearAxis with vertical+horizontal adaptive ticks"
```

---

## Phase 5 — Oak orientation + wiring

### Task 9: Orientation-aware branch curves in OakTree

**Files:**
- Modify: `src/frontend/src/components/OakTree.vue`

- [ ] **Step 1: Add an `orientation` prop and orientation-aware `branchPath`**

In `<script setup>`: extend the props and replace `branchPath`:

```ts
const props = defineProps<{ layout: TreeLayout; selectedId?: string | null; orientation?: 'vertical' | 'horizontal' }>();
// ...
function branchPath(link: LayoutLink): string {
  if ((props.orientation ?? 'vertical') === 'horizontal') {
    const midX = (link.x1 + link.x2) / 2;
    return `M ${link.x1} ${link.y1} C ${midX} ${link.y1}, ${midX} ${link.y2}, ${link.x2} ${link.y2}`;
  }
  const midY = (link.y1 + link.y2) / 2;
  return `M ${link.x1} ${link.y1} C ${link.x1} ${midY}, ${link.x2} ${midY}, ${link.x2} ${link.y2}`;
}
```

- [ ] **Step 2: Run OakTree's existing spec to confirm no regression**

Run: `npm test -- OakTree`
Expected: PASS (orientation defaults to vertical → identical output to before).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/components/OakTree.vue
git commit -m "feat(oak): orientation-aware branch curves (default vertical unchanged)"
```

### Task 10: Wire orientation through TreeView (flip works end-to-end)

**Files:**
- Modify: `src/frontend/src/views/TreeView.vue`
- Test: `src/frontend/src/views/TreeView.spec.ts`

- [ ] **Step 1: Update TreeView script + template**

Replace the YearAxis import/usage and project the layout by orientation:

```ts
// add imports
import { useUiStore } from '../stores/uiStore';
import { projectLayout } from '../layout/projection';
import TimeRail from '../components/TimeRail.vue';
// remove: import YearAxis from '../components/YearAxis.vue';

const ui = useUiStore();

const baseLayout = computed(() => {
  if (!focusId.value || people.value.length === 0) return null;
  return buildLayout({ people: people.value, unions: unions.value }, { focusId: focusId.value });
});
const layout = computed(() => (baseLayout.value ? projectLayout(baseLayout.value, ui.orientation) : null));
```

Template `__canvas` becomes orientation-aware (rail left for vertical, bottom for horizontal):

```vue
<div v-else-if="layout" class="tree-view__canvas" :class="`tree-view__canvas--${ui.orientation}`">
  <TimeRail class="tree-view__rail" :scale="layout.scale" :viewport="oakViewport" :orientation="ui.orientation" />
  <div class="tree-view__oak">
    <OakTree :layout="layout" :selected-id="selectedId" :orientation="ui.orientation" @select="onSelect" @viewport="onViewport" />
  </div>
</div>
```

Replace the axis CSS with rail placement:

```scss
&__canvas { display: flex; height: 100%; width: 100%; }
&__canvas--horizontal { flex-direction: column-reverse; }
&__rail { flex: 0 0 auto; overflow: hidden; }
&__canvas--vertical &__rail { width: 78px; height: 100%; }
&__canvas--horizontal &__rail { width: 100%; height: 54px; }
&__oak { flex: 1 1 auto; min-width: 0; min-height: 0; }
@media (max-width: 640px) { &__canvas--vertical &__rail { width: 56px; } }
```

- [ ] **Step 2: Update TreeView.spec.ts** — it must provide pinia (uiStore) and assert both axis + flip. Replace the file body's mount setup to include pinia, and add a flip assertion:

```ts
// ensure the test file sets up pinia before mounting (add if missing):
import { setActivePinia, createPinia } from 'pinia';
import { useUiStore } from '../stores/uiStore';
// in beforeEach: setActivePinia(createPinia());

it('renders the TimeRail and flips orientation class with the store', async () => {
  // mount TreeView with its required plugins (pinia, i18n, router) as the existing test does,
  // and a loaded familyStore graph (reuse the existing fixture in this spec).
  // After mount:
  const ui = useUiStore();
  expect(wrapper.find('[data-test="time-rail"]').exists()).toBe(true);
  expect(wrapper.find('.tree-view__canvas--vertical').exists()).toBe(true);
  ui.setOrientation('horizontal');
  await wrapper.vm.$nextTick();
  expect(wrapper.find('.tree-view__canvas--horizontal').exists()).toBe(true);
});
```

(Keep the existing TreeView tests; only swap any `YearAxis` references for `TimeRail` and add pinia setup. If the existing spec already stubs stores, adapt to include `useUiStore`.)

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS (YearAxis references gone; TreeView renders TimeRail; flip toggles class).

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run API + dev server, open `http://localhost:5173`, toggle orientation — oak transposes, rail moves to the bottom, ticks stay adaptive. (Use the `/run` skill or `npm run dev`.)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/TreeView.vue src/frontend/src/views/TreeView.spec.ts
git commit -m "feat(tree): orientation switch end-to-end (projected layout + TimeRail placement)"
```

---

## Phase 6 — Chrome & controls

### Task 11: AppFrame (ornamental border)

**Files:**
- Create: `src/frontend/src/components/AppFrame.vue`
- Test: `src/frontend/src/components/AppFrame.spec.ts`
- Modify: `src/frontend/src/App.vue`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/src/components/AppFrame.spec.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppFrame from './AppFrame.vue';

describe('AppFrame', () => {
  it('renders the framed chrome and its default slot', () => {
    const wrapper = mount(AppFrame, { slots: { default: '<p>inside</p>' } });
    expect(wrapper.find('[data-test="app-frame"]').exists()).toBe(true);
    expect(wrapper.html()).toContain('inside');
  });
});
```

- [ ] **Step 2: Run — must fail.** Run: `npm test -- AppFrame` → FAIL.

- [ ] **Step 3: Implement AppFrame.vue** (CSS chrome now; raster asset slot later per DESIGN.md)

```vue
<script setup lang="ts"></script>

<template>
  <div class="app-frame" data-test="app-frame">
    <div class="app-frame__border" aria-hidden="true"></div>
    <svg class="app-frame__corner app-frame__corner--tl" viewBox="0 0 46 46" aria-hidden="true"><path d="M3 43 C 26 43 43 26 43 3" fill="none" stroke="var(--gilt-light)" stroke-width="2.4"/><circle cx="12" cy="12" r="3" fill="#c8543e"/><path d="M18 8 q7 2 5 9 q-8 -1 -5 -9Z" fill="var(--leaf)"/></svg>
    <svg class="app-frame__corner app-frame__corner--tr" viewBox="0 0 46 46" aria-hidden="true"><path d="M3 43 C 26 43 43 26 43 3" fill="none" stroke="var(--gilt-light)" stroke-width="2.4"/><circle cx="12" cy="12" r="3" fill="#c8543e"/></svg>
    <svg class="app-frame__corner app-frame__corner--bl" viewBox="0 0 46 46" aria-hidden="true"><path d="M3 43 C 26 43 43 26 43 3" fill="none" stroke="var(--gilt-light)" stroke-width="2.4"/><circle cx="12" cy="12" r="3" fill="#c8543e"/></svg>
    <svg class="app-frame__corner app-frame__corner--br" viewBox="0 0 46 46" aria-hidden="true"><path d="M3 43 C 26 43 43 26 43 3" fill="none" stroke="var(--gilt-light)" stroke-width="2.4"/><circle cx="12" cy="12" r="3" fill="#c8543e"/></svg>
    <div class="app-frame__inner"><slot /></div>
  </div>
</template>

<style scoped lang="scss">
.app-frame {
  position: relative; height: 100%; width: 100%;
  &__border {
    position: absolute; inset: 6px; border-radius: 9px; pointer-events: none; z-index: 40;
    box-shadow:
      inset 0 0 0 2px var(--gilt-deep),
      inset 0 0 0 9px var(--leaf-deep),
      inset 0 0 0 11px var(--gilt),
      inset 0 0 0 12px rgba(71, 55, 25, 0.45);
  }
  &__corner { position: absolute; width: 40px; height: 40px; z-index: 41; pointer-events: none; }
  &__corner--tl { left: 6px; top: 6px; }
  &__corner--tr { right: 6px; top: 6px; transform: scaleX(-1); }
  &__corner--bl { left: 6px; bottom: 6px; transform: scaleY(-1); }
  &__corner--br { right: 6px; bottom: 6px; transform: scale(-1, -1); }
  &__inner { position: absolute; inset: 14px; display: flex; flex-direction: column; }
}
@media (max-width: 640px) {
  .app-frame__border { inset: 3px; }
  .app-frame__inner { inset: 8px; }
}
</style>
```

- [ ] **Step 4: Mount it in App.vue + init uiStore**

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import AppBar from './components/AppBar.vue';
import AppFrame from './components/AppFrame.vue';
import { useUiStore } from './stores/uiStore';

const ui = useUiStore();
onMounted(() => ui.init());
</script>

<template>
  <AppFrame>
    <div class="app-shell">
      <AppBar />
      <div class="app-shell__body"><router-view /></div>
    </div>
  </AppFrame>
</template>
```

(Keep the existing `.app-shell` styles; AppFrame supplies the outer chrome.)

- [ ] **Step 5: Run — must pass.** Run: `npm test -- AppFrame` then `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/AppFrame.vue src/frontend/src/components/AppFrame.spec.ts src/frontend/src/App.vue
git commit -m "feat(chrome): AppFrame ornamental border; init uiStore on mount"
```

### Task 12: TabNav

**Files:**
- Create: `src/frontend/src/components/TabNav.vue`
- Test: `src/frontend/src/components/TabNav.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/src/components/TabNav.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import TabNav from './TabNav.vue';
import { i18n } from '../i18n';
import { useUiStore } from '../stores/uiStore';

beforeEach(() => { setActivePinia(createPinia()); });
const mountNav = () => mount(TabNav, { global: { plugins: [i18n] } });

describe('TabNav', () => {
  it('renders four tabs with Tree active', () => {
    const wrapper = mountNav();
    expect(wrapper.findAll('[data-test="tab"]')).toHaveLength(4);
    expect(wrapper.get('[data-test="tab-tree"]').classes()).toContain('tabnav__tab--active');
  });

  it('Members and Timeline are disabled placeholders', () => {
    const wrapper = mountNav();
    expect(wrapper.get('[data-test="tab-members"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-test="tab-timeline"]').attributes('disabled')).toBeDefined();
  });

  it('clicking an enabled tab updates the store', async () => {
    const wrapper = mountNav();
    const ui = useUiStore();
    await wrapper.get('[data-test="tab-chronicle"]').trigger('click');
    expect(ui.activeTab).toBe('chronicle');
  });
});
```

- [ ] **Step 2: Run — must fail.** Run: `npm test -- TabNav` → FAIL.

- [ ] **Step 3: Implement TabNav.vue**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useUiStore, type TabId } from '../stores/uiStore';

const ui = useUiStore();
const { t } = useI18n({ useScope: 'global' });

const tabs: { id: TabId; key: string; enabled: boolean }[] = [
  { id: 'chronicle', key: 'nav.chronicle', enabled: true },
  { id: 'tree', key: 'nav.tree', enabled: true },
  { id: 'members', key: 'nav.members', enabled: false },
  { id: 'timeline', key: 'nav.timeline', enabled: false }
];
</script>

<template>
  <nav class="tabnav" data-test="tab-nav">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      class="tabnav__tab"
      :class="{ 'tabnav__tab--active': ui.activeTab === tab.id }"
      :data-test="`tab-${tab.id}`"
      data-test-tab="tab"
      :disabled="!tab.enabled"
      :title="tab.enabled ? '' : t('nav.comingSoon')"
      @click="tab.enabled && ui.setActiveTab(tab.id)"
    >{{ t(tab.key) }}</button>
  </nav>
</template>

<style scoped lang="scss">
.tabnav {
  display: flex; gap: 5px;
  &__tab {
    font-family: var(--font-display); font-size: 12.5px; letter-spacing: 0.6px;
    color: var(--ink-soft); padding: 7px 13px; border: 1px solid transparent;
    border-radius: 8px; background: transparent; cursor: pointer;
    &:hover:not(:disabled) { background: #f1e8cd; }
    &:disabled { opacity: 0.5; cursor: default; }
    &--active {
      color: var(--leaf-deep); background: linear-gradient(#f7efd4, #efe3c2);
      border-color: var(--gilt); box-shadow: inset 0 -2px 0 var(--gilt);
    }
    &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  }
}
</style>
```

Note: the test selects `[data-test="tab"]` for the count — adjust the test selector to `[data-test-tab="tab"]` OR change the per-tab attribute. To keep the test as written, use `:data-test="`tab-${tab.id}`"` for identity and count via `wrapper.findAll('.tabnav__tab')`. **Fix the test count line to:** `expect(wrapper.findAll('.tabnav__tab')).toHaveLength(4);` and remove the `data-test-tab` attribute.

- [ ] **Step 4: Run — must pass.** Run: `npm test -- TabNav` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/TabNav.vue src/frontend/src/components/TabNav.spec.ts
git commit -m "feat(chrome): TabNav (Chronicle/Tree active; Members/Timeline placeholders)"
```

### Task 13: SearchField + tree highlight

**Files:**
- Create: `src/frontend/src/components/SearchField.vue` + `.spec.ts`
- Modify: `src/frontend/src/components/OakTree.vue` (highlight matches via uiStore.search)

- [ ] **Step 1: Write the failing SearchField test**

```ts
// src/frontend/src/components/SearchField.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SearchField from './SearchField.vue';
import { i18n } from '../i18n';
import { useUiStore } from '../stores/uiStore';

beforeEach(() => { setActivePinia(createPinia()); });

describe('SearchField', () => {
  it('writes the query into the store', async () => {
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    const ui = useUiStore();
    await wrapper.get('[data-test="search-input"]').setValue('Anna');
    expect(ui.search).toBe('Anna');
  });
});
```

- [ ] **Step 2: Run — must fail.** Run: `npm test -- SearchField` → FAIL.

- [ ] **Step 3: Implement SearchField.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUiStore } from '../stores/uiStore';

const ui = useUiStore();
const { t } = useI18n({ useScope: 'global' });
const value = computed({ get: () => ui.search, set: v => ui.setSearch(v) });
</script>

<template>
  <label class="search" :aria-label="t('search.label')">
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="var(--ink-soft)" stroke-width="1.6"/><line x1="11" y1="11" x2="15" y2="15" stroke="var(--ink-soft)" stroke-width="1.6"/></svg>
    <input v-model="value" type="search" class="search__input" data-test="search-input" :placeholder="t('search.placeholder')" />
  </label>
</template>

<style scoped lang="scss">
.search {
  display: inline-flex; align-items: center; gap: 8px;
  background: linear-gradient(#fbf6e6, #f3ead0); border: 1px solid var(--gilt-deep);
  border-radius: 9px; padding: 7px 13px; min-width: 220px;
  &__input {
    border: none; background: transparent; outline: none; width: 100%;
    font-family: var(--font-body); font-size: 14px; color: var(--ink);
    &::placeholder { color: #9a875e; }
  }
}
@media (max-width: 640px) { .search { min-width: 120px; } }
</style>
```

- [ ] **Step 4: Add match-highlight to OakTree** (uses uiStore.search; marks nodes whose localized given/surname contains the query)

In OakTree `<script setup>`:

```ts
import { useUiStore } from '../stores/uiStore';
const ui = useUiStore();
function isMatch(node: LayoutNode): boolean {
  const q = ui.search.trim().toLowerCase();
  if (!q) return false;
  const given = localize(node.person.givenName, localeStore.currentLocale).toLowerCase();
  const surname = localize(node.person.surname, localeStore.currentLocale).toLowerCase();
  return given.includes(q) || surname.includes(q);
}
```

In the node `<g>` class binding add `'oak__node--match': isMatch(node)`, and add the style:

```scss
.oak__node--match :deep(.oak__medallion) { stroke: var(--leaf-bright); stroke-width: 3.5; }
```

- [ ] **Step 5: Write an OakTree highlight test** (append to `OakTree.spec.ts`)

```ts
it('marks nodes whose name matches the search query', async () => {
  const ui = useUiStore();            // pinia already active in this spec's beforeEach
  ui.setSearch('zzzznomatch');
  // re-render not required for a getter-driven class; assert no matches first
  expect(wrapper.findAll('.oak__node--match')).toHaveLength(0);
  ui.setSearch(<an exact given-name present in the spec's fixture graph>);
  await wrapper.vm.$nextTick();
  expect(wrapper.findAll('.oak__node--match').length).toBeGreaterThan(0);
});
```

(Use a name string that exists in OakTree.spec's existing layout fixture. If OakTree.spec lacks pinia setup, add `setActivePinia(createPinia())` in its `beforeEach` and `useUiStore` import.)

- [ ] **Step 6: Run — must pass.** Run: `npm test -- "SearchField|OakTree"` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/SearchField.vue src/frontend/src/components/SearchField.spec.ts src/frontend/src/components/OakTree.vue src/frontend/src/components/OakTree.spec.ts
git commit -m "feat(search): SearchField writes uiStore.search; OakTree highlights matches"
```

### Task 14: Rework AppBar (tabs + control cluster)

**Files:**
- Modify: `src/frontend/src/components/AppBar.vue`, `src/frontend/src/components/AppBar.spec.ts`

- [ ] **Step 1: Update AppBar.spec.ts** to the new structure

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AppBar from './AppBar.vue';
import { i18n } from '../i18n';

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); });
const mountBar = () => mount(AppBar, { global: { plugins: [i18n] } });

describe('AppBar', () => {
  it('renders tabs, search, language picker and orientation toggle', () => {
    const wrapper = mountBar();
    expect(wrapper.find('[data-test="tab-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="search-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="language-picker"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="orientation-toggle"]').exists()).toBe(true);
  });

  it('shows the brand title', () => {
    expect(mountBar().find('[data-test="app-bar"]').text()).toContain('Family');
  });
});
```

- [ ] **Step 2: Run — must fail.** Run: `npm test -- AppBar` → FAIL.

- [ ] **Step 3: Implement the reworked AppBar.vue**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import TabNav from './TabNav.vue';
import SearchField from './SearchField.vue';
import LanguagePicker from './LanguagePicker.vue';
import OrientationToggle from './OrientationToggle.vue';

const { t } = useI18n({ useScope: 'global' });
</script>

<template>
  <header class="app-bar" data-test="app-bar">
    <div class="app-bar__row">
      <TabNav />
      <span class="app-bar__spacer" />
      <SearchField />
      <LanguagePicker />
      <OrientationToggle />
    </div>
    <h1 class="app-bar__title"><b>Family</b> Chronicle</h1>
  </header>
</template>

<style scoped lang="scss">
.app-bar {
  position: relative; z-index: 20; padding: 4px 8px 6px; color: var(--ink);
  &__row { display: flex; align-items: center; gap: 10px; }
  &__spacer { flex: 1 1 auto; }
  &__title {
    margin: 2px 0 4px; text-align: center; font-family: var(--font-display);
    font-weight: 500; letter-spacing: 4px; font-size: 28px; color: var(--ink);
    b { font-weight: 700; color: var(--leaf-deep); }
  }
}
@media (max-width: 640px) {
  .app-bar__title { font-size: 20px; letter-spacing: 2px; }
  .app-bar__row { flex-wrap: wrap; }
}
</style>
```

(The brand string "Family Chronicle" is a proper noun shown identically in all locales; localized taglines can be added later. `t` is imported for future use and to keep i18n scope active.)

- [ ] **Step 4: Run — must pass.** Run: `npm test -- AppBar` then `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/AppBar.vue src/frontend/src/components/AppBar.spec.ts
git commit -m "feat(chrome): rework AppBar with tabs + search + language + orientation"
```

### Task 15: Restyle LanguagePicker to tokens

**Files:**
- Modify: `src/frontend/src/components/LanguagePicker.vue` (styles only; logic + data-test unchanged)

- [ ] **Step 1: Update the scoped styles** to use the control look (cream pill, gilt border, display font). Replace the `&__current, &__option` block background/border with:

```scss
  &__current {
    background: linear-gradient(#fbf6e6, #f3ead0);
    border: 1px solid var(--gilt-deep);
    border-radius: 9px;
    font-family: var(--font-display);
    font-size: 12.5px;
  }
```

(Leave the dropdown menu/option styles; just swap `var(--parchment*)`/`var(--ink-soft)` borders to `var(--panel)`/`var(--gilt-deep)` for visual consistency. Logic and `data-test` hooks stay identical so `LanguagePicker.spec.ts` keeps passing.)

- [ ] **Step 2: Run — must pass.** Run: `npm test -- LanguagePicker` → PASS (unchanged behavior).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/components/LanguagePicker.vue
git commit -m "style(lang): restyle LanguagePicker to Chronicle control tokens"
```

---

## Phase 7 — Medallion + popup

### Task 16: Richer PersonMedallion

**Files:**
- Modify: `src/frontend/src/components/PersonMedallion.vue`, `src/frontend/src/components/PersonMedallion.spec.ts`

- [ ] **Step 1: Add SVG defs once in OakTree** (gilt bevel + vignette gradients used by medallions). In `OakTree.vue` `<defs>`, add:

```xml
<linearGradient id="oak-gild" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" style="stop-color: var(--gilt-light)" />
  <stop offset="42%" style="stop-color: var(--gilt)" />
  <stop offset="100%" style="stop-color: var(--gilt-deep)" />
</linearGradient>
<radialGradient id="oak-vignette" cx="42%" cy="34%" r="72%">
  <stop offset="55%" stop-color="rgba(0,0,0,0)" />
  <stop offset="100%" stop-color="rgba(45,30,12,0.42)" />
</radialGradient>
```

(The existing `oak-gilt`/`oak-roll` gradients stay.)

- [ ] **Step 2: Update PersonMedallion template** — add the vignette + a cameo silhouette fallback (instead of a bare initial) and a small keystone; keep the era split. After the portrait `<image>`/initials block, add:

```xml
<!-- cameo silhouette when no portrait -->
<g v-if="!portraitHref" class="oak__cameo" aria-hidden="true">
  <circle :cx="0" :cy="-c.ry * 0.18" :r="c.rx * 0.34" />
  <path :d="`M ${-c.rx*0.58} ${c.ry*0.6} C ${-c.rx*0.58} ${c.ry*0.1} ${-c.rx*0.3} ${-c.ry*0.06} 0 ${-c.ry*0.06} C ${c.rx*0.3} ${-c.ry*0.06} ${c.rx*0.58} ${c.ry*0.1} ${c.rx*0.58} ${c.ry*0.6} Z`" />
</g>
<!-- vignette for depth (kills the flat/plastic look) -->
<ellipse class="oak__vignette" :rx="c.rx" :ry="c.ry" />
```

And after the era frame blocks, add a keystone ornament:

```xml
<path class="oak__keystone" :d="`M 0 ${-c.ry - 4} l 5 5 l -5 5 l -5 -5 Z`" />
```

Remove the bare-initial `<text v-else-if="initial">` block (replaced by the cameo). Keep portrait `<image>` for when `portraitHref` exists.

- [ ] **Step 3: Update PersonMedallion styles** — names to display font, richer frame/nameplate:

```scss
.oak__name, .oak__surname { font-family: var(--font-display); font-weight: 600; fill: var(--ink); }
.oak__dates { font-family: var(--font-body); font-style: italic; fill: var(--ink-soft); }
.oak__cameo { fill: rgba(58, 42, 22, 0.46); }
.oak__vignette { fill: url(#oak-vignette); }
.oak__keystone { fill: url(#oak-gild); stroke: var(--gilt-deep); stroke-width: 0.5; }
// richer scroll/nameplate
.oak__scroll-body { fill: var(--panel); stroke: var(--bark); stroke-width: 1; }
// classic gilt frame now uses the bevel gradient
.oak__gilt-band { stroke: url(#oak-gild); }
```

(Keep the existing geometry in `geomFor`/`c`; keep the `era` classic/modern split — classic uses `oak-gild` bevel, modern keeps the engraved double-rule.)

- [ ] **Step 4: Update PersonMedallion.spec.ts** — keep existing assertions (portrait when given, lifespan text, role classes). Add:

```ts
it('renders a cameo silhouette when there is no portrait', () => {
  // mount a node whose person.portrait is null (existing fixture pattern)
  expect(wrapper.find('.oak__cameo').exists()).toBe(true);
});
```

(If the existing spec asserted the initial letter text, replace that assertion with the cameo assertion above.)

- [ ] **Step 5: Run — must pass.** Run: `npm test -- PersonMedallion` then `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/OakTree.vue src/frontend/src/components/PersonMedallion.vue src/frontend/src/components/PersonMedallion.spec.ts
git commit -m "feat(medallion): richer engraved frame, vignette + cameo silhouette, display font"
```

### Task 17: Restyle PersonPopup to tokens

**Files:**
- Modify: `src/frontend/src/components/PersonPopup.vue` (styles only)

- [ ] **Step 1:** Swap hard-coded fonts to `var(--font-display)` (headings) / `var(--font-body)` (text); confirm it consumes `--glass-*` tokens (already updated in Task 1). No template/logic change.

- [ ] **Step 2: Run — must pass.** Run: `npm test -- PersonPopup` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/components/PersonPopup.vue
git commit -m "style(popup): align PersonPopup typography with Chronicle tokens"
```

---

## Phase 8 — Stats panel

### Task 18: StatsPanel (counts from the graph)

**Files:**
- Create: `src/frontend/src/components/StatsPanel.vue` + `.spec.ts`
- Modify: `src/frontend/src/views/TreeView.vue` (mount it in the stage)

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/src/components/StatsPanel.spec.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatsPanel from './StatsPanel.vue';
import { i18n } from '../i18n';
import type { PersonSummary } from '../types/family';

function person(id: string, birthYear: number | null, portrait: string | null, deathYear: number | null): PersonSummary {
  return {
    id, givenName: { ru: id, be: null, en: id }, surname: { ru: 'X', be: null, en: 'X' },
    maidenName: null, sex: 'male', birthYear, deathYear, vocation: 'other', portrait,
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false
  };
}

describe('StatsPanel', () => {
  it('computes counts from the people list', () => {
    const people = [
      person('a', 1900, 'a.jpg', 1970),
      person('b', 1880, null, null),
      person('c', null, 'c.jpg', null)
    ];
    const wrapper = mount(StatsPanel, { props: { people }, global: { plugins: [i18n] } });
    const text = wrapper.text();
    expect(wrapper.get('[data-test="stat-members"]').text()).toContain('3');
    expect(wrapper.get('[data-test="stat-earliest"]').text()).toContain('1880');
    expect(wrapper.get('[data-test="stat-withPortraits"]').text()).toContain('2');
    expect(wrapper.get('[data-test="stat-living"]').text()).toContain('2'); // b and c have no deathYear
    expect(text).toContain('Family Statistics');
  });
});
```

- [ ] **Step 2: Run — must fail.** Run: `npm test -- StatsPanel` → FAIL.

- [ ] **Step 3: Implement StatsPanel.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PersonSummary } from '../types/family';

const props = defineProps<{ people: PersonSummary[] }>();
const { t } = useI18n({ useScope: 'global' });

const birthYears = computed(() => props.people.map(p => p.birthYear).filter((y): y is number => y != null));
const stats = computed(() => [
  { key: 'members', label: t('stats.members'), value: props.people.length },
  { key: 'earliest', label: t('stats.earliest'), value: birthYears.value.length ? Math.min(...birthYears.value) : '—' },
  { key: 'withPortraits', label: t('stats.withPortraits'), value: props.people.filter(p => p.portrait).length },
  { key: 'living', label: t('stats.living'), value: props.people.filter(p => p.deathYear == null).length }
]);
</script>

<template>
  <aside class="stats" data-test="stats-panel">
    <h3 class="stats__title">{{ t('stats.title') }}</h3>
    <div class="stats__rule" aria-hidden="true" />
    <div v-for="s in stats" :key="s.key" class="stats__row" :data-test="`stat-${s.key}`">
      <span class="stats__label">{{ s.label }}</span>
      <span class="stats__value">{{ s.value }}</span>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.stats {
  background: linear-gradient(#f8f2df, #f0e5c6); border: 1px solid var(--gilt);
  border-radius: 11px; padding: 15px 17px; box-shadow: 0 7px 20px var(--shadow); position: relative;
  &::before { content: ''; position: absolute; inset: 5px; border: 1px solid rgba(183, 145, 63, 0.4); border-radius: 7px; pointer-events: none; }
  &__title { font-family: var(--font-display); font-weight: 600; font-size: 15.5px; letter-spacing: 1px; text-align: center; margin: 2px 0 4px; }
  &__rule { height: 1px; background: linear-gradient(90deg, transparent, var(--gilt), transparent); margin: 7px 2px 12px; }
  &__row { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 2px; border-bottom: 1px dashed rgba(111, 90, 60, 0.22); &:last-child { border-bottom: none; } }
  &__label { font-family: var(--font-body); font-size: 13.5px; color: var(--ink); }
  &__value { font-family: var(--font-display); font-weight: 600; font-size: 15.5px; color: var(--umber); }
}
</style>
```

- [ ] **Step 4: Mount StatsPanel in TreeView** — add to the stage (right zone, hidden on narrow screens). In TreeView template, wrap oak + panel:

```vue
<div class="tree-view__oak"> … </div>
<StatsPanel class="tree-view__stats" :people="people" />
```

with CSS:

```scss
&__canvas--vertical { /* existing flex row */ }
&__stats { flex: 0 0 auto; width: 250px; align-self: stretch; margin: 8px; overflow: auto; }
@media (max-width: 760px) { &__stats { display: none; } }
```

(Import `StatsPanel` and keep `people` from `storeToRefs(store)`.)

- [ ] **Step 5: Run — must pass.** Run: `npm test -- StatsPanel` then `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/StatsPanel.vue src/frontend/src/components/StatsPanel.spec.ts src/frontend/src/views/TreeView.vue
git commit -m "feat(stats): StatsPanel with live counts mounted in the tree stage"
```

---

## Phase 9 — Verification

### Task 19: Full verification

- [ ] **Step 1: Type-check + production build**

Run: `npm run build`
Expected: vue-tsc passes (no type errors), Vite build succeeds.

- [ ] **Step 2: Full unit suite**

Run: `npm test`
Expected: all green (original 132 + new tests; YearAxis tests removed, TimeRail added).

- [ ] **Step 3: Backend untouched — confirm from repo root**

Run (repo root): `dotnet test`
Expected: 36 passing (no backend change in this plan).

- [ ] **Step 4: Manual smoke (use `/run` or both servers)**

Checklist:
- App opens with the framed chronicle look (border + corners + parchment).
- Top bar: tabs (Tree active; Members/Timeline disabled), search, language (full name), orientation toggle.
- Vertical: oak with continuous year rail on the left; zoom → ticks densify; pan → ticks track.
- Toggle Horizontal: oak transposes, rail moves to the bottom and stays adaptive; persists on reload.
- Medallions read rich (gilt frame, nameplate, vignette/cameo); select → glass popup.
- Stats panel shows real counts; hidden on a narrow viewport.
- Language switch re-localizes names.

- [ ] **Step 5: Final commit (if any manual fixups)**

```bash
git add -A
git commit -m "chore(redesign): verification fixups"
```

### Task 20: Wrap up

- [ ] Use `superpowers:requesting-code-review` (and/or `/code-review`) on the branch diff.
- [ ] Use `superpowers:verification-before-completion` to confirm all checks pass with evidence.
- [ ] Use `superpowers:finishing-a-development-branch` to open a PR into `main` (do NOT self-merge — owner reviews).

---

## Self-review notes (author)

- **Spec coverage:** look/tokens (T1–2, 15–17), orientation switch (T3,5,6,7,8,9,10), continuous adaptive rail + era-ready (T6,8), IA tabs/controls (T11–14), stats (T18), richer medallions (T16), testing (every task + T19). Era *bands* were scoped to TimeRail but implemented as the tick/major layer; full era-band shading is deferred (noted) and not a spec hard requirement.
- **Placeholder scan:** the only intentional placeholders are the *product* placeholders (disabled Members/Timeline tabs) and the test lines that say "use a name present in the fixture" (T13/T16) — these depend on the existing spec fixtures the implementer is editing in-place; they are explicit instructions, not vague TODOs.
- **Type consistency:** `Orientation` defined in `uiStore.ts` and imported by `projection.ts`, `TimeRail.vue`, `OakTree.vue`, `OrientationToggle.vue`, `TabId` by `TabNav`. `horizontalTicks` returns `{year,x,label}`; `viewportTicks` returns `{year,y,label}` — TimeRail normalizes both to `{year,pos,label}`.
