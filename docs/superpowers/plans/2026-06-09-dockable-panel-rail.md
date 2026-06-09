# Dockable, Stackable Panel Rail + Mobile Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the stats panel and person popup into one responsive right-rail of dockable, stackable panels (pinned stats + a single-expanded person stack; desktop "bigger view" modal; mobile vertical chips + a ←/→ arrow), and replace the wrapping mobile AppBar with a slim menu header.

**Architecture:** A new Pinia `panelStore` is the single source of truth for which panels are open and their state (minimized/expanded, the one expanded person, mobile chips-vs-rectangles mode, and the bigger-view target). A presentational `DockPanel` renders the shared chrome; `PanelRail` lays the panels out and owns the desktop⇄mobile switch; `PersonDetail` (extracted from today's `PersonPopup`) is the person content shared by the docked panel and the bigger-view modal. `TreeView` renders the rail and keeps the `/person/:id` route in sync with the focused (expanded) person.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), Pinia, vue-router, vue-i18n, SCSS design tokens, Vitest + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-06-09-dockable-panel-rail-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/frontend/src/styles/tokens.scss` | modify | Add `$bp-rail: 768px` and `--rail-width: 360px`. |
| `src/frontend/src/i18n/messages/{ru,be,en}.ts` | modify | Add `panel.*` and `nav.*` keys (social keys already exist). |
| `src/frontend/src/composables/useMediaQuery.ts` | create | Reactive `matchMedia` boolean (drives desktop⇄mobile). |
| `src/frontend/src/stores/panelStore.ts` | create | Panel list + states + transitions (the logic core). |
| `src/frontend/src/components/PersonDetail.vue` | create | Person content (header, summary, biography/residences/links, More/Less), extracted from `PersonPopup`. |
| `src/frontend/src/components/DockPanel.vue` | create | Shared panel chrome: title bar (icon·title·controls), body slot, minimized/chip rendering, events. |
| `src/frontend/src/components/PanelRail.vue` | create | Lays out the rail (desktop side-rail; mobile chips/rectangles + arrow); responsive switch. |
| `src/frontend/src/components/StatsPanel.vue` | modify | Render the four figures inside a `DockPanel`. |
| `src/frontend/src/components/PersonPopup.vue` | modify | Becomes the desktop bigger-view modal: scrim + dialog wrapping `PersonDetail`. |
| `src/frontend/src/components/AppBar.vue` | modify | Add the slim mobile menu header (☰ · brand · ⌕) + dropdown sheet. |
| `src/frontend/src/views/TreeView.vue` | modify | Render `PanelRail`; sync route ↔ `panelStore`; wire tree `@select`; mount the bigger-view modal. |

Each task is TDD: write the failing test, run it red, implement minimally, run it green, commit. Run frontend commands from `src/frontend`. **Node ≥ 20.19 is required** — if `npm`/`vitest` is missing, prepend the portable Node 22 dir to `PATH` (`%LOCALAPPDATA%\Programs\nodejs-22`) and run `npm install` first.

---

## Task 1: Design tokens — breakpoint + rail width

**Files:**
- Modify: `src/frontend/src/styles/tokens.scss`

- [ ] **Step 1: Add the SCSS breakpoint variable and the CSS rail-width custom property**

In `tokens.scss`, after the `$umber:` line (top block of SCSS vars), add:

```scss
// Responsive: below this the rail becomes the mobile chip/rectangle overlay.
$bp-rail: 768px;
```

Inside the `:root { ... }` block, after the `--shadow:` line, add:

```scss
  // Panel rail width (desktop side-rail; also the mobile rectangle max-width).
  --rail-width: 360px;
```

- [ ] **Step 2: Verify the build still compiles**

Run: `npm run build`
Expected: type-check + Vite build succeed (no SCSS error). If `vue-tsc` flags unrelated pre-existing issues, ensure none reference `tokens.scss`.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/styles/tokens.scss
git commit -m "feat(tokens): add rail breakpoint and width tokens"
```

---

## Task 2: i18n keys for panels + nav

**Files:**
- Modify: `src/frontend/src/i18n/messages/en.ts`, `ru.ts`, `be.ts`
- Test: `src/frontend/src/i18n/messages/messages.spec.ts`

- [ ] **Step 1: Add explicit key assertions to the parity spec**

In `messages.spec.ts`, inside the second `it('include the person popup labels', ...)` block, add these expectations to the existing loop body (after the `vocation.teacher` line):

```ts
      expect(keys).toContain('panel.minimize');
      expect(keys).toContain('panel.expand');
      expect(keys).toContain('panel.close');
      expect(keys).toContain('panel.biggerView');
      expect(keys).toContain('panel.expandPanels');
      expect(keys).toContain('panel.collapseToChips');
      expect(keys).toContain('panel.statsTitle');
      expect(keys).toContain('nav.menu');
      expect(keys).toContain('nav.views');
      expect(keys).toContain('nav.language');
      expect(keys).toContain('nav.layout');
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npx vitest run src/i18n/messages/messages.spec.ts`
Expected: FAIL — keys `panel.*` / `nav.*` not present.

- [ ] **Step 3: Add the keys to all three catalogs**

In `en.ts`, after the `social: { ... },` block add:

```ts
  panel: {
    minimize: 'Minimize',
    expand: 'Expand',
    close: 'Close',
    biggerView: 'Bigger view',
    expandPanels: 'Expand panels',
    collapseToChips: 'Collapse to chips',
    statsTitle: 'Chronicle stats'
  },
  nav: {
    menu: 'Menu',
    views: 'Views',
    language: 'Language',
    layout: 'Layout'
  },
```

In `ru.ts`, the same block with Russian values:

```ts
  panel: {
    minimize: 'Свернуть',
    expand: 'Развернуть',
    close: 'Закрыть',
    biggerView: 'Крупнее',
    expandPanels: 'Развернуть панели',
    collapseToChips: 'Свернуть в значки',
    statsTitle: 'Статистика рода'
  },
  nav: {
    menu: 'Меню',
    views: 'Разделы',
    language: 'Язык',
    layout: 'Ориентация'
  },
```

In `be.ts`:

```ts
  panel: {
    minimize: 'Згарнуць',
    expand: 'Разгарнуць',
    close: 'Закрыць',
    biggerView: 'Буйней',
    expandPanels: 'Разгарнуць панэлі',
    collapseToChips: 'Згарнуць у значкі',
    statsTitle: 'Статыстыка роду'
  },
  nav: {
    menu: 'Меню',
    views: 'Раздзелы',
    language: 'Мова',
    layout: 'Арыентацыя'
  },
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `npx vitest run src/i18n/messages/messages.spec.ts`
Expected: PASS (parity + explicit keys).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/i18n/messages
git commit -m "feat(i18n): add panel and nav message keys"
```

---

## Task 3: `useMediaQuery` composable

**Files:**
- Create: `src/frontend/src/composables/useMediaQuery.ts`
- Test: `src/frontend/src/composables/useMediaQuery.spec.ts`

- [ ] **Step 1: Write the failing test**

`useMediaQuery.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMediaQuery } from './useMediaQuery';

let listeners: Array<(e: { matches: boolean }) => void>;
let current: boolean;

beforeEach(() => {
  listeners = [];
  current = false;
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: current,
    media: q,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
    removeEventListener: () => {}
  }));
});

describe('useMediaQuery', () => {
  it('returns the initial match state', () => {
    current = true;
    const matches = useMediaQuery('(max-width: 767.98px)');
    expect(matches.value).toBe(true);
  });

  it('updates when the media query changes', () => {
    const matches = useMediaQuery('(max-width: 767.98px)');
    expect(matches.value).toBe(false);
    listeners.forEach(cb => cb({ matches: true }));
    expect(matches.value).toBe(true);
  });

  it('defaults to false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const matches = useMediaQuery('(max-width: 767.98px)');
    expect(matches.value).toBe(false);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run src/composables/useMediaQuery.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the composable**

`useMediaQuery.ts`:

```ts
import { onUnmounted, ref, type Ref } from 'vue';

/**
 * Reactive wrapper around window.matchMedia. Returns a ref that tracks whether
 * the query currently matches. Safe when matchMedia is unavailable (returns a
 * ref that stays false).
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  if (typeof matchMedia !== 'function') {
    return matches;
  }
  const mql = matchMedia(query);
  matches.value = mql.matches;
  const onChange = (e: { matches: boolean }) => {
    matches.value = e.matches;
  };
  mql.addEventListener('change', onChange);
  onUnmounted(() => mql.removeEventListener('change', onChange));
  return matches;
}
```

- [ ] **Step 4: Run it green**

Run: `npx vitest run src/composables/useMediaQuery.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/composables/useMediaQuery.ts src/frontend/src/composables/useMediaQuery.spec.ts
git commit -m "feat: add useMediaQuery composable"
```

---

## Task 4: `panelStore` — the panel state machine

**Files:**
- Create: `src/frontend/src/stores/panelStore.ts`
- Test: `src/frontend/src/stores/panelStore.spec.ts`

This store owns all panel state and enforces the **single-expanded-person invariant**. Transitions implement the approved behaviors: arrow ←/→ toggles all chips⇄rectangles; tapping a chip/bar or selecting on the tree opens that person expanded (others minimized); stats is pinned and never closable.

- [ ] **Step 1: Write the failing test**

`panelStore.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePanelStore } from './panelStore';

beforeEach(() => setActivePinia(createPinia()));

describe('panelStore — defaults', () => {
  it('starts with no person panels, stats expanded, chips mode, no bigger view', () => {
    const s = usePanelStore();
    expect(s.personPanels).toEqual([]);
    expect(s.statsMinimized).toBe(false);
    expect(s.railMode).toBe('chips');
    expect(s.biggerViewId).toBeNull();
    expect(s.expandedId).toBeNull();
  });
});

describe('panelStore — opening people', () => {
  it('openPerson adds a person expanded and switches to rectangles mode', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    expect(s.personPanels.map(p => p.id)).toEqual(['p-1']);
    expect(s.expandedId).toBe('p-1');
    expect(s.railMode).toBe('rectangles');
  });

  it('opening a second person minimizes the first (single-expanded invariant)', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openPerson('p-2');
    expect(s.personPanels.map(p => p.id)).toEqual(['p-1', 'p-2']);
    expect(s.expandedId).toBe('p-2');
    expect(s.personPanels.find(p => p.id === 'p-1')!.minimized).toBe(true);
  });

  it('re-opening an existing person expands it without duplicating', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openPerson('p-2');
    s.openPerson('p-1');
    expect(s.personPanels.map(p => p.id)).toEqual(['p-1', 'p-2']);
    expect(s.expandedId).toBe('p-1');
  });

  it('isOpen reflects membership', () => {
    const s = usePanelStore();
    expect(s.isOpen('p-1')).toBe(false);
    s.openPerson('p-1');
    expect(s.isOpen('p-1')).toBe(true);
  });
});

describe('panelStore — minimize / expand / close', () => {
  it('minimizePerson collapses a panel and clears the expanded id', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.minimizePerson('p-1');
    expect(s.expandedId).toBeNull();
    expect(s.personPanels[0].minimized).toBe(true);
  });

  it('expandPerson expands one and minimizes the rest', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openPerson('p-2');
    s.expandPerson('p-1');
    expect(s.expandedId).toBe('p-1');
    expect(s.personPanels.find(p => p.id === 'p-2')!.minimized).toBe(true);
  });

  it('closePerson removes the panel and clears bigger view if it pointed there', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openBiggerView('p-1');
    s.closePerson('p-1');
    expect(s.isOpen('p-1')).toBe(false);
    expect(s.biggerViewId).toBeNull();
  });
});

describe('panelStore — stats', () => {
  it('toggleStats flips the minimized flag', () => {
    const s = usePanelStore();
    s.toggleStats();
    expect(s.statsMinimized).toBe(true);
    s.toggleStats();
    expect(s.statsMinimized).toBe(false);
  });
});

describe('panelStore — mobile rail mode', () => {
  it('expandRail switches to rectangles and minimizes every person', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openPerson('p-2');
    s.collapseRail(); // back to chips
    s.expandRail();   // the ← arrow
    expect(s.railMode).toBe('rectangles');
    expect(s.expandedId).toBeNull();
    expect(s.personPanels.every(p => p.minimized)).toBe(true);
  });

  it('collapseRail switches to chips and preserves panel membership', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.collapseRail();
    expect(s.railMode).toBe('chips');
    expect(s.isOpen('p-1')).toBe(true);
  });
});

describe('panelStore — bigger view', () => {
  it('openBiggerView / closeBiggerView set and clear the target', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openBiggerView('p-1');
    expect(s.biggerViewId).toBe('p-1');
    s.closeBiggerView();
    expect(s.biggerViewId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run src/stores/panelStore.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

`panelStore.ts`:

```ts
import { defineStore } from 'pinia';

export interface PersonPanel {
  id: string;
  minimized: boolean;
}

export type RailMode = 'chips' | 'rectangles';

interface PanelState {
  personPanels: PersonPanel[];
  statsMinimized: boolean;
  railMode: RailMode;
  biggerViewId: string | null;
}

export const usePanelStore = defineStore('panels', {
  state: (): PanelState => ({
    personPanels: [],
    statsMinimized: false,
    railMode: 'chips',
    biggerViewId: null
  }),
  getters: {
    expandedId(state): string | null {
      return state.personPanels.find(p => !p.minimized)?.id ?? null;
    },
    isOpen(state) {
      return (id: string): boolean => state.personPanels.some(p => p.id === id);
    },
    hasPersonPanels(state): boolean {
      return state.personPanels.length > 0;
    }
  },
  actions: {
    // Expand exactly one person, minimizing the rest. Adds the panel if new.
    openPerson(id: string): void {
      if (!this.isOpen(id)) {
        this.personPanels.push({ id, minimized: false });
      }
      this.expandPerson(id);
      this.railMode = 'rectangles';
    },
    expandPerson(id: string): void {
      for (const panel of this.personPanels) {
        panel.minimized = panel.id !== id;
      }
      this.railMode = 'rectangles';
    },
    minimizePerson(id: string): void {
      const panel = this.personPanels.find(p => p.id === id);
      if (panel) {
        panel.minimized = true;
      }
    },
    minimizeAllPersons(): void {
      for (const panel of this.personPanels) {
        panel.minimized = true;
      }
    },
    closePerson(id: string): void {
      this.personPanels = this.personPanels.filter(p => p.id !== id);
      if (this.biggerViewId === id) {
        this.biggerViewId = null;
      }
    },
    toggleStats(): void {
      this.statsMinimized = !this.statsMinimized;
    },
    setStatsMinimized(value: boolean): void {
      this.statsMinimized = value;
    },
    // The ← arrow: show all panels as minimized rectangles.
    expandRail(): void {
      this.railMode = 'rectangles';
      this.minimizeAllPersons();
    },
    // The → arrow: collapse the rail back to chips (membership preserved).
    collapseRail(): void {
      this.railMode = 'chips';
    },
    openBiggerView(id: string): void {
      this.biggerViewId = id;
    },
    closeBiggerView(): void {
      this.biggerViewId = null;
    }
  }
});
```

- [ ] **Step 4: Run it green**

Run: `npx vitest run src/stores/panelStore.spec.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/stores/panelStore.ts src/frontend/src/stores/panelStore.spec.ts
git commit -m "feat(store): add panelStore for the dockable rail"
```

---

## Task 5: `PersonDetail` — extract the person content

Extract the inner content of today's `PersonPopup` (header, summary, expanded biography/residences/links, More/Less control) into a standalone presentational component that reads `selectionStore` + `localeStore`, so both the docked panel and the bigger-view modal can render it.

**Files:**
- Create: `src/frontend/src/components/PersonDetail.vue`
- Test: `src/frontend/src/components/PersonDetail.spec.ts`

- [ ] **Step 1: Write the failing test**

`PersonDetail.spec.ts` (mirrors the existing PersonPopup content tests):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PersonDetail from './PersonDetail.vue';
import { useSelectionStore } from '../stores/selectionStore';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonDetail as PersonDetailType } from '../types/family';

const tadeusz: PersonDetailType = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: 'Тадэвуш', en: 'Tadeusz' },
  surname: { ru: 'Ковальский', be: 'Кавальскі', en: 'Kowalski' },
  maidenName: null, sex: 'male',
  birth: { year: 1962, month: 4, day: null, approx: false, place: { ru: 'Варшава', be: 'Варшава', en: 'Warsaw' } },
  death: null, vocation: 'teacher',
  summary: { ru: 'Учитель истории.', be: null, en: 'A history teacher.' },
  biography: { ru: 'Длинная биография.', be: null, en: 'A longer biography.' },
  portrait: null, gallery: [],
  links: [{ type: 'facebook', url: 'https://facebook.com/example' }],
  residences: [{ place: { ru: 'Варшава', be: null, en: 'Warsaw' }, fromYear: 1962, toYear: null, mapUrl: 'https://maps.google.com/?q=Warszawa' }],
  parents: { motherId: 'p-0014', fatherId: 'p-0013' },
  marriedIntoFamily: false, isDefaultRoot: true
};

function mountWith(detail: PersonDetailType) {
  const store = useSelectionStore();
  store.$patch({ selectedId: detail.id, detail, mode: 'normal', loading: false, error: null });
  return mount(PersonDetail, { global: { plugins: [i18n] } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
});

describe('PersonDetail', () => {
  it('renders name, lifespan, vocation and summary', () => {
    const w = mountWith(tadeusz);
    expect(w.text()).toContain('Tadeusz');
    expect(w.text()).toContain('1962–');
    expect(w.text()).toContain('Teacher');
    expect(w.text()).toContain('A history teacher.');
  });

  it('hides biography/residences/links until expanded', () => {
    const w = mountWith(tadeusz);
    expect(w.find('[data-test="biography"]').exists()).toBe(false);
    useSelectionStore().expand();
    return w.vm.$nextTick().then(() => {
      expect(w.find('[data-test="biography"]').text()).toContain('A longer biography.');
      expect(w.find('[data-test="residences"]').text()).toContain('Warsaw');
      expect(w.find('[data-test="links"]').find('a').text()).toContain('Facebook');
    });
  });

  it('expands and collapses via the More/Less control', async () => {
    const w = mountWith(tadeusz);
    await w.find('[data-test="expand"]').trigger('click');
    expect(useSelectionStore().mode).toBe('expanded');
    await w.find('[data-test="collapse"]').trigger('click');
    expect(useSelectionStore().mode).toBe('normal');
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run src/components/PersonDetail.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PersonDetail.vue`**

Move the content logic out of `PersonPopup.vue` (script computeds + the `<template>` from `<header class="popup__head">` through the `<footer class="popup__actions">`). Rename the BEM block from `popup__*` to `detail__*`. Keep the existing `data-test` hooks (`portrait-fallback`, `biography`, `residences`, `links`, `expand`, `collapse`, `vocation-icon` via `VocationIcon`). The component renders nothing chrome-related (no scrim, no close) — just the content.

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useSelectionStore } from '../stores/selectionStore';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatLifespan } from '../format/lifespan';
import type { LocalizedText } from '../types/family';
import VocationIcon from './VocationIcon.vue';

const { t, te } = useI18n({ useScope: 'global' });
const selection = useSelectionStore();
const localeStore = useLocaleStore();
const { detail, mode, loading, error } = storeToRefs(selection);

function loc(text: LocalizedText | null | undefined): string {
  return localize(text, localeStore.currentLocale);
}
const fullName = computed(() => detail.value ? `${loc(detail.value.givenName)} ${loc(detail.value.surname)}`.trim() : '');
const maidenName = computed(() => (detail.value?.maidenName ? loc(detail.value.maidenName) : ''));
const lifespan = computed(() => (detail.value ? formatLifespan(detail.value.birth, detail.value.death) : ''));
const summaryText = computed(() => loc(detail.value?.summary));
const initial = computed(() => fullName.value.charAt(0).toUpperCase());
const vocationLabel = computed(() => {
  const v = detail.value?.vocation;
  if (!v) return '';
  const key = `vocation.${v}`;
  return te(key) ? t(key) : v;
});
function socialLabel(type: string): string {
  const key = `social.${type}`;
  return te(key) ? t(key) : type;
}
function residenceYears(fromYear: number | null, toYear: number | null): string {
  const from = fromYear ?? '';
  const to = toYear ?? t('person.present');
  if (from === '' && toYear == null) return '';
  return `${from}–${to}`;
}
</script>

<template>
  <div class="detail" data-test="person-detail">
    <p v-if="loading" class="detail__status">{{ t('person.loading') }}</p>
    <p v-else-if="error" class="detail__status detail__status--error">{{ t('person.error') }}</p>

    <template v-else-if="detail">
      <header class="detail__head">
        <div class="detail__portrait">
          <span class="detail__initial" data-test="portrait-fallback">{{ initial }}</span>
        </div>
        <div class="detail__heading">
          <h2 class="detail__name">{{ fullName }}</h2>
          <p v-if="maidenName" class="detail__maiden">{{ t('person.nee') }} {{ maidenName }}</p>
          <p class="detail__life">{{ lifespan }}</p>
          <p v-if="vocationLabel" class="detail__vocation">
            <VocationIcon :vocation="detail.vocation" />{{ vocationLabel }}
          </p>
        </div>
      </header>

      <p v-if="summaryText" class="detail__summary">{{ summaryText }}</p>

      <section v-if="mode === 'expanded'" class="detail__expanded">
        <div v-if="loc(detail.biography)" class="detail__block">
          <h3 class="detail__block-title">{{ t('person.biography') }}</h3>
          <p class="detail__bio" data-test="biography">{{ loc(detail.biography) }}</p>
        </div>
        <div v-if="detail.residences.length" class="detail__block">
          <h3 class="detail__block-title">{{ t('person.residences') }}</h3>
          <ul class="detail__list" data-test="residences">
            <li v-for="(r, i) in detail.residences" :key="i" class="detail__residence">
              <span class="detail__place">{{ loc(r.place) }}</span>
              <span class="detail__years">{{ residenceYears(r.fromYear, r.toYear) }}</span>
              <a v-if="r.mapUrl" class="detail__map" :href="r.mapUrl" target="_blank" rel="noopener noreferrer" :aria-label="t('person.viewOnMap')">🗺</a>
            </li>
          </ul>
        </div>
        <div v-if="detail.links.length" class="detail__block">
          <h3 class="detail__block-title">{{ t('person.links') }}</h3>
          <ul class="detail__list detail__links" data-test="links">
            <li v-for="link in detail.links" :key="link.url">
              <a :href="link.url" target="_blank" rel="noopener noreferrer">{{ socialLabel(link.type) }}</a>
            </li>
          </ul>
        </div>
      </section>

      <footer class="detail__actions">
        <button v-if="mode === 'normal'" type="button" class="detail__more" data-test="expand" @click="selection.expand()">{{ t('person.expand') }}</button>
        <button v-else type="button" class="detail__more" data-test="collapse" @click="selection.collapse()">{{ t('person.collapse') }}</button>
      </footer>
    </template>
  </div>
</template>

<style scoped lang="scss">
.detail { font-family: var(--font-body); color: var(--ink); }
.detail__status { margin: 8px 0; font-style: italic; &--error { color: #8a3b32; } }
.detail__head { display: flex; gap: 14px; align-items: center; }
.detail__portrait { flex: 0 0 auto; width: 72px; height: 72px; border-radius: 50%; border: 1px solid var(--glass-border); background: var(--parchment-2); display: flex; align-items: center; justify-content: center; }
.detail__initial { font-size: 32px; color: var(--ink-soft); }
.detail__name { margin: 0; font-size: 26px; font-family: var(--font-display); }
.detail__maiden, .detail__life, .detail__vocation { margin: 3px 0 0; font-size: 18px; color: var(--ink-soft); }
.detail__vocation { display: inline-flex; align-items: center; gap: 6px; }
.detail__summary { margin: 12px 0 0; line-height: 1.5; font-size: 17px; }
.detail__expanded { margin-top: 14px; border-top: 1px solid var(--glass-border); padding-top: 12px; }
.detail__block { margin-top: 12px; }
.detail__block-title { margin: 0 0 6px; font-size: 16px; font-family: var(--font-display); letter-spacing: 0.4px; text-transform: uppercase; color: var(--ink-soft); }
.detail__bio { margin: 0; line-height: 1.55; font-size: 16px; white-space: pre-line; }
.detail__list { margin: 0; padding: 0; list-style: none; font-size: 16px; }
.detail__residence { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; }
.detail__years { color: var(--ink-soft); font-size: 15px; }
.detail__map { text-decoration: none; }
.detail__links a { color: var(--leaf-deep); }
.detail__actions { margin-top: 14px; display: flex; gap: 10px; }
.detail__more { padding: 6px 14px; background: var(--parchment-2); border: 1px solid var(--ink-soft); border-radius: 6px; color: var(--ink); font: inherit; cursor: pointer; &:hover { background: var(--parchment); } &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; } }
</style>
```

> Note: `.detail__bio` uses `white-space: pre-line` so the new multi-paragraph biographies (`\n\n` separators in `family.json`) render as paragraphs.

- [ ] **Step 4: Run it green**

Run: `npx vitest run src/components/PersonDetail.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonDetail.vue src/frontend/src/components/PersonDetail.spec.ts
git commit -m "feat: extract PersonDetail content component"
```

---

## Task 6: `PersonPopup` becomes the bigger-view modal

Reduce `PersonPopup.vue` to chrome: scrim + dialog wrapping `<PersonDetail />`, closing via `panelStore.closeBiggerView()`. Keep `data-test="dialog"`, `data-test="scrim"`, `data-test="close"`, `role="dialog"`, Esc-to-close.

**Files:**
- Modify: `src/frontend/src/components/PersonPopup.vue`
- Modify: `src/frontend/src/components/PersonPopup.spec.ts`

- [ ] **Step 1: Update the spec to assert the modal wraps PersonDetail and closes via the store**

Replace `PersonPopup.spec.ts` with:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PersonPopup from './PersonPopup.vue';
import { useSelectionStore } from '../stores/selectionStore';
import { usePanelStore } from '../stores/panelStore';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonDetail } from '../types/family';

const tadeusz = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: 'Тадэвуш', en: 'Tadeusz' },
  surname: { ru: 'Ковальский', be: 'Кавальскі', en: 'Kowalski' },
  maidenName: null, sex: 'male',
  birth: { year: 1962, month: 4, day: null, approx: false, place: { ru: 'Варшава', be: null, en: 'Warsaw' } },
  death: null, vocation: 'teacher',
  summary: { ru: 'Учитель истории.', be: null, en: 'A history teacher.' },
  biography: { ru: 'Длинная.', be: null, en: 'A longer biography.' },
  portrait: null, gallery: [],
  links: [], residences: [],
  parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true
} as unknown as PersonDetail;

function mountModal() {
  useSelectionStore().$patch({ selectedId: tadeusz.id, detail: tadeusz, mode: 'normal', loading: false, error: null });
  usePanelStore().openBiggerView(tadeusz.id);
  return mount(PersonPopup, { global: { plugins: [i18n] } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
});

describe('PersonPopup (bigger-view modal)', () => {
  it('renders a dialog with the person content', () => {
    const w = mountModal();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    expect(w.find('[data-test="person-detail"]').exists()).toBe(true);
    expect(w.text()).toContain('Tadeusz');
  });

  it('clears bigger view when the close control is clicked', async () => {
    const w = mountModal();
    await w.find('[data-test="close"]').trigger('click');
    expect(usePanelStore().biggerViewId).toBeNull();
  });

  it('clears bigger view on scrim click and Escape', async () => {
    const w = mountModal();
    await w.find('[data-test="scrim"]').trigger('click');
    expect(usePanelStore().biggerViewId).toBeNull();

    usePanelStore().openBiggerView(tadeusz.id);
    await w.find('[data-test="dialog"]').trigger('keydown.esc');
    expect(usePanelStore().biggerViewId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run src/components/PersonPopup.spec.ts`
Expected: FAIL — PersonPopup still has the old internal content / no PersonDetail.

- [ ] **Step 3: Rewrite `PersonPopup.vue` as the modal wrapper**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePanelStore } from '../stores/panelStore';
import PersonDetail from './PersonDetail.vue';

const { t } = useI18n({ useScope: 'global' });
const panel = usePanelStore();
const dialogRef = ref<HTMLElement | null>(null);

function onClose(): void {
  panel.closeBiggerView();
}
onMounted(() => dialogRef.value?.focus());
</script>

<template>
  <div class="popup" data-test="person-popup">
    <div class="popup__scrim" data-test="scrim" @click="onClose" />
    <section
      ref="dialogRef"
      class="popup__dialog"
      data-test="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('panel.biggerView')"
      tabindex="-1"
      @keydown.esc.prevent="onClose"
    >
      <button type="button" class="popup__close" data-test="close" :aria-label="t('person.close')" @click="onClose">✕</button>
      <PersonDetail />
    </section>
  </div>
</template>

<style scoped lang="scss">
.popup { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; }
.popup__scrim { position: absolute; inset: 0; background: var(--scrim); }
.popup__dialog {
  position: relative; z-index: 1; width: min(560px, calc(100vw - 32px)); max-height: min(82vh, 720px);
  overflow-y: auto; padding: 22px 24px; background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: 14px; box-shadow: var(--glass-shadow); backdrop-filter: blur(12px); color: var(--ink);
  @supports not ((backdrop-filter: blur(12px)) or (-webkit-backdrop-filter: blur(12px))) { background: var(--parchment-2); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
.popup__close { position: absolute; top: 10px; right: 12px; width: 28px; height: 28px; border: none; border-radius: 50%; background: transparent; color: var(--ink-soft); font-size: 20px; cursor: pointer; z-index: 2; &:hover { background: rgba(95, 82, 64, 0.12); } &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; } }
</style>
```

- [ ] **Step 4: Run it green**

Run: `npx vitest run src/components/PersonPopup.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonPopup.vue src/frontend/src/components/PersonPopup.spec.ts
git commit -m "refactor: PersonPopup becomes the bigger-view modal"
```

---

## Task 7: `DockPanel` — shared panel chrome

A presentational component rendering the title bar (icon · title · control buttons), the body (slot) when expanded, and a square chip when `state==='chip'`. It emits events; it owns no store state.

**Files:**
- Create: `src/frontend/src/components/DockPanel.vue`
- Test: `src/frontend/src/components/DockPanel.spec.ts`

- [ ] **Step 1: Write the failing test**

`DockPanel.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../i18n';
import DockPanel from './DockPanel.vue';

function mountPanel(props: Record<string, unknown>) {
  return mount(DockPanel, {
    props: { icon: '👤', title: 'Anna', state: 'expanded', ...props },
    slots: { default: '<p class="body">content</p>' },
    global: { plugins: [i18n] }
  });
}

describe('DockPanel', () => {
  it('renders the icon and title', () => {
    const w = mountPanel({});
    expect(w.get('[data-test="panel-title"]').text()).toBe('Anna');
    expect(w.text()).toContain('👤');
  });

  it('shows the body when expanded and hides it when minimized', async () => {
    const w = mountPanel({ state: 'expanded' });
    expect(w.find('.body').exists()).toBe(true);
    await w.setProps({ state: 'minimized' });
    expect(w.find('.body').exists()).toBe(false);
  });

  it('renders a chip (icon only, no body) in chip state', () => {
    const w = mountPanel({ state: 'chip', chipGlyph: 'А' });
    expect(w.get('[data-test="panel-chip"]').text()).toContain('А');
    expect(w.find('.body').exists()).toBe(false);
  });

  it('emits expand when a minimized panel header is activated', async () => {
    const w = mountPanel({ state: 'minimized' });
    await w.get('[data-test="panel-expand"]').trigger('click');
    expect(w.emitted('expand')).toBeTruthy();
  });

  it('emits minimize, close and bigger from the controls', async () => {
    const w = mountPanel({ state: 'expanded', closable: true, biggerable: true });
    await w.get('[data-test="panel-minimize"]').trigger('click');
    await w.get('[data-test="panel-bigger"]').trigger('click');
    await w.get('[data-test="panel-close"]').trigger('click');
    expect(w.emitted('minimize')).toBeTruthy();
    expect(w.emitted('bigger')).toBeTruthy();
    expect(w.emitted('close')).toBeTruthy();
  });

  it('omits the close control when not closable (pinned stats)', () => {
    const w = mountPanel({ state: 'expanded', closable: false, pinned: true });
    expect(w.find('[data-test="panel-close"]').exists()).toBe(false);
  });

  it('emits chip-tap when a chip is clicked', async () => {
    const w = mountPanel({ state: 'chip', chipGlyph: 'А' });
    await w.get('[data-test="panel-chip"]').trigger('click');
    expect(w.emitted('chipTap')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run src/components/DockPanel.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `DockPanel.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

type PanelState = 'expanded' | 'minimized' | 'chip';

const props = withDefaults(defineProps<{
  icon: string;
  title: string;
  state: PanelState;
  chipGlyph?: string;
  closable?: boolean;
  biggerable?: boolean;
  pinned?: boolean;
}>(), { closable: true, biggerable: false, pinned: false, chipGlyph: '' });

const emit = defineEmits<{ expand: []; minimize: []; close: []; bigger: []; chipTap: [] }>();

const { t } = useI18n({ useScope: 'global' });
const showBody = computed(() => props.state === 'expanded');
const glyph = computed(() => props.chipGlyph || props.icon);
</script>

<template>
  <div v-if="state === 'chip'" class="dock-chip" :class="{ 'dock-chip--pinned': pinned }" data-test="panel-chip"
       role="button" tabindex="0" :aria-label="title" @click="emit('chipTap')" @keydown.enter="emit('chipTap')">
    <span class="dock-chip__glyph">{{ glyph }}</span>
  </div>

  <section v-else class="dock-panel" :class="{ 'dock-panel--min': state === 'minimized', 'dock-panel--exp': state === 'expanded' }"
           role="region" :aria-label="title">
    <header class="dock-panel__bar">
      <span class="dock-panel__icon" aria-hidden="true">{{ icon }}</span>
      <span class="dock-panel__title" data-test="panel-title">{{ title }}</span>
      <span v-if="pinned" class="dock-panel__lock" aria-hidden="true">🔒</span>

      <button v-if="state === 'minimized'" type="button" class="dock-panel__btn" data-test="panel-expand"
              :aria-label="t('panel.expand')" @click="emit('expand')">▢</button>
      <template v-else>
        <button v-if="biggerable" type="button" class="dock-panel__btn" data-test="panel-bigger"
                :aria-label="t('panel.biggerView')" @click="emit('bigger')">⤢</button>
        <button type="button" class="dock-panel__btn" data-test="panel-minimize"
                :aria-label="t('panel.minimize')" @click="emit('minimize')">–</button>
      </template>
      <button v-if="closable" type="button" class="dock-panel__btn" data-test="panel-close"
              :aria-label="t('panel.close')" @click="emit('close')">✕</button>
    </header>

    <div v-if="showBody" class="dock-panel__body"><slot /></div>
  </section>
</template>

<style scoped lang="scss">
.dock-panel { background: linear-gradient(#f8f2df, #f1e7cb); border: 1px solid var(--gilt); border-radius: 10px; box-shadow: 0 6px 18px var(--shadow); overflow: hidden; }
.dock-panel--exp { border-color: var(--gilt-deep); }
.dock-panel__bar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: linear-gradient(var(--control-grad-top), var(--control-grad-bottom)); border-bottom: 1px solid rgba(183, 145, 63, 0.45); }
.dock-panel--min .dock-panel__bar { border-bottom: none; }
.dock-panel__icon { width: 22px; height: 22px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 5px; background: var(--paper); border: 1px solid var(--gilt); font-size: 13px; }
.dock-panel__title { flex: 1 1 auto; font-family: var(--font-display); font-weight: 600; font-size: 16px; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dock-panel__lock { font-size: 12px; color: var(--gilt-deep); }
.dock-panel__btn { width: 24px; height: 24px; flex: 0 0 auto; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--ink-soft); font-size: 14px; line-height: 1; cursor: pointer; display: grid; place-items: center; &:hover { background: rgba(95, 82, 64, 0.12); } &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 1px; } }
.dock-panel__body { padding: 12px 14px 14px; }

.dock-chip { width: 48px; height: 48px; border-radius: 11px; background: linear-gradient(#f8f2df, #f1e7cb); border: 1px solid var(--gilt); box-shadow: 0 4px 12px var(--shadow); display: grid; place-items: center; cursor: pointer; &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; } }
.dock-chip--pinned { border-color: var(--gilt-deep); }
.dock-chip__glyph { font-family: var(--font-display); font-size: 18px; color: var(--ink-soft); }
</style>
```

- [ ] **Step 4: Run it green**

Run: `npx vitest run src/components/DockPanel.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/DockPanel.vue src/frontend/src/components/DockPanel.spec.ts
git commit -m "feat: add DockPanel chrome component"
```

---

## Task 8: `StatsPanel` renders inside a `DockPanel`

Wrap the four stat rows in a `DockPanel` (pinned, not closable). Drive `state` and minimize/expand from `panelStore.statsMinimized`. Keep the existing `data-test="stat-*"` hooks and `Family Statistics` title text path — but the panel title comes from `panel.statsTitle`.

**Files:**
- Modify: `src/frontend/src/components/StatsPanel.vue`
- Modify: `src/frontend/src/components/StatsPanel.spec.ts`

- [ ] **Step 1: Update the spec**

Add Pinia setup and a `state`/`chip` prop. Replace `StatsPanel.spec.ts` with:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import StatsPanel from './StatsPanel.vue';
import { usePanelStore } from '../stores/panelStore';
import { i18n } from '../i18n';
import type { PersonSummary } from '../types/family';

function person(id: string, birthYear: number | null, portrait: string | null, deathYear: number | null): PersonSummary {
  return { id, givenName: { ru: id, be: null, en: id }, surname: { ru: 'X', be: null, en: 'X' },
    maidenName: null, sex: 'male', birthYear, deathYear, vocation: 'other', portrait,
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false };
}

beforeEach(() => setActivePinia(createPinia()));

function mountStats(people: PersonSummary[], state: 'expanded' | 'minimized' | 'chip' = 'expanded') {
  return mount(StatsPanel, { props: { people, state }, global: { plugins: [i18n] } });
}

describe('StatsPanel', () => {
  it('computes counts from the people list when expanded', () => {
    const w = mountStats([person('a', 1900, 'a.jpg', 1970), person('b', 1880, null, null), person('c', null, 'c.jpg', null)]);
    expect(w.get('[data-test="stat-members"]').text()).toContain('3');
    expect(w.get('[data-test="stat-earliest"]').text()).toContain('1880');
    expect(w.get('[data-test="stat-withPortraits"]').text()).toContain('2');
    expect(w.get('[data-test="stat-living"]').text()).toContain('2');
  });

  it('shows zeros and an em dash with no people', () => {
    const w = mountStats([]);
    expect(w.get('[data-test="stat-members"]').text()).toContain('0');
    expect(w.get('[data-test="stat-earliest"]').text()).toContain('—');
  });

  it('hides the figures when minimized', () => {
    const w = mountStats([person('a', 1900, null, null)], 'minimized');
    expect(w.find('[data-test="stat-members"]').exists()).toBe(false);
  });

  it('toggles stats minimized in the store when the control is used', async () => {
    const w = mountStats([person('a', 1900, null, null)], 'expanded');
    await w.get('[data-test="panel-minimize"]').trigger('click');
    expect(usePanelStore().statsMinimized).toBe(true);
  });

  it('is not closable', () => {
    const w = mountStats([person('a', 1900, null, null)], 'expanded');
    expect(w.find('[data-test="panel-close"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run src/components/StatsPanel.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `StatsPanel.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePanelStore } from '../stores/panelStore';
import DockPanel from './DockPanel.vue';
import type { PersonSummary } from '../types/family';

const props = withDefaults(defineProps<{ people: PersonSummary[]; state?: 'expanded' | 'minimized' | 'chip' }>(), { state: 'expanded' });
const { t } = useI18n({ useScope: 'global' });
const panel = usePanelStore();

const birthYears = computed(() => props.people.map(p => p.birthYear).filter((y): y is number => y != null));
const stats = computed(() => [
  { key: 'members', label: t('stats.members'), value: props.people.length },
  { key: 'earliest', label: t('stats.earliest'), value: birthYears.value.length ? Math.min(...birthYears.value) : '—' },
  { key: 'withPortraits', label: t('stats.withPortraits'), value: props.people.filter(p => p.portrait).length },
  { key: 'living', label: t('stats.living'), value: props.people.filter(p => p.deathYear == null).length }
]);
</script>

<template>
  <DockPanel
    :icon="'⚜'"
    :title="t('panel.statsTitle')"
    :state="state"
    chip-glyph="⚜"
    :closable="false"
    :pinned="true"
    data-test="stats-panel"
    @expand="panel.setStatsMinimized(false)"
    @minimize="panel.setStatsMinimized(true)"
    @chip-tap="panel.setStatsMinimized(false)"
  >
    <div v-for="s in stats" :key="s.key" class="stats__row" :data-test="`stat-${s.key}`">
      <span class="stats__label">{{ s.label }}</span>
      <span class="stats__value">{{ s.value }}</span>
    </div>
  </DockPanel>
</template>

<style scoped lang="scss">
.stats__row { display: flex; justify-content: space-between; align-items: baseline; padding: 9px 2px; border-bottom: 1px dashed rgba(111, 90, 60, 0.22); &:last-child { border-bottom: none; } }
.stats__label { font-family: var(--font-body); font-size: 18px; color: var(--ink); }
.stats__value { font-family: var(--font-display); font-weight: 600; font-size: 21px; color: var(--umber); }
</style>
```

> The `stats.title` "Family Statistics" string is no longer rendered as a heading (the DockPanel title `panel.statsTitle` replaces it). The earlier test assertion on `'Family Statistics'` is intentionally dropped.

- [ ] **Step 4: Run it green**

Run: `npx vitest run src/components/StatsPanel.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/StatsPanel.vue src/frontend/src/components/StatsPanel.spec.ts
git commit -m "refactor: StatsPanel renders inside a DockPanel"
```

---

## Task 9: `PanelRail` — desktop layout

The rail container. This task implements the **desktop** layout only (`isMobile === false`): a pinned stats DockPanel + a scrollable column of person DockPanels, each rendering `PersonDetail` when expanded. Mobile is Task 10.

**Files:**
- Create: `src/frontend/src/components/PanelRail.vue`
- Test: `src/frontend/src/components/PanelRail.spec.ts`

- [ ] **Step 1: Write the failing test (desktop)**

`PanelRail.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PanelRail from './PanelRail.vue';
import { usePanelStore } from '../stores/panelStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonSummary, PersonDetail } from '../types/family';

// Force desktop: matchMedia never matches the mobile query.
vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));

function person(id: string, name: string): PersonSummary {
  return { id, givenName: { ru: name, be: null, en: name }, surname: { ru: 'K', be: null, en: 'K' },
    maidenName: null, sex: 'male', birthYear: 1900, deathYear: 1970, vocation: 'other', portrait: null,
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false };
}
const people = [person('p-1', 'Anna'), person('p-2', 'Symon')];

function mountRail() {
  useSelectionStore().$patch({ selectedId: 'p-1', mode: 'normal', loading: false, error: null,
    detail: { id: 'p-1', givenName: { ru: 'Anna', be: null, en: 'Anna' }, surname: { ru: 'K', be: null, en: 'K' },
      maidenName: null, sex: 'female', birth: { year: 1900, month: null, day: null, approx: false, place: null },
      death: null, vocation: 'other', summary: { ru: null, be: null, en: 'Summary' }, biography: null,
      portrait: null, gallery: [], links: [], residences: [], parents: { motherId: null, fatherId: null },
      marriedIntoFamily: false, isDefaultRoot: false } as PersonDetail });
  return mount(PanelRail, { props: { people }, global: { plugins: [i18n] } });
}

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); useLocaleStore().setLocale('en'); });

describe('PanelRail (desktop)', () => {
  it('always renders the pinned stats panel', () => {
    const w = mountRail();
    expect(w.find('[data-test="stats-panel"]').exists()).toBe(true);
  });

  it('renders a person panel per open person, names in the title', () => {
    const w = mountRail();
    const panel = usePanelStore();
    panel.openPerson('p-1');
    return w.vm.$nextTick().then(() => {
      const titles = w.findAll('[data-test="panel-title"]').map(n => n.text());
      expect(titles).toContain('Anna K');
    });
  });

  it('renders PersonDetail inside the expanded person panel', async () => {
    const w = mountRail();
    usePanelStore().openPerson('p-1');
    await w.vm.$nextTick();
    expect(w.find('[data-test="person-detail"]').exists()).toBe(true);
  });

  it('minimize button minimizes that person in the store', async () => {
    const w = mountRail();
    usePanelStore().openPerson('p-1');
    await w.vm.$nextTick();
    await w.get('[data-test="panel-minimize"]').trigger('click');
    expect(usePanelStore().expandedId).toBeNull();
  });

  it('bigger button opens bigger view for the expanded person', async () => {
    const w = mountRail();
    usePanelStore().openPerson('p-1');
    await w.vm.$nextTick();
    await w.get('[data-test="panel-bigger"]').trigger('click');
    expect(usePanelStore().biggerViewId).toBe('p-1');
  });

  it('does not render the mobile arrow on desktop', () => {
    const w = mountRail();
    expect(w.find('[data-test="rail-arrow"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run src/components/PanelRail.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PanelRail.vue` (desktop branch; mobile branch stubbed for Task 10)**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { usePanelStore } from '../stores/panelStore';
import { useLocaleStore } from '../stores/localeStore';
import { useMediaQuery } from '../composables/useMediaQuery';
import { localize } from '../i18n/localize';
import DockPanel from './DockPanel.vue';
import PersonDetail from './PersonDetail.vue';
import StatsPanel from './StatsPanel.vue';
import type { PersonSummary } from '../types/family';

const props = defineProps<{ people: PersonSummary[] }>();
const { t } = useI18n({ useScope: 'global' });
const panel = usePanelStore();
const localeStore = useLocaleStore();
const { personPanels, statsMinimized, railMode, expandedId } = storeToRefs(panel);

const isMobile = useMediaQuery('(max-width: 767.98px)');

const byId = computed(() => new Map(props.people.map(p => [p.id, p])));
function nameOf(id: string): string {
  const p = byId.value.get(id);
  if (!p) return id;
  return `${localize(p.givenName, localeStore.currentLocale)} ${localize(p.surname, localeStore.currentLocale)}`.trim();
}
function initialOf(id: string): string {
  return nameOf(id).charAt(0).toUpperCase();
}

// Per-person DockPanel state. On desktop chips never appear; on mobile a
// minimized panel renders as a chip when railMode === 'chips'.
function personState(minimized: boolean): 'expanded' | 'minimized' | 'chip' {
  if (isMobile.value && railMode.value === 'chips') return 'chip';
  return minimized ? 'minimized' : 'expanded';
}
const statsState = computed<'expanded' | 'minimized' | 'chip'>(() => {
  if (isMobile.value && railMode.value === 'chips') return 'chip';
  return statsMinimized.value ? 'minimized' : 'expanded';
});
</script>

<template>
  <aside class="rail" :class="{ 'rail--mobile': isMobile, 'rail--chips': isMobile && railMode === 'chips' }" data-test="panel-rail">
    <!-- Mobile arrow toggle, directly under stats -->
    <button
      v-if="isMobile"
      type="button"
      class="rail__arrow"
      data-test="rail-arrow"
      :aria-label="railMode === 'chips' ? t('panel.expandPanels') : t('panel.collapseToChips')"
      @click="railMode === 'chips' ? panel.expandRail() : panel.collapseRail()"
    >{{ railMode === 'chips' ? '‹' : '›' }}</button>

    <div class="rail__pinned">
      <StatsPanel :people="people" :state="statsState" />
    </div>

    <div class="rail__stack" :class="{ 'rail__stack--scroll': !isMobile || railMode === 'rectangles' }">
      <DockPanel
        v-for="p in personPanels"
        :key="p.id"
        icon="👤"
        :title="nameOf(p.id)"
        :chip-glyph="initialOf(p.id)"
        :state="personState(p.minimized)"
        :biggerable="!isMobile && expandedId === p.id"
        @expand="panel.expandPerson(p.id)"
        @minimize="panel.minimizePerson(p.id)"
        @close="panel.closePerson(p.id)"
        @bigger="panel.openBiggerView(p.id)"
        @chip-tap="panel.openPerson(p.id)"
      >
        <PersonDetail v-if="expandedId === p.id" />
      </DockPanel>
    </div>
  </aside>
</template>

<style scoped lang="scss">
@use '../styles/tokens.scss' as t;

.rail {
  position: absolute; top: 12px; right: 12px; z-index: 6;
  width: var(--rail-width); max-height: calc(100% - 24px);
  display: flex; flex-direction: column; gap: 10px;
}
.rail__pinned { flex: 0 0 auto; }
.rail__stack { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.rail__stack--scroll { overflow-y: auto; padding-right: 2px; }
.rail__arrow { display: none; }

@media (max-width: t.$bp-rail - 0.02px) {
  .rail {
    top: 8px; right: 8px; left: 8px; width: auto; max-height: calc(100% - 16px);
  }
  .rail--chips { left: auto; align-items: flex-end; } // chips hug the right edge
  .rail__arrow {
    display: grid; place-items: center; align-self: flex-end;
    width: 30px; height: 24px; border-radius: 7px; border: 1px solid var(--leaf-deep);
    background: var(--leaf-deep); color: var(--on-accent); font-size: 15px; cursor: pointer;
  }
}
</style>
```

> The mobile-specific behaviors (chips column hugging the right edge, full-width rectangles capped at `--rail-width`) are refined and tested in Task 10. This task only needs the desktop tests green and the component to compile.

- [ ] **Step 4: Run it green**

Run: `npx vitest run src/components/PanelRail.spec.ts`
Expected: PASS (desktop suite).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PanelRail.vue src/frontend/src/components/PanelRail.spec.ts
git commit -m "feat: add PanelRail desktop layout"
```

---

## Task 10: `PanelRail` — mobile chips, arrow, responsive

Add the mobile behaviors and tests: in chips mode the stats and person panels render as chips on the right edge with a `‹` arrow; the arrow expands all to minimized rectangles (`›`); tapping a chip opens that person expanded; rectangles cap at `--rail-width`.

**Files:**
- Modify: `src/frontend/src/components/PanelRail.vue` (styles + verify behavior)
- Modify: `src/frontend/src/components/PanelRail.spec.ts` (add a mobile describe block)

- [ ] **Step 1: Add mobile tests**

Append to `PanelRail.spec.ts` a second describe that re-stubs `matchMedia` to match the mobile query. Add at top-level (after the desktop stub helper) a factory:

```ts
function mountMobileRail() {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }));
  return mount(PanelRail, { props: { people }, global: { plugins: [i18n] } });
}

describe('PanelRail (mobile)', () => {
  it('renders the ‹ arrow in chips mode and toggles to rectangles', async () => {
    const w = mountMobileRail();
    const panel = usePanelStore();
    panel.openPerson('p-1');     // sets rectangles
    panel.collapseRail();        // back to chips
    await w.vm.$nextTick();
    const arrow = w.get('[data-test="rail-arrow"]');
    expect(arrow.text()).toContain('‹');
    await arrow.trigger('click');
    expect(panel.railMode).toBe('rectangles');
    expect(panel.expandedId).toBeNull();
  });

  it('renders person chips in chips mode and a chip tap expands that person', async () => {
    const w = mountMobileRail();
    const panel = usePanelStore();
    panel.openPerson('p-1');
    panel.collapseRail();
    await w.vm.$nextTick();
    const chips = w.findAll('[data-test="panel-chip"]');
    expect(chips.length).toBeGreaterThanOrEqual(2); // stats chip + person chip
    // tap the person chip (last one)
    await chips[chips.length - 1].trigger('click');
    expect(panel.railMode).toBe('rectangles');
    expect(panel.expandedId).toBe('p-1');
  });

  it('shows the › arrow in rectangles mode and collapses to chips', async () => {
    const w = mountMobileRail();
    const panel = usePanelStore();
    panel.expandRail();
    await w.vm.$nextTick();
    const arrow = w.get('[data-test="rail-arrow"]');
    expect(arrow.text()).toContain('›');
    await arrow.trigger('click');
    expect(panel.railMode).toBe('chips');
  });
});
```

> Note: because `useMediaQuery` reads `matchMedia` at setup, re-stub it (via `vi.stubGlobal`) **before** mounting in the mobile factory. `vi.unstubAllGlobals()` is not needed between files; the desktop stub at the top of this file applies to the desktop block which mounts via `mountRail`.

- [ ] **Step 2: Run it red**

Run: `npx vitest run src/components/PanelRail.spec.ts`
Expected: the mobile block FAILS where styles/structure are incomplete (e.g., chips not rendered because `personState`/`statsState` already return `'chip'` — verify). If logic from Task 9 already satisfies these, the failure will be in the CSS-only refinements; in that case make the assertions pass by ensuring chip rendering is reachable (they should be, since `personState` returns `'chip'` when `isMobile && railMode==='chips'`).

- [ ] **Step 3: Finalize the mobile styles**

Replace the `@media` block in `PanelRail.vue` with:

```scss
@media (max-width: t.$bp-rail - 0.02px) {
  .rail {
    top: 8px; right: 8px; left: 8px; width: auto; max-height: calc(100% - 16px);
    align-items: stretch;
  }
  // chips mode: hug the right edge as a vertical column
  .rail--chips { left: auto; align-items: flex-end; }
  .rail--chips .rail__stack { align-items: flex-end; }
  // rectangles mode: full width but capped at the desktop rail width, right-aligned
  .rail:not(.rail--chips) .rail__pinned,
  .rail:not(.rail--chips) .rail__stack { width: min(100%, var(--rail-width)); margin-left: auto; }

  .rail__arrow {
    display: grid; place-items: center; align-self: flex-end;
    width: 30px; height: 24px; border-radius: 7px; border: 1px solid var(--leaf-deep);
    background: var(--leaf-deep); color: var(--on-accent); font-size: 16px; cursor: pointer;
    order: 1; // sit directly under the pinned stats
  }
  .rail__pinned { order: 0; }
  .rail__stack { order: 2; }
}
```

> The fl/order trick places the arrow immediately under the pinned stats block in both modes, matching the spec sketch.

- [ ] **Step 4: Run it green**

Run: `npx vitest run src/components/PanelRail.spec.ts`
Expected: PASS (desktop + mobile).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PanelRail.vue src/frontend/src/components/PanelRail.spec.ts
git commit -m "feat: PanelRail mobile chips + arrow"
```

---

## Task 11: `TreeView` wiring — rail, route sync, tree select, modal

Replace the standalone `StatsPanel` + old `PersonPopup` usage in `TreeView` with `PanelRail` + the bigger-view modal. Wire the tree `@select` and keep the `/person/:id` route in sync with `panelStore.expandedId`, and drive `selectionStore` from the expanded id.

**Files:**
- Modify: `src/frontend/src/views/TreeView.vue`
- Test: `src/frontend/src/views/TreeView.spec.ts`

- [ ] **Step 1: Inspect the current TreeView spec to preserve its setup**

Run: `cat src/views/TreeView.spec.ts`
Read how it mounts (router mock, store seeding). Reuse that scaffold; do not invent a new one.

- [ ] **Step 2: Add wiring tests**

Add to `TreeView.spec.ts` (adapting store/router setup to the file's existing pattern):

```ts
// within the existing describe, after store/router setup helpers:
it('renders the PanelRail instead of a bare stats panel', async () => {
  const w = mountTreeView();           // existing helper in this spec
  await flush();                       // existing flush helper / nextTick
  expect(w.find('[data-test="panel-rail"]').exists()).toBe(true);
});

it('opens a person panel when the tree emits select', async () => {
  const w = mountTreeView();
  await flush();
  w.findComponent({ name: 'OakTree' }).vm.$emit('select', 'p-0016');
  await flush();
  expect(usePanelStore().isOpen('p-0016')).toBe(true);
  expect(usePanelStore().expandedId).toBe('p-0016');
});

it('shows the bigger-view modal only when biggerViewId is set', async () => {
  const w = mountTreeView();
  await flush();
  expect(w.find('[data-test="person-popup"]').exists()).toBe(false);
  usePanelStore().openPerson('p-0016');
  usePanelStore().openBiggerView('p-0016');
  await flush();
  expect(w.find('[data-test="person-popup"]').exists()).toBe(true);
});
```

> Import `usePanelStore` at the top of the spec. If the existing spec stubs child components globally, ensure `PanelRail` and `PersonPopup` are NOT stubbed for these assertions (or assert via store state instead of DOM where stubbed).

- [ ] **Step 3: Run it red**

Run: `npx vitest run src/views/TreeView.spec.ts`
Expected: FAIL — TreeView still renders the old StatsPanel/PersonPopup.

- [ ] **Step 4: Rewrite `TreeView.vue` template + wiring**

Update the `<script setup>`: import `usePanelStore` and `PanelRail`; keep `PersonPopup`. Replace the selection/route effect and the template's `StatsPanel`/`PersonPopup` usage:

```ts
// add imports
import PanelRail from '../components/PanelRail.vue';
import { usePanelStore } from '../stores/panelStore';
// keep: PersonPopup, StatsPanel import removed
const panel = usePanelStore();
```

Replace the existing `watch(selectedId, ...)` block with route↔panel↔selection sync:

```ts
// Route param is the focused (expanded) person. Keep it in sync with the panel
// store both ways, and fetch the expanded person's detail.
watch(selectedId, id => {
  if (id) {
    panel.openPerson(id);
  } else {
    panel.minimizeAllPersons();
  }
}, { immediate: true });

watch(() => panel.expandedId, id => {
  if (id) {
    void selection.open(id);
    if (route.params.id !== id) {
      void router.replace({ name: 'person', params: { id } });
    }
  } else {
    selection.close();
    if (route.name !== 'tree') {
      void router.replace({ name: 'tree' });
    }
  }
});
```

Keep `onSelect` pushing the route (unchanged) and replace `onClose` to close the focused person:

```ts
function onSelect(id: string): void {
  void router.push({ name: 'person', params: { id } });
}
function onCloseBigger(): void {
  panel.closeBiggerView();
}
```

Update the `<template>` bottom section:

```vue
    <PanelRail v-if="layout" :people="people" />
    <PersonPopup v-if="panel.biggerViewId" />
```

Remove the `<StatsPanel ... />` line and its import, and remove the old `.tree-view__stats` style block (the rail now owns its own positioning). Remove the now-unused `onClose` if nothing references it (the popup closes via the store).

- [ ] **Step 5: Run it green**

Run: `npx vitest run src/views/TreeView.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the full frontend suite to catch regressions**

Run: `npx vitest run`
Expected: all green. Fix any spec that imported the removed `StatsPanel` standalone positioning or old popup internals.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/views/TreeView.vue src/frontend/src/views/TreeView.spec.ts
git commit -m "feat: wire PanelRail and bigger-view modal into TreeView"
```

---

## Task 12: `AppBar` — slim mobile menu header

Below `$bp-rail`, collapse the AppBar to a single row: **☰ · brand · ⌕**, with Views/Language/Layout in a dropdown sheet and search revealed inline. Desktop layout is unchanged.

**Files:**
- Modify: `src/frontend/src/components/AppBar.vue`
- Modify: `src/frontend/src/components/AppBar.spec.ts`

- [ ] **Step 1: Read the current AppBar spec + child components**

Run: `cat src/components/AppBar.spec.ts src/components/TabNav.vue src/components/SearchField.vue`
Note how `TabNav`, `SearchField`, `LanguagePicker`, `OrientationToggle` expose their props/events so they can be reused inside the sheet.

- [ ] **Step 2: Add mobile-header tests**

Add to `AppBar.spec.ts`:

```ts
it('shows the menu and search buttons (mobile header markup is always present)', () => {
  const w = mountAppBar();                 // existing helper
  expect(w.find('[data-test="nav-menu"]').exists()).toBe(true);
  expect(w.find('[data-test="nav-search"]').exists()).toBe(true);
});

it('opens the menu sheet with views, language and layout', async () => {
  const w = mountAppBar();
  await w.get('[data-test="nav-menu"]').trigger('click');
  const sheet = w.get('[data-test="nav-sheet"]');
  expect(sheet.findComponent({ name: 'TabNav' }).exists()).toBe(true);
  expect(sheet.findComponent({ name: 'LanguagePicker' }).exists()).toBe(true);
  expect(sheet.findComponent({ name: 'OrientationToggle' }).exists()).toBe(true);
});

it('reveals the search field inline when the search button is clicked', async () => {
  const w = mountAppBar();
  await w.get('[data-test="nav-search"]').trigger('click');
  expect(w.findComponent({ name: 'SearchField' }).exists()).toBe(true);
});
```

> If `AppBar.spec.ts` has no `mountAppBar` helper, add one: `const mountAppBar = () => mount(AppBar, { global: { plugins: [i18n, createPinia()] } });` and `setActivePinia` in `beforeEach`, mirroring other specs. `TabNav`/`SearchField` use the family/ui stores, so Pinia must be active.

- [ ] **Step 3: Run it red**

Run: `npx vitest run src/components/AppBar.spec.ts`
Expected: FAIL — menu/search markup absent.

- [ ] **Step 4: Implement the mobile header in `AppBar.vue`**

Add a reactive `menuOpen`/`searchOpen` and the mobile markup. Keep the existing desktop `<header>` content; wrap mobile in its own row shown only below `$bp-rail` via CSS, and hide the desktop row below the breakpoint.

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFamilyStore } from '../stores/familyStore';
import TabNav from './TabNav.vue';
import SearchField from './SearchField.vue';
import LanguagePicker from './LanguagePicker.vue';
import OrientationToggle from './OrientationToggle.vue';

const { t } = useI18n({ useScope: 'global' });
const family = useFamilyStore();
const menuOpen = ref(false);
const searchOpen = ref(false);

const subtitle = computed(() => {
  const years = family.people.map(p => p.birthYear).filter((y): y is number => y != null);
  if (years.length === 0) return t('brand.lineage');
  return `${t('brand.lineage')} · ${Math.min(...years)} — ${new Date().getFullYear()}`;
});
</script>

<template>
  <header class="app-bar" data-test="app-bar">
    <!-- Desktop row (hidden below $bp-rail) -->
    <div class="app-bar__row app-bar__row--desktop">
      <TabNav />
      <span class="app-bar__spacer" />
      <SearchField />
      <LanguagePicker />
      <OrientationToggle />
    </div>

    <!-- Mobile header (shown below $bp-rail) -->
    <div class="app-bar__mobile">
      <button type="button" class="app-bar__icon" data-test="nav-menu" :aria-label="t('nav.menu')" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">☰</button>
      <span class="app-bar__brand"><b>{{ t('brand.titleLead') }}</b> {{ t('brand.titleRest') }}</span>
      <button type="button" class="app-bar__icon" data-test="nav-search" :aria-label="t('search.label') /* falls back if absent */" @click="searchOpen = !searchOpen">⌕</button>
    </div>
    <div v-if="searchOpen" class="app-bar__searchrow"><SearchField /></div>
    <div v-if="menuOpen" class="app-bar__sheet" data-test="nav-sheet">
      <div class="app-bar__group"><span class="app-bar__label">{{ t('nav.views') }}</span><TabNav /></div>
      <div class="app-bar__group"><span class="app-bar__label">{{ t('nav.language') }}</span><LanguagePicker /></div>
      <div class="app-bar__group"><span class="app-bar__label">{{ t('nav.layout') }}</span><OrientationToggle /></div>
    </div>

    <h1 class="app-bar__title"><b>{{ t('brand.titleLead') }}</b> {{ t('brand.titleRest') }}</h1>
    <p class="app-bar__subtitle" data-test="app-bar-subtitle">{{ subtitle }}</p>
  </header>
</template>

<style scoped lang="scss">
@use '../styles/tokens.scss' as t;

.app-bar { position: relative; z-index: 20; padding: 4px 8px 6px; color: var(--ink); }
.app-bar__row { display: flex; align-items: center; gap: 10px; }
.app-bar__spacer { flex: 1 1 auto; }
.app-bar__title { margin: 2px 0 0; text-align: center; font-family: var(--font-display); font-weight: 500; letter-spacing: 3px; font-size: 49px; color: var(--ink); text-shadow: 0 1px 0 #fff7e2; b { font-weight: 600; } }
.app-bar__subtitle { margin: 3px 0 4px; text-align: center; font-family: var(--font-body); font-style: italic; letter-spacing: 1px; font-size: 21px; color: var(--ink-soft); }

// Mobile header pieces hidden on desktop
.app-bar__mobile, .app-bar__searchrow, .app-bar__sheet { display: none; }
.app-bar__icon { width: 30px; height: 30px; border: 1px solid var(--gilt); border-radius: 6px; background: var(--paper); color: var(--ink); font-size: 15px; display: grid; place-items: center; cursor: pointer; }
.app-bar__brand { flex: 1 1 auto; text-align: center; font-family: var(--font-display); letter-spacing: 1.5px; font-size: 20px; }
.app-bar__sheet { flex-direction: column; gap: 10px; padding: 10px; margin-top: 6px; background: linear-gradient(#f8f2df, #f1e7cb); border: 1px solid var(--gilt-deep); border-radius: 10px; }
.app-bar__group { display: flex; flex-direction: column; gap: 4px; }
.app-bar__label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gilt-deep); }

@media (max-width: t.$bp-rail - 0.02px) {
  .app-bar__row--desktop, .app-bar__title, .app-bar__subtitle { display: none; }
  .app-bar__mobile { display: flex; align-items: center; gap: 8px; }
  .app-bar__searchrow { display: block; padding: 6px 0 2px; }
  .app-bar__sheet { display: flex; }
}
</style>
```

> The mobile sheet/search markup is always in the DOM (so component tests can find it) but hidden via CSS on desktop. If `t('search.label')` is not a defined key, replace with `t('nav.menu')`-style key or a literal; verify against `SearchField.vue`'s own aria handling and adjust to avoid a missing-key warning.

- [ ] **Step 5: Run it green**

Run: `npx vitest run src/components/AppBar.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/AppBar.vue src/frontend/src/components/AppBar.spec.ts
git commit -m "feat(appbar): slim mobile menu header"
```

---

## Task 13: Full verification + mobile QA

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend suite**

Run: `npx vitest run`
Expected: all test files pass. Fix any regression before proceeding.

- [ ] **Step 2: Type-check + build**

Run: `npm run build`
Expected: `vue-tsc` clean, Vite build succeeds.

- [ ] **Step 3: Backend suite (unaffected, sanity)**

Run (repo root): `dotnet test`
Expected: all pass.

- [ ] **Step 4: Manual mobile QA with gstack**

Start the API (`dotnet run --project src/backend/FamilyTree.Api`) and the dev server (`npm run dev`), then use the **gstack** skill (`/gstack-qa` or `/run`) at a mobile viewport (e.g. 390×844) to dogfood:
  - Desktop: open two people → second expands, first becomes a bar; minimize/expand; ⤢ opens the bigger-view modal; close returns to the rail; stats pinned + scrolls behind a long biography.
  - Mobile: chips on the right edge; `‹` expands all to rectangles; tap a chip → that person expands; `›` collapses to chips; stats fixed at top; AppBar ☰ sheet shows views/language/layout, ⌕ reveals search; no controls off-screen.
Fix any visual issues found; apply the **frontend-design** skill for heraldic polish on the new chrome (gilt borders, parchment, Cinzel titles).

- [ ] **Step 5: Final commit (if QA produced fixes)**

```bash
git add -A
git commit -m "fix: mobile QA polish for the panel rail"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** stats-as-pinned-panel (Task 8), person docked panels + single-expanded (Tasks 4, 9), bigger-view modal (Tasks 6, 11), mobile chips + ←/→ arrow + tap-to-expand + tree-select→state-3 (Tasks 4, 10, 11), full-width rectangle cap at `--rail-width` (Task 10), mobile menu header (Task 12), `$bp-rail`/`--rail-width` tokens (Task 1), i18n keys (Task 2), shared `PersonDetail` (Task 5). All spec sections map to a task.
- **Type consistency:** `panelStore` API (`openPerson`, `expandPerson`, `minimizePerson`, `closePerson`, `minimizeAllPersons`, `setStatsMinimized`/`toggleStats`, `expandRail`, `collapseRail`, `openBiggerView`, `closeBiggerView`, getters `expandedId`/`isOpen`/`hasPersonPanels`, state `personPanels`/`statsMinimized`/`railMode`/`biggerViewId`) is used identically across Tasks 8–11. `DockPanel` props/events (`icon`,`title`,`state`,`chipGlyph`,`closable`,`biggerable`,`pinned`; `expand`/`minimize`/`close`/`bigger`/`chipTap`) match between Tasks 7–10.
- **Open follow-ups noted for execution:** Task 11 Step 1 and Task 12 Step 1 require reading the existing specs to reuse their mount/router scaffolding rather than inventing new ones; the `search.label` i18n key in Task 12 must be verified against `SearchField.vue`.
