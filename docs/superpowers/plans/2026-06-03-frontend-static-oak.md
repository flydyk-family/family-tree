# Frontend — Foundation + Static Oak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Vue 3 frontend and render a static, painterly "hourglass oak" of the family for the default focus person, against a vertical year-axis — mobile-first, fed by the existing backend API.

**Architecture:** Vite + Vue 3 (`<script setup>`, TypeScript) SPA. A typed `fetch` client loads `GET /api/family/graph`; a Pinia store caches it and tracks the focus person. A pure-function **layout engine** turns the genealogy graph into positioned SVG nodes/links — vertical position = birth year (time axis), ancestors fan downward into roots, descendants fan upward into the canopy, focus is the pinch. Vue components render the year axis and the oak as SVG, styled with SCSS design tokens in a faded XIX-century palette. The layout engine and data layer are pure and fully unit-tested (Vitest); components get light structural tests plus a run/screenshot check.

**Tech Stack:** Vite 5, Vue 3.5, TypeScript 5.5, Pinia 2, Vue Router 4, SCSS (Dart Sass), Vitest 1.6 + @vue/test-utils + jsdom. Node 18.16 is installed (these versions are Node-18 compatible).

**Scope (this plan):** scaffold, types, API client, store, time scale, layout engine, year axis, static oak render, app shell + responsive. **Out of scope (Frontend Plan 2):** pan/zoom, member selection, the glass popup, the `/person/:id` deep link, image gallery, zoom-to-cluster, flip, edit.

**Conventions:** TypeScript `strict`. One responsibility per file. Pure logic in `src/layout` and `src/api` (no Vue imports) so it's trivially testable. Tests co-located as `*.spec.ts`. Components `PascalCase.vue`, `<script setup lang="ts">`. Frequent commits. Run from `src/frontend`.

---

## File Structure

```
src/frontend/
  package.json  vite.config.ts  tsconfig.json  tsconfig.node.json  index.html  .gitignore
  src/
    main.ts
    App.vue
    router/index.ts
    types/family.ts                 # TS mirrors of the backend DTOs
    api/familyApi.ts                # typed fetch wrapper  (+ familyApi.spec.ts)
    stores/familyStore.ts           # Pinia store          (+ familyStore.spec.ts)
    layout/timeScale.ts             # year -> y + axis ticks (+ timeScale.spec.ts)
    layout/treeLayout.ts            # the hourglass layout engine (+ treeLayout.spec.ts)
    components/YearAxis.vue          # left vertical year scale (+ YearAxis.spec.ts)
    components/OakTree.vue           # static painterly SVG oak  (+ OakTree.spec.ts)
    views/TreeView.vue              # composes axis + oak, loads store
    styles/tokens.scss              # palette + design tokens
    styles/global.scss
```

Everything in this plan lives under `src/frontend/` (the repo already has the backend under `src/backend/`).

---

## Task 1: Scaffold the Vue + Vite + TypeScript project

**Files:** create the project skeleton and config under `src/frontend/`.

- [ ] **Step 1: Create `src/frontend/package.json`**

```json
{
  "name": "family-tree-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "pinia": "^2.2.2",
    "vue": "^3.5.6",
    "vue-router": "^4.4.5"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.1.4",
    "@vue/test-utils": "^2.4.6",
    "jsdom": "^24.1.3",
    "sass": "^1.79.3",
    "typescript": "~5.5.4",
    "vite": "^5.4.8",
    "vitest": "^1.6.0",
    "vue-tsc": "^2.1.6"
  }
}
```

- [ ] **Step 2: Create the config files**

`src/frontend/vite.config.ts`:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5037', changeOrigin: true }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.spec.ts']
  }
});
```

`src/frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`src/frontend/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

`src/frontend/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <title>Family Tree</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/frontend/.gitignore`:

```
node_modules
dist
*.local
.vite
```

- [ ] **Step 3: Create the design tokens and global styles**

`src/frontend/src/styles/tokens.scss`:

```scss
// Faded XIX-century natural palette
$bark-dark:   #6b5844;
$bark:        #7a6450;
$leaf-deep:   #7d8a5f;
$leaf:        #9ca57a;
$parchment:   #efe7d4;
$parchment-2: #f0e9d6;
$ink:         #4a3f33;
$ink-soft:    #5f5240;

:root {
  --bark-dark: #{$bark-dark};
  --bark: #{$bark};
  --leaf-deep: #{$leaf-deep};
  --leaf: #{$leaf};
  --parchment: #{$parchment};
  --parchment-2: #{$parchment-2};
  --ink: #{$ink};
  --ink-soft: #{$ink-soft};
}
```

`src/frontend/src/styles/global.scss`:

```scss
@use './tokens';

* { box-sizing: border-box; }

html, body, #app {
  margin: 0;
  height: 100%;
}

body {
  background: var(--parchment);
  color: var(--ink);
  font-family: Georgia, 'Times New Roman', serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 4: Create the app entry, router, and shell**

`src/frontend/src/router/index.ts`:

```ts
import { createRouter, createWebHistory } from 'vue-router';
import TreeView from '../views/TreeView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', name: 'tree', component: TreeView }]
});
```

`src/frontend/src/App.vue`:

```vue
<script setup lang="ts"></script>

<template>
  <router-view />
</template>
```

`src/frontend/src/main.ts`:

```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './styles/global.scss';

createApp(App).use(createPinia()).use(router).mount('#app');
```

Create a placeholder `src/frontend/src/views/TreeView.vue` (replaced in Task 8) so the app compiles:

```vue
<script setup lang="ts"></script>

<template>
  <main><p>Family tree loading…</p></main>
</template>
```

- [ ] **Step 5: Install dependencies and verify a trivial test runs**

Create `src/frontend/src/sanity.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run (from `src/frontend`):

```bash
npm install
npm test
```

Expected: install succeeds; `npm test` shows 1 passing test. If `npm install` warns about the Node version for any package, it is safe to ignore for Node 18.16; only act if a package hard-fails to install.

- [ ] **Step 6: Verify dev build compiles**

Run: `npm run build`
Expected: `vue-tsc` type-check passes and Vite produces `dist/`. (The app is just a shell at this point.)

- [ ] **Step 7: Delete the sanity test and commit**

```bash
rm src/sanity.spec.ts
git add src/frontend
git commit -m "$(cat <<'EOF'
chore(frontend): scaffold Vite + Vue 3 + TS + Pinia + Router + SCSS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Domain types and API client

**Files:**
- Create: `src/frontend/src/types/family.ts`, `src/frontend/src/api/familyApi.ts`
- Test: `src/frontend/src/api/familyApi.spec.ts`

- [ ] **Step 1: Create the types**

`src/frontend/src/types/family.ts` (mirror the backend `PersonSummaryDto`/`UnionDto`/`FamilyGraphDto`):

```ts
export interface ParentsRef {
  motherId: string | null;
  fatherId: string | null;
}

export interface PersonSummary {
  id: string;
  givenName: string;
  surname: string;
  maidenName: string | null;
  sex: string;
  birthYear: number | null;
  deathYear: number | null;
  vocation: string;
  portrait: string | null;
  parents: ParentsRef;
  marriedIntoFamily: boolean;
  isDefaultRoot: boolean;
}

export interface Union {
  id: string;
  partnerIds: string[];
  marriageYear: number | null;
  childIds: string[];
}

export interface FamilyGraph {
  people: PersonSummary[];
  unions: Union[];
}
```

- [ ] **Step 2: Write the failing test**

`src/frontend/src/api/familyApi.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchFamilyGraph } from './familyApi';
import type { FamilyGraph } from '../types/family';

const sample: FamilyGraph = { people: [], unions: [] };

afterEach(() => vi.restoreAllMocks());

describe('fetchFamilyGraph', () => {
  it('requests the graph endpoint and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sample
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchFamilyGraph();

    expect(fetchMock).toHaveBeenCalledWith('/api/family/graph');
    expect(result).toEqual(sample);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchFamilyGraph()).rejects.toThrow('500');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- familyApi`
Expected: FAIL — `familyApi` module / `fetchFamilyGraph` does not exist.

- [ ] **Step 4: Implement the client**

`src/frontend/src/api/familyApi.ts`:

```ts
import type { FamilyGraph } from '../types/family';

export async function fetchFamilyGraph(baseUrl = ''): Promise<FamilyGraph> {
  const response = await fetch(`${baseUrl}/api/family/graph`);
  if (!response.ok) {
    throw new Error(`Failed to load family graph: ${response.status}`);
  }
  return (await response.json()) as FamilyGraph;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- familyApi`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/types src/frontend/src/api
git commit -m "$(cat <<'EOF'
feat(frontend): add family types and typed graph API client

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Pinia family store

**Files:**
- Create: `src/frontend/src/stores/familyStore.ts`
- Test: `src/frontend/src/stores/familyStore.spec.ts`

- [ ] **Step 1: Write the failing test**

`src/frontend/src/stores/familyStore.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { FamilyGraph } from '../types/family';

vi.mock('../api/familyApi', () => ({
  fetchFamilyGraph: vi.fn()
}));

import { fetchFamilyGraph } from '../api/familyApi';
import { useFamilyStore } from './familyStore';

function person(id: string, isDefaultRoot = false) {
  return {
    id, givenName: id, surname: 'X', maidenName: null, sex: 'male',
    birthYear: 1900, deathYear: null, vocation: 'other', portrait: null,
    parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot
  };
}

const graph: FamilyGraph = {
  people: [person('p-1'), person('p-2', true)],
  unions: [{ id: 'u-1', partnerIds: ['p-1', 'p-2'], marriageYear: null, childIds: [] }]
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchFamilyGraph).mockReset();
});

describe('familyStore', () => {
  it('load() populates people/unions and focuses the default-root person', async () => {
    vi.mocked(fetchFamilyGraph).mockResolvedValue(graph);
    const store = useFamilyStore();

    await store.load();

    expect(store.people).toHaveLength(2);
    expect(store.focusId).toBe('p-2');
    expect(store.loading).toBe(false);
  });

  it('personById looks up a person', async () => {
    vi.mocked(fetchFamilyGraph).mockResolvedValue(graph);
    const store = useFamilyStore();
    await store.load();

    expect(store.personById('p-1')?.givenName).toBe('p-1');
    expect(store.personById('missing')).toBeUndefined();
  });

  it('records an error message when loading fails', async () => {
    vi.mocked(fetchFamilyGraph).mockRejectedValue(new Error('boom'));
    const store = useFamilyStore();

    await store.load();

    expect(store.error).toContain('boom');
    expect(store.loading).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- familyStore`
Expected: FAIL — store does not exist.

- [ ] **Step 3: Implement the store**

`src/frontend/src/stores/familyStore.ts`:

```ts
import { defineStore } from 'pinia';
import type { PersonSummary, Union } from '../types/family';
import { fetchFamilyGraph } from '../api/familyApi';

interface FamilyState {
  people: PersonSummary[];
  unions: Union[];
  focusId: string | null;
  loading: boolean;
  error: string | null;
}

export const useFamilyStore = defineStore('family', {
  state: (): FamilyState => ({
    people: [],
    unions: [],
    focusId: null,
    loading: false,
    error: null
  }),
  getters: {
    defaultRootId(state): string | null {
      return state.people.find(person => person.isDefaultRoot)?.id
        ?? state.people[0]?.id
        ?? null;
    },
    personById(state) {
      const byId = new Map(state.people.map(person => [person.id, person]));
      return (id: string): PersonSummary | undefined => byId.get(id);
    }
  },
  actions: {
    async load(): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const graph = await fetchFamilyGraph();
        this.people = graph.people;
        this.unions = graph.unions;
        this.focusId = this.defaultRootId;
      } catch (cause) {
        this.error = cause instanceof Error ? cause.message : 'Failed to load family';
      } finally {
        this.loading = false;
      }
    },
    setFocus(id: string): void {
      this.focusId = id;
    }
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- familyStore`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/stores
git commit -m "$(cat <<'EOF'
feat(frontend): add Pinia family store with graph load + focus

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Time scale (year → y, axis ticks)

**Files:**
- Create: `src/frontend/src/layout/timeScale.ts`
- Test: `src/frontend/src/layout/timeScale.spec.ts`

- [ ] **Step 1: Write the failing test**

`src/frontend/src/layout/timeScale.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTimeScale, axisTicks } from './timeScale';

describe('createTimeScale', () => {
  it('maps the newest year to the top (y=0) and oldest to the bottom', () => {
    const scale = createTimeScale([1800, 1900, 2000], 10, 0);

    expect(scale.minYear).toBe(1800);
    expect(scale.maxYear).toBe(2000);
    expect(scale.yForYear(2000)).toBe(0);
    expect(scale.yForYear(1800)).toBe(scale.height);
    expect(scale.yForYear(1900)).toBeLessThan(scale.yForYear(1800));
  });

  it('falls back to a default span when no years are given', () => {
    const scale = createTimeScale([], 10, 0);
    expect(scale.height).toBeGreaterThan(0);
  });
});

describe('axisTicks', () => {
  it('produces ticks on step boundaries within the scale', () => {
    const scale = createTimeScale([1810, 1990], 8, 0);
    const ticks = axisTicks(scale, 50);

    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every(tick => tick.year % 50 === 0)).toBe(true);
    expect(ticks.every(tick => tick.year >= scale.minYear && tick.year <= scale.maxYear)).toBe(true);
    expect(ticks[0].label).toBe(String(ticks[0].year));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- timeScale`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the time scale**

`src/frontend/src/layout/timeScale.ts`:

```ts
export interface TimeScale {
  minYear: number;
  maxYear: number;
  pxPerYear: number;
  height: number;
  yForYear(year: number): number;
}

export interface AxisTick {
  year: number;
  y: number;
  label: string;
}

export function createTimeScale(years: number[], pxPerYear = 8, padYears = 5): TimeScale {
  const valid = years.filter((year): year is number => typeof year === 'number' && !Number.isNaN(year));
  const rawMin = valid.length ? Math.min(...valid) : 1700;
  const rawMax = valid.length ? Math.max(...valid) : 2000;
  const minYear = rawMin - padYears;
  const maxYear = rawMax + padYears;
  const height = (maxYear - minYear) * pxPerYear;
  return {
    minYear,
    maxYear,
    pxPerYear,
    height,
    yForYear(year: number): number {
      return (maxYear - year) * pxPerYear;
    }
  };
}

export function axisTicks(scale: TimeScale, step = 25): AxisTick[] {
  const first = Math.ceil(scale.minYear / step) * step;
  const ticks: AxisTick[] = [];
  for (let year = first; year <= scale.maxYear; year += step) {
    ticks.push({ year, y: scale.yForYear(year), label: String(year) });
  }
  return ticks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- timeScale`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/layout/timeScale.ts src/frontend/src/layout/timeScale.spec.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add time scale mapping years to vertical positions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The hourglass layout engine

**Files:**
- Create: `src/frontend/src/layout/treeLayout.ts`
- Test: `src/frontend/src/layout/treeLayout.spec.ts`

This is the core. `buildLayout(graph, options)` positions every node: Y from birth year (via the time scale), X by a tidy leaf-count layout run twice — once for descendants (fanning **up**, smaller y) and once for ancestors (fanning **down**, larger y) — both centred on the focus at x=0. Married-in spouses attach beside their partner. Each node gets a role (`root`/`trunk`/`branch`/`leaf`). Links are parent→child descents plus partner↔partner unions.

- [ ] **Step 1: Write the failing test**

`src/frontend/src/layout/treeLayout.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildLayout } from './treeLayout';
import type { FamilyGraph, PersonSummary } from '../types/family';

function p(id: string, birthYear: number, parents: Partial<PersonSummary['parents']> = {}): PersonSummary {
  return {
    id, givenName: id, surname: 'X', maidenName: null, sex: 'male',
    birthYear, deathYear: null, vocation: 'other', portrait: null,
    parents: { motherId: parents.motherId ?? null, fatherId: parents.fatherId ?? null },
    marriedIntoFamily: false, isDefaultRoot: false
  };
}

// great-grandfather -> grandfather -> father -> FOCUS -> child ; focus has a spouse
const graph: FamilyGraph = {
  people: [
    p('ggf', 1770),
    p('gf', 1800, { fatherId: 'ggf' }),
    p('father', 1830, { fatherId: 'gf' }),
    p('focus', 1860, { fatherId: 'father' }),
    p('spouse', 1862),
    p('child', 1890, { fatherId: 'focus', motherId: 'spouse' })
  ],
  unions: [
    { id: 'u-f', partnerIds: ['focus', 'spouse'], marriageYear: 1885, childIds: ['child'] }
  ]
};

const layout = buildLayout(graph, { focusId: 'focus', ancestorTrunkDepth: 1, descendantTrunkDepth: 1 });
const node = (id: string) => layout.nodes.find(n => n.id === id)!;

describe('buildLayout', () => {
  it('places the focus at x=0', () => {
    expect(node('focus').x).toBe(0);
    expect(node('focus').generation).toBe(0);
  });

  it('puts ancestors lower (larger y, older) and descendants higher (smaller y)', () => {
    expect(node('father').y).toBeGreaterThan(node('focus').y);
    expect(node('child').y).toBeLessThan(node('focus').y);
    expect(node('father').generation).toBe(-1);
    expect(node('child').generation).toBe(1);
  });

  it('marks a childless terminal node as a leaf', () => {
    expect(node('child').role).toBe('leaf');
  });

  it('marks ancestors beyond the ancestor trunk depth as roots', () => {
    // ancestorTrunkDepth = 1, so gf (gen -2) and ggf (gen -3) are roots
    expect(node('gf').role).toBe('root');
    expect(node('ggf').role).toBe('root');
    expect(node('father').role).toBe('trunk');
  });

  it('attaches a married-in spouse beside the focus', () => {
    expect(node('spouse').x).toBeGreaterThan(node('focus').x);
    expect(node('spouse').generation).toBe(0);
  });

  it('emits descent links from parents to children and a union link between partners', () => {
    expect(layout.links.some(l => l.kind === 'descent' && l.source === 'focus' && l.target === 'child')).toBe(true);
    expect(layout.links.some(l => l.kind === 'union' && l.source === 'focus' && l.target === 'spouse')).toBe(true);
  });

  it('throws when the focus is not in the graph', () => {
    expect(() => buildLayout(graph, { focusId: 'nope' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- treeLayout`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the layout engine**

`src/frontend/src/layout/treeLayout.ts`:

```ts
import type { FamilyGraph, PersonSummary } from '../types/family';
import { createTimeScale, type TimeScale } from './timeScale';

export type NodeRole = 'root' | 'trunk' | 'branch' | 'leaf';

export interface LayoutNode {
  id: string;
  person: PersonSummary;
  x: number;
  y: number;
  year: number;
  role: NodeRole;
  generation: number; // 0 = focus, negative = ancestors, positive = descendants
}

export interface LayoutLink {
  id: string;
  kind: 'descent' | 'union';
  source: string;
  target: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  links: LayoutLink[];
  scale: TimeScale;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  width: number;
  height: number;
}

export interface LayoutOptions {
  focusId: string;
  ancestorTrunkDepth?: number;
  descendantTrunkDepth?: number;
  xGap?: number;
  pxPerYear?: number;
  spouseGap?: number;
}

interface FamilyIndex {
  personById: Map<string, PersonSummary>;
  childrenOf: Map<string, string[]>;
  spousesOf: Map<string, string[]>;
}

const GENERATION_YEARS = 28;

function parentsOf(person: PersonSummary): string[] {
  return [person.parents.motherId, person.parents.fatherId].filter((id): id is string => Boolean(id));
}

function buildIndex(graph: FamilyGraph): FamilyIndex {
  const personById = new Map(graph.people.map(person => [person.id, person]));
  const childrenOf = new Map<string, string[]>();
  const spousesOf = new Map<string, string[]>();
  for (const union of graph.unions) {
    for (const partnerId of union.partnerIds) {
      if (!personById.has(partnerId)) {
        continue;
      }
      const children = childrenOf.get(partnerId) ?? [];
      children.push(...union.childIds.filter(childId => personById.has(childId)));
      childrenOf.set(partnerId, children);

      const spouses = spousesOf.get(partnerId) ?? [];
      spouses.push(...union.partnerIds.filter(other => other !== partnerId && personById.has(other)));
      spousesOf.set(partnerId, spouses);
    }
  }
  return { personById, childrenOf, spousesOf };
}

// Tidy leaf-count layout: leaves are placed left-to-right; parents centre over their children.
// The root is translated to x=0.
function tidyLayout(rootId: string, getChildren: (id: string) => string[], xGap: number): Map<string, number> {
  const x = new Map<string, number>();
  const visited = new Set<string>();
  let cursor = 0;

  function place(id: string): void {
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    const children = getChildren(id).filter(childId => !visited.has(childId));
    if (children.length === 0) {
      x.set(id, cursor);
      cursor += xGap;
      return;
    }
    for (const childId of children) {
      place(childId);
    }
    const positions = children
      .map(childId => x.get(childId))
      .filter((value): value is number => value !== undefined);
    const sum = positions.reduce((total, value) => total + value, 0);
    x.set(id, sum / positions.length);
  }

  place(rootId);
  const rootX = x.get(rootId) ?? 0;
  for (const [id, value] of x) {
    x.set(id, value - rootX);
  }
  return x;
}

function assignYears(ids: string[], index: FamilyIndex, focusId: string): Map<string, number> {
  const year = new Map<string, number>();
  for (const id of ids) {
    const birthYear = index.personById.get(id)?.birthYear;
    if (birthYear != null) {
      year.set(id, birthYear);
    }
  }
  let changed = true;
  let guard = 0;
  while (changed && guard++ < ids.length + 5) {
    changed = false;
    for (const id of ids) {
      if (year.has(id)) {
        continue;
      }
      const person = index.personById.get(id)!;
      const knownParents = parentsOf(person).filter(parentId => year.has(parentId));
      if (knownParents.length) {
        const avg = knownParents.reduce((total, parentId) => total + year.get(parentId)!, 0) / knownParents.length;
        year.set(id, Math.round(avg) + GENERATION_YEARS);
        changed = true;
        continue;
      }
      const knownChildren = (index.childrenOf.get(id) ?? []).filter(childId => year.has(childId));
      if (knownChildren.length) {
        const avg = knownChildren.reduce((total, childId) => total + year.get(childId)!, 0) / knownChildren.length;
        year.set(id, Math.round(avg) - GENERATION_YEARS);
        changed = true;
        continue;
      }
      const knownSpouse = (index.spousesOf.get(id) ?? []).find(spouseId => year.has(spouseId));
      if (knownSpouse) {
        year.set(id, year.get(knownSpouse)!);
        changed = true;
      }
    }
  }
  const fallback = year.get(focusId) ?? 1900;
  for (const id of ids) {
    if (!year.has(id)) {
      year.set(id, fallback);
    }
  }
  return year;
}

function ancestryDepth(id: string, index: FamilyIndex, memo: Map<string, number>): number {
  const cached = memo.get(id);
  if (cached !== undefined) {
    return cached;
  }
  memo.set(id, 0); // cycle guard
  const person = index.personById.get(id);
  const parents = person ? parentsOf(person) : [];
  const depth = parents.length
    ? 1 + Math.max(...parents.map(parentId => ancestryDepth(parentId, index, memo)))
    : 0;
  memo.set(id, depth);
  return depth;
}

function primaryAncestorChain(focusId: string, index: FamilyIndex, depth: number): Set<string> {
  const chain = new Set<string>();
  const memo = new Map<string, number>();
  let current = focusId;
  for (let step = 0; step < depth; step++) {
    const person = index.personById.get(current);
    if (!person) {
      break;
    }
    const parents = parentsOf(person);
    if (!parents.length) {
      break;
    }
    const father = person.parents.fatherId;
    let best = parents[0];
    let bestDepth = -1;
    for (const parentId of parents) {
      const parentDepth = ancestryDepth(parentId, index, memo);
      if (parentDepth > bestDepth || (parentDepth === bestDepth && parentId === father)) {
        best = parentId;
        bestDepth = parentDepth;
      }
    }
    chain.add(best);
    current = best;
  }
  return chain;
}

export function buildLayout(graph: FamilyGraph, options: LayoutOptions): TreeLayout {
  const { focusId } = options;
  const ancestorTrunkDepth = options.ancestorTrunkDepth ?? 2;
  const descendantTrunkDepth = options.descendantTrunkDepth ?? 2;
  const xGap = options.xGap ?? 70;
  const pxPerYear = options.pxPerYear ?? 8;
  const spouseGap = options.spouseGap ?? 46;

  const index = buildIndex(graph);
  if (!index.personById.has(focusId)) {
    throw new Error(`Focus person '${focusId}' not found in graph`);
  }

  const descX = tidyLayout(focusId, id => index.childrenOf.get(id) ?? [], xGap);
  const ancX = tidyLayout(focusId, id => parentsOf(index.personById.get(id)!), xGap);

  const xOf = new Map<string, number>([[focusId, 0]]);
  const genOf = new Map<string, number>([[focusId, 0]]);

  const descQueue: Array<[string, number]> = [[focusId, 0]];
  const descSeen = new Set<string>([focusId]);
  while (descQueue.length) {
    const [id, generation] = descQueue.shift()!;
    for (const childId of index.childrenOf.get(id) ?? []) {
      if (descSeen.has(childId)) {
        continue;
      }
      descSeen.add(childId);
      genOf.set(childId, generation + 1);
      if (descX.has(childId)) {
        xOf.set(childId, descX.get(childId)!);
      }
      descQueue.push([childId, generation + 1]);
    }
  }

  const ancQueue: Array<[string, number]> = [[focusId, 0]];
  const ancSeen = new Set<string>([focusId]);
  while (ancQueue.length) {
    const [id, generation] = ancQueue.shift()!;
    for (const parentId of parentsOf(index.personById.get(id)!)) {
      if (ancSeen.has(parentId)) {
        continue;
      }
      ancSeen.add(parentId);
      genOf.set(parentId, generation - 1);
      if (ancX.has(parentId)) {
        xOf.set(parentId, ancX.get(parentId)!);
      }
      ancQueue.push([parentId, generation - 1]);
    }
  }

  // Attach married-in spouses beside focus-or-descendant partners (generation >= 0).
  for (const id of [...xOf.keys()]) {
    if ((genOf.get(id) ?? 0) < 0) {
      continue;
    }
    for (const spouseId of index.spousesOf.get(id) ?? []) {
      if (xOf.has(spouseId)) {
        continue;
      }
      xOf.set(spouseId, (xOf.get(id) ?? 0) + spouseGap);
      genOf.set(spouseId, genOf.get(id) ?? 0);
    }
  }

  const ids = [...xOf.keys()];
  const year = assignYears(ids, index, focusId);
  const scale = createTimeScale(ids.map(id => year.get(id)!), pxPerYear);
  const primaryChain = primaryAncestorChain(focusId, index, ancestorTrunkDepth);

  const nodes: LayoutNode[] = ids.map(id => {
    const person = index.personById.get(id)!;
    const generation = genOf.get(id) ?? 0;
    const nodeYear = year.get(id)!;
    const childless = (index.childrenOf.get(id) ?? []).length === 0;
    let role: NodeRole;
    if (childless && id !== focusId) {
      role = 'leaf';
    } else if (generation < -ancestorTrunkDepth) {
      role = 'root';
    } else if (id === focusId) {
      role = 'trunk';
    } else if (generation < 0 && primaryChain.has(id)) {
      role = 'trunk';
    } else if (generation > 0 && generation <= descendantTrunkDepth) {
      role = 'trunk';
    } else {
      role = 'branch';
    }
    return { id, person, x: xOf.get(id)!, y: scale.yForYear(nodeYear), year: nodeYear, role, generation };
  });

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const links: LayoutLink[] = [];
  for (const union of graph.unions) {
    for (const partnerId of union.partnerIds) {
      const parent = nodeById.get(partnerId);
      if (!parent) {
        continue;
      }
      for (const childId of union.childIds) {
        const child = nodeById.get(childId);
        if (!child) {
          continue;
        }
        links.push({
          id: `d:${partnerId}->${childId}`,
          kind: 'descent',
          source: partnerId,
          target: childId,
          x1: parent.x, y1: parent.y, x2: child.x, y2: child.y
        });
      }
    }
    const present = union.partnerIds.map(id => nodeById.get(id)).filter((node): node is LayoutNode => Boolean(node));
    if (present.length === 2) {
      links.push({
        id: `u:${union.id}`,
        kind: 'union',
        source: present[0].id,
        target: present[1].id,
        x1: present[0].x, y1: present[0].y, x2: present[1].x, y2: present[1].y
      });
    }
  }

  const xs = nodes.map(node => node.x);
  const ys = nodes.map(node => node.y);
  const bounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
  return {
    nodes,
    links,
    scale,
    bounds,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- treeLayout`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/layout/treeLayout.ts src/frontend/src/layout/treeLayout.spec.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add hourglass tree layout engine (time axis + roles)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Year axis component

**Files:**
- Create: `src/frontend/src/components/YearAxis.vue`
- Test: `src/frontend/src/components/YearAxis.spec.ts`

- [ ] **Step 1: Write the failing test**

`src/frontend/src/components/YearAxis.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import YearAxis from './YearAxis.vue';
import { createTimeScale } from '../layout/timeScale';

describe('YearAxis', () => {
  it('renders a labelled tick for each step year', () => {
    const scale = createTimeScale([1800, 2000], 8, 0);
    const wrapper = mount(YearAxis, { props: { scale, step: 50 } });

    const labels = wrapper.findAll('[data-test="tick-label"]');
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.map(label => label.text())).toContain('1900');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- YearAxis`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

`src/frontend/src/components/YearAxis.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { axisTicks, type TimeScale } from '../layout/timeScale';

const props = withDefaults(defineProps<{ scale: TimeScale; step?: number }>(), { step: 25 });

const ticks = computed(() => axisTicks(props.scale, props.step));
</script>

<template>
  <svg class="year-axis" :height="scale.height" width="64" :viewBox="`0 0 64 ${scale.height}`">
    <line x1="58" y1="0" x2="58" :y2="scale.height" class="year-axis__spine" />
    <g v-for="tick in ticks" :key="tick.year" :transform="`translate(0, ${tick.y})`">
      <line x1="52" x2="58" y1="0" y2="0" class="year-axis__tick" />
      <text x="46" y="4" text-anchor="end" data-test="tick-label" class="year-axis__label">
        {{ tick.label }}
      </text>
    </g>
  </svg>
</template>

<style scoped lang="scss">
.year-axis {
  &__spine,
  &__tick {
    stroke: var(--ink-soft);
    stroke-width: 1;
  }
  &__label {
    fill: var(--ink-soft);
    font-size: 11px;
    font-family: Georgia, serif;
  }
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- YearAxis`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/YearAxis.vue src/frontend/src/components/YearAxis.spec.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add vertical year-axis component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Static oak SVG render

**Files:**
- Create: `src/frontend/src/components/OakTree.vue`
- Test: `src/frontend/src/components/OakTree.spec.ts`

Renders the layout: descent links as organic branch paths (stroke width scaled by role — thick trunk, thin twigs, bark colour), union links as short horizontal joins, member nodes as parchment medallions, leaf nodes tinted green. Painterly texture (rough strokes, leaf clusters) is refined later via the run/screenshot loop — this task locks the structure and palette.

- [ ] **Step 1: Write the failing test**

`src/frontend/src/components/OakTree.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import OakTree from './OakTree.vue';
import { buildLayout } from '../layout/treeLayout';
import type { FamilyGraph } from '../types/family';

const graph: FamilyGraph = {
  people: [
    { id: 'a', givenName: 'A', surname: 'X', maidenName: null, sex: 'male', birthYear: 1850, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true },
    { id: 'b', givenName: 'B', surname: 'X', maidenName: null, sex: 'female', birthYear: 1880, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: 'a' }, marriedIntoFamily: false, isDefaultRoot: false }
  ],
  unions: [{ id: 'u', partnerIds: ['a'], marriageYear: null, childIds: ['b'] }]
};

describe('OakTree', () => {
  it('renders an svg with a node element per person and a branch per descent link', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="node"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-test="branch"]').length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- OakTree`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

`src/frontend/src/components/OakTree.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { TreeLayout, LayoutNode, LayoutLink } from '../layout/treeLayout';

const props = defineProps<{ layout: TreeLayout }>();

const PADDING = 60;

const viewBox = computed(() => {
  const { bounds } = props.layout;
  const x = bounds.minX - PADDING;
  const y = bounds.minY - PADDING;
  const width = bounds.maxX - bounds.minX + PADDING * 2;
  const height = bounds.maxY - bounds.minY + PADDING * 2;
  return `${x} ${y} ${width} ${height}`;
});

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

<template>
  <svg class="oak" :viewBox="viewBox" preserveAspectRatio="xMidYMid meet">
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
        :transform="`translate(${node.x}, ${node.y})`"
        :class="['oak__node', `oak__node--${node.role}`]"
      >
        <circle :r="nodeRadius(node)" class="oak__medallion" />
        <text y="-14" text-anchor="middle" class="oak__name">{{ node.person.givenName }}</text>
      </g>
    </g>
  </svg>
</template>

<style scoped lang="scss">
.oak {
  width: 100%;
  height: 100%;
  display: block;

  &__branch {
    stroke: var(--bark);
  }
  &__union {
    stroke: var(--bark-dark);
    stroke-width: 2;
    stroke-dasharray: 2 3;
  }
  &__medallion {
    fill: var(--parchment-2);
    stroke: var(--ink-soft);
    stroke-width: 1.5;
  }
  &__node--leaf .oak__medallion {
    fill: var(--leaf);
    stroke: var(--leaf-deep);
  }
  &__node--trunk .oak__medallion {
    stroke-width: 2.5;
  }
  &__name {
    fill: var(--ink);
    font-size: 11px;
    font-family: Georgia, serif;
  }
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- OakTree`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/OakTree.vue src/frontend/src/components/OakTree.spec.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add static painterly oak SVG renderer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Tree view, app wiring, responsive, live verification

**Files:**
- Modify: `src/frontend/src/views/TreeView.vue` (replace the placeholder)
- Test: `src/frontend/src/views/TreeView.spec.ts`

- [ ] **Step 1: Write the failing test**

`src/frontend/src/views/TreeView.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { FamilyGraph } from '../types/family';

vi.mock('../api/familyApi', () => ({ fetchFamilyGraph: vi.fn() }));
import { fetchFamilyGraph } from '../api/familyApi';
import TreeView from './TreeView.vue';

const graph: FamilyGraph = {
  people: [
    { id: 'a', givenName: 'A', surname: 'X', maidenName: null, sex: 'male', birthYear: 1850, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true },
    { id: 'b', givenName: 'B', surname: 'X', maidenName: null, sex: 'female', birthYear: 1880, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: 'a' }, marriedIntoFamily: false, isDefaultRoot: false }
  ],
  unions: [{ id: 'u', partnerIds: ['a'], marriageYear: null, childIds: ['b'] }]
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchFamilyGraph).mockReset();
});

describe('TreeView', () => {
  it('loads the graph and renders the oak and year axis', async () => {
    vi.mocked(fetchFamilyGraph).mockResolvedValue(graph);
    const wrapper = mount(TreeView);

    await flushPromises();

    expect(wrapper.find('.oak').exists()).toBe(true);
    expect(wrapper.find('.year-axis').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="node"]')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- TreeView`
Expected: FAIL — the placeholder TreeView has no oak/axis.

- [ ] **Step 3: Implement the view**

Replace `src/frontend/src/views/TreeView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useFamilyStore } from '../stores/familyStore';
import { buildLayout } from '../layout/treeLayout';
import YearAxis from '../components/YearAxis.vue';
import OakTree from '../components/OakTree.vue';

const store = useFamilyStore();
const { people, unions, focusId, loading, error } = storeToRefs(store);

onMounted(() => {
  if (store.people.length === 0) {
    void store.load();
  }
});

const layout = computed(() => {
  if (!focusId.value || people.value.length === 0) {
    return null;
  }
  return buildLayout({ people: people.value, unions: unions.value }, { focusId: focusId.value });
});
</script>

<template>
  <main class="tree-view">
    <p v-if="loading" class="tree-view__status">Loading family…</p>
    <p v-else-if="error" class="tree-view__status tree-view__status--error">{{ error }}</p>
    <div v-else-if="layout" class="tree-view__canvas">
      <YearAxis class="tree-view__axis" :scale="layout.scale" :step="25" />
      <div class="tree-view__oak">
        <OakTree :layout="layout" />
      </div>
    </div>
  </main>
</template>

<style scoped lang="scss">
.tree-view {
  height: 100vh;
  width: 100vw;
  overflow: hidden;

  &__status {
    padding: 24px;
    font-style: italic;
    &--error { color: #8a3b32; }
  }

  &__canvas {
    display: flex;
    height: 100%;
    width: 100%;
  }

  &__axis {
    flex: 0 0 auto;
    height: 100%;
    overflow: hidden;
    border-right: 1px solid rgba(95, 82, 64, 0.25);
  }

  &__oak {
    flex: 1 1 auto;
    height: 100%;
    min-width: 0;
  }
}

// mobile-first: axis stays pinned, oak scales to fit width
@media (max-width: 640px) {
  .tree-view__axis { width: 48px; }
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- TreeView`
Expected: PASS.

- [ ] **Step 5: Run the full frontend suite and type-check**

Run: `npm test` then `npm run build`
Expected: all spec files pass; `vue-tsc` reports no type errors and Vite builds.

- [ ] **Step 6: Live verification against the backend**

In one terminal: `dotnet run --project ../backend/FamilyTree.Api` (serves on `http://localhost:5037`).
In another (from `src/frontend`): `npm run dev`, then open `http://localhost:5173`.
Confirm: the oak renders for the default focus (Tadeusz, `p-0007`); the year axis runs up the left with century labels (~1750 at the bottom → ~1900 at the top); ancestors sit lower (older), descendants higher; leaf nodes are tinted green; the page fits a phone-width viewport without horizontal scrollbars on the page chrome. (Painterly polish — textured bark, leaf clusters — is a later refinement; structure + palette is the bar here.)

If anything looks wrong, treat it as a defect and fix before committing. Take a screenshot for the record if your environment supports it.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/views/TreeView.vue src/frontend/src/views/TreeView.spec.ts
git commit -m "$(cat <<'EOF'
feat(frontend): wire tree view loading graph into oak + year axis

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] `npm test` → all green.
- [ ] `npm run build` → type-check + build succeed.
- [ ] `npm run dev` + backend running → the static oak renders for the default focus against the year axis, mobile-first.

---

## Plan self-review notes

- **Spec coverage (frontend, this slice):** Vue 3 + Vite + TS + Pinia + Router + SCSS (Task 1); typed API over `/api/family/graph` (Task 2); focus = `isDefaultRoot` person (Task 3); year-axis time mapping (Tasks 4, 6); hourglass layout — ancestors→roots downward, descendants→canopy upward, leaves at terminals, trunk derivation via primary line + depths (Task 5); painterly SVG in the faded palette (Task 7); mobile-first shell (Task 8).
- **Deferred to Frontend Plan 2 (explicitly out of scope here):** pan/zoom, member selection, glass popup (normal/expanded, residences/map links, social links), `/person/:id` deep link, image gallery, zoom-to-cluster, flip, edit.
- **Type consistency:** `FamilyGraph`/`PersonSummary`/`Union` (Task 2) flow through the store (Task 3) and layout (Task 5); `TimeScale` (Task 4) is consumed by `YearAxis` (Task 6) and produced by `buildLayout` (Task 5); `TreeLayout`/`LayoutNode`/`LayoutLink` (Task 5) are consumed by `OakTree` (Task 7) and `TreeView` (Task 8).
- **Known checks:** Node 18.16 vs the pinned tool versions (Vite 5 / Vitest 1.6 are compatible; if `npm install` hard-fails on a version, nudge it down a minor); the Vite dev proxy target `http://localhost:5037` must match the backend's `launchSettings.json` http profile (it does).
```
