# ’80s Film Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a switchable, whole-app "1980s film" theme — period-accurate photo-card medallions (cabinet < 1900 / silver-gelatin 1900–1944 / colour film 1945+) on a muted #5C5C5C studio canvas, toggled from the app bar — coexisting with the unchanged classic sepia theme.

**Architecture:** The theme is a `data-theme="eighties"` attribute on `<html>` driven by a new `theme` field in the Pinia `uiStore` (localStorage-persisted, mirroring `orientation`). A scoped SCSS block (`:root[data-theme='eighties']`) overrides the existing CSS-variable tokens, so all chrome re-skins for free. Medallions render as SVG inside the oak; under the ’80s theme `PersonMedallion` delegates to a new `EightiesMedallion` that picks one of three SVG card components by birth year. The SVG film frame was proven in a POC (`.superpowers/brainstorm/SAVED/`): `<mask>` sprocket holes, `feTurbulence` grain, `feDropShadow`, CSS-`filter` grade.

**Tech Stack:** Vue 3 (`<script setup>`), TypeScript, Pinia, vue-i18n, SCSS design tokens, Vitest + @vue/test-utils. Spec: `docs/superpowers/specs/2026-06-16-eighties-film-theme-design.md`.

**Delivery:** Two PRs. **Milestone A (Tasks 1–6)** ships the switchable theme + chrome reskin (medallions still classic-looking but on the grey canvas). **Milestone B (Tasks 7–18)** ships the epoch medallions. Each milestone is independently shippable and testable. Couple-pairing is a later fast-follow, **not in this plan**.

---

## File Structure

**Milestone A — theme infrastructure & chrome**
- `src/frontend/src/stores/uiStore.ts` (modify) — `theme` state + `THEME_STORAGE_KEY` + `setTheme`/`toggleTheme` + `init()` read.
- `src/frontend/src/stores/uiStore.spec.ts` (modify) — theme tests.
- `src/frontend/src/styles/applyTheme.ts` (create) — `applyThemeToRoot(theme)` writes the `<html data-theme>` attribute.
- `src/frontend/src/styles/applyTheme.spec.ts` (create).
- `src/frontend/src/styles/themes/eighties.scss` (create) — the `[data-theme='eighties']` token-override block + new tokens.
- `src/frontend/src/styles/global.scss` (modify) — import the theme block.
- `src/frontend/src/App.vue` (modify) — apply the attribute from the store on mount + on change.
- `src/frontend/src/components/ThemeToggle.vue` (create) — app-bar switch.
- `src/frontend/src/components/ThemeToggle.spec.ts` (create).
- `src/frontend/src/components/AppBar.vue` (modify) — mount `ThemeToggle` (desktop row + mobile sheet).
- `src/frontend/src/i18n/messages/{en,ru,be}.ts` (modify) — `theme.*` strings.

**Milestone B — epoch medallions (all under `src/frontend/src/components/medallion/`)**
- `era.ts` + `era.spec.ts` (create) — `cardEra(birthYear)`.
- `eighties/abrasion.ts` + `eighties/abrasion.spec.ts` (create) — seeded wear marks.
- `eighties/cardGeom.ts` + `eighties/cardGeom.spec.ts` (create) — card sizes per role.
- `eighties/EightiesDefs.vue` (create) — shared SVG `<defs>` (sprocket mask, grain, shadow, glow).
- `eighties/FilmFrame.vue` + `.spec.ts` (create).
- `eighties/CabinetCard.vue` + `.spec.ts` (create).
- `eighties/GelatinPrint.vue` + `.spec.ts` (create).
- `eighties/EightiesMedallion.vue` + `.spec.ts` (create) — dispatcher by era.
- `src/frontend/src/components/PersonMedallion.vue` (modify) — branch on theme.
- `src/frontend/src/components/OakTree.vue` (modify) — render `<EightiesDefs/>` in `<defs>`.
- `docs/reference/` + root `README.md`/`CLAUDE.md` (modify) — document the two themes.

**Commands** (run from `src/frontend`): test `npm test -- <file>`, type-check + build `npm run build`.

---

# MILESTONE A — Theme infrastructure & chrome

## Task 1: Theme state in `uiStore`

**Files:**
- Modify: `src/frontend/src/stores/uiStore.ts`
- Test: `src/frontend/src/stores/uiStore.spec.ts`

- [ ] **Step 1: Write the failing tests** — append inside the `describe('uiStore', …)` block in `uiStore.spec.ts`:

```ts
  it('defaults to the classic theme', () => {
    const ui = useUiStore();
    expect(ui.theme).toBe('classic');
  });

  it('toggleTheme flips between classic and eighties', () => {
    const ui = useUiStore();
    ui.toggleTheme();
    expect(ui.theme).toBe('eighties');
    ui.toggleTheme();
    expect(ui.theme).toBe('classic');
  });

  it('setTheme persists to localStorage', () => {
    const ui = useUiStore();
    ui.setTheme('eighties');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('eighties');
  });

  it('init() restores a persisted theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'eighties');
    const ui = useUiStore();
    ui.init();
    expect(ui.theme).toBe('eighties');
  });

  it('init() ignores an invalid persisted theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'disco');
    const ui = useUiStore();
    ui.init();
    expect(ui.theme).toBe('classic');
  });
```

Add `THEME_STORAGE_KEY` to the import at the top of the spec:

```ts
import { useUiStore, ORIENTATION_STORAGE_KEY, THEME_STORAGE_KEY } from './uiStore';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- uiStore`
Expected: FAIL — `THEME_STORAGE_KEY` undefined / `ui.theme` undefined.

- [ ] **Step 3: Implement the store changes** in `uiStore.ts`.

Add near the top, after the existing types:

```ts
export type Theme = 'classic' | 'eighties';

export const THEME_STORAGE_KEY = 'familytree.theme';

function isTheme(value: string | null): value is Theme {
  return value === 'classic' || value === 'eighties';
}
```

Add `theme` to the `UiState` interface and its initial state:

```ts
interface UiState {
  orientation: Orientation;
  orientationExplicit: boolean;
  search: string;
  searchCursor: number;
  theme: Theme;
}
```
```ts
  state: (): UiState => ({
    orientation: 'vertical',
    orientationExplicit: false,
    search: '',
    searchCursor: 0,
    theme: 'classic'
  }),
```

Add the actions (inside `actions`):

```ts
    setTheme(theme: Theme): void {
      this.theme = theme;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // storage unavailable (private mode / SSR) — non-fatal
      }
    },
    toggleTheme(): void {
      this.setTheme(this.theme === 'classic' ? 'eighties' : 'classic');
    },
```

Extend the existing `init()` to also read the theme — add before its closing brace:

```ts
      let storedTheme: string | null = null;
      try {
        storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      } catch {
        storedTheme = null;
      }
      if (isTheme(storedTheme)) {
        this.theme = storedTheme;
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- uiStore`
Expected: PASS (all, including the existing orientation tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/stores/uiStore.ts src/frontend/src/stores/uiStore.spec.ts
git commit -m "feat(theme): add theme state to uiStore"
```

---

## Task 2: Apply the `data-theme` attribute to `<html>`

**Files:**
- Create: `src/frontend/src/styles/applyTheme.ts`
- Test: `src/frontend/src/styles/applyTheme.spec.ts`

- [ ] **Step 1: Write the failing test** — `applyTheme.spec.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { applyThemeToRoot } from './applyTheme';

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('applyThemeToRoot', () => {
  it('sets data-theme to eighties', () => {
    applyThemeToRoot('eighties');
    expect(document.documentElement.dataset.theme).toBe('eighties');
  });

  it('removes the attribute for the classic theme (so :root defaults apply)', () => {
    applyThemeToRoot('eighties');
    applyThemeToRoot('classic');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- applyTheme`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `applyTheme.ts` (mirrors the `motion/tokens.ts` "apply to root" pattern):

```ts
import type { Theme } from '../stores/uiStore';

/** Reflects the active theme onto <html data-theme>. The classic theme removes
 *  the attribute entirely so the bare :root token defaults apply. */
export function applyThemeToRoot(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'classic') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- applyTheme`
Expected: PASS.

- [ ] **Step 5: Wire it into `App.vue`.** Replace the `<script setup>` block of `src/frontend/src/App.vue` with:

```ts
import { onMounted, watch } from 'vue';
import AppBar from './components/AppBar.vue';
import AppFrame from './components/AppFrame.vue';
import AppVersion from './components/AppVersion.vue';
import { useUiStore } from './stores/uiStore';
import { applyThemeToRoot } from './styles/applyTheme';

const ui = useUiStore();
onMounted(() => ui.init());
watch(() => ui.theme, applyThemeToRoot, { immediate: true });
```

- [ ] **Step 6: Verify the build type-checks**

Run: `npm run build`
Expected: build completes (vue-tsc clean).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/styles/applyTheme.ts src/frontend/src/styles/applyTheme.spec.ts src/frontend/src/App.vue
git commit -m "feat(theme): reflect active theme onto html data-theme"
```

---

## Task 3: The `[data-theme='eighties']` token block

**Files:**
- Create: `src/frontend/src/styles/themes/eighties.scss`
- Modify: `src/frontend/src/styles/global.scss`

> CSS isn't unit-tested here; this task is verified by build + live preview in Task 6.

- [ ] **Step 1: Create** `src/frontend/src/styles/themes/eighties.scss`:

```scss
// ’80s film theme — muted, dark-grey, monochrome. Overrides the canonical
// :root tokens from tokens.scss (see the design spec §4.2). No neon.
:root[data-theme='eighties'] {
  // new theme-only tokens
  --canvas: #5c5c5c;       // studio-grey tree surface
  --celluloid: #0d0e10;    // dark film body / mount
  --signal: #e6e8ea;       // neutral selection / search accent
  --font-mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;

  // re-skin the canonical tokens the chrome already consumes
  --paper: #5c5c5c;
  --paper-2: #4a4a52;
  --panel: #1b1c1f;
  --panel-edge: #4a4f55;
  --ink: #ededea;
  --ink-soft: #d7dade;
  --ink-faint: #9aa0a6;
  --bark: #4a4f55;
  --bark-dark: #2c2f33;
  --gilt: #8b9197;
  --gilt-light: #c7cbd0;
  --gilt-deep: #aeb4b9;
  --leaf: #8b9197;
  --leaf-deep: #6b7177;
  --leaf-bright: #aeb4b9;
  --umber: #8b9197;
  --match-paper: #2c2f33;
  --shadow: rgba(0, 0, 0, 0.5);

  // control surfaces
  --control-grad-top: #26282c;
  --control-grad-bottom: #1f2125;
  --control-hover: #2c2f33;
  --on-accent: #10121a;

  // legacy aliases
  --parchment: #5c5c5c;
  --parchment-2: #4a4a52;
  --gilt-sheen: #c7cbd0;

  // glass popup → dark graphite glass
  --glass-bg: rgba(20, 22, 25, 0.86);
  --glass-border: rgba(220, 225, 230, 0.22);
  --glass-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  --scrim: rgba(0, 0, 0, 0.55);
}

// the body gradient in global.scss is hard-coded warm; flatten it to the canvas.
:root[data-theme='eighties'] body {
  background: #5c5c5c;
}
```

- [ ] **Step 2: Import the block** — add to `src/frontend/src/styles/global.scss` immediately after the existing `@use './tokens';` line:

```scss
@use './themes/eighties.scss';
```

- [ ] **Step 3: Verify the build compiles the SCSS**

Run: `npm run build`
Expected: build completes; no SCSS errors.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/styles/themes/eighties.scss src/frontend/src/styles/global.scss
git commit -m "feat(theme): add eighties token override stylesheet"
```

---

## Task 4: `theme.*` i18n strings

**Files:**
- Modify: `src/frontend/src/i18n/messages/en.ts`, `ru.ts`, `be.ts`

- [ ] **Step 1: Add the `theme` block to each messages file**, immediately after the `orientation: {...}` entry.

`en.ts`:
```ts
  theme: { label: 'Theme', classic: 'Classic', eighties: 'Film' },
```
`ru.ts`:
```ts
  theme: { label: 'Тема', classic: 'Классическая', eighties: 'Плёнка' },
```
`be.ts`:
```ts
  theme: { label: 'Тэма', classic: 'Класічная', eighties: 'Плёнка' },
```

- [ ] **Step 2: Verify the messages parity test still passes** (the repo has `i18n/messages/messages.spec.ts` checking key parity across locales).

Run: `npm test -- messages`
Expected: PASS (all three locales now share the `theme.*` keys).

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/i18n/messages/en.ts src/frontend/src/i18n/messages/ru.ts src/frontend/src/i18n/messages/be.ts
git commit -m "feat(theme): add theme toggle i18n strings"
```

---

## Task 5: `ThemeToggle` component

**Files:**
- Create: `src/frontend/src/components/ThemeToggle.vue`
- Test: `src/frontend/src/components/ThemeToggle.spec.ts`

- [ ] **Step 1: Write the failing test** — `ThemeToggle.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import ThemeToggle from './ThemeToggle.vue';
import { useUiStore } from '../stores/uiStore';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { theme: { label: 'Theme', classic: 'Classic', eighties: 'Film' } } }
});

function mountToggle() {
  return mount(ThemeToggle, { global: { plugins: [i18n] } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('ThemeToggle', () => {
  it('marks the classic button as pressed by default', () => {
    const wrapper = mountToggle();
    expect(wrapper.find('[data-test="theme-classic"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-test="theme-eighties"]').attributes('aria-pressed')).toBe('false');
  });

  it('switches the store theme to eighties on click', async () => {
    const ui = useUiStore();
    const wrapper = mountToggle();
    await wrapper.find('[data-test="theme-eighties"]').trigger('click');
    expect(ui.theme).toBe('eighties');
    expect(wrapper.find('[data-test="theme-eighties"]').attributes('aria-pressed')).toBe('true');
  });

  it('switches back to classic on click', async () => {
    const ui = useUiStore();
    ui.setTheme('eighties');
    const wrapper = mountToggle();
    await wrapper.find('[data-test="theme-classic"]').trigger('click');
    expect(ui.theme).toBe('classic');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ThemeToggle`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement** `ThemeToggle.vue` (mirrors `OrientationToggle.vue`):

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useUiStore, type Theme } from '../stores/uiStore';

const ui = useUiStore();
const { t } = useI18n({ useScope: 'global' });

function set(theme: Theme): void {
  ui.setTheme(theme);
}
</script>

<template>
  <div class="theme-toggle" role="group" :aria-label="t('theme.label')" data-test="theme-toggle">
    <button
      type="button"
      class="theme-toggle__btn"
      :class="{ 'theme-toggle__btn--on': ui.theme === 'classic' }"
      :aria-pressed="ui.theme === 'classic'"
      data-test="theme-classic"
      @click="set('classic')"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>
      <span>{{ t('theme.classic') }}</span>
    </button>
    <button
      type="button"
      class="theme-toggle__btn"
      :class="{ 'theme-toggle__btn--on': ui.theme === 'eighties' }"
      :aria-pressed="ui.theme === 'eighties'"
      data-test="theme-eighties"
      @click="set('eighties')"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><g stroke="currentColor" stroke-width="1.4" fill="none"><rect x="3" y="2" width="8" height="10" rx="1"/><line x1="3" y1="4.5" x2="11" y2="4.5"/><line x1="3" y1="9.5" x2="11" y2="9.5"/></g></svg>
      <span>{{ t('theme.eighties') }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.theme-toggle {
  display: inline-flex;
  border: 1px solid var(--panel-edge);
  border-radius: 8px;
  overflow: hidden;
  background: var(--control-grad-top);
  font-family: var(--font-display);
  font-size: 17px;

  &__btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 17px;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--ink-soft);
    cursor: pointer;
    &:hover:not(&--on) { background: var(--control-hover); }
    &--on { background: var(--bark); color: var(--on-accent); }
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: -2px; }
  }
}
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- ThemeToggle`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/ThemeToggle.vue src/frontend/src/components/ThemeToggle.spec.ts
git commit -m "feat(theme): add ThemeToggle component"
```

---

## Task 5b: Migrate hard-coded chrome colours to tokens

> Added during execution: the Task 3 review found chrome components that hard-code
> warm hex values the token override can't reach (most critically the tree canvas).
> Without this, the ’80s theme leaks the classic palette. Each migration must keep
> the **classic** theme pixel-identical (define the token with the current value),
> then add the dark override to `eighties.scss`.

**Files:**
- Modify: `src/frontend/src/styles/tokens.scss` (add tokens with current warm values)
- Modify: `src/frontend/src/styles/themes/eighties.scss` (override them dark)
- Modify: `src/frontend/src/components/AppBar.vue`, `DockPanel.vue`, `SearchField.vue`,
  `LanguagePicker.vue`, `OrientationToggle.vue`, `TimeRail.vue`, `TreeView.vue`,
  `ChronicleView.vue`

- [ ] **Step 1: Add the new tokens to `tokens.scss`** inside the `:root { … }` block, using the EXACT current values so classic is unchanged:

```scss
  // raised card/control surfaces (migrated from hard-coded component values)
  --surface-card: linear-gradient(#f8f2df, #f1e7cb);
  --field-bg: #fffdf5;
  --title-shadow: #fff7e2;
  --rail-grad-bottom: #f2e9cf;
  // tree canvas behind the oak
  --canvas-bg: radial-gradient(120% 120% at 50% 0%, #fbf5e3 0%, #f1e8cf 60%, #e9ddbf 100%);
```

> Read `TreeView.vue` first and copy its **actual** current canvas gradient verbatim into `--canvas-bg` (the value above is indicative — match what's really there so classic is unchanged).

- [ ] **Step 2: Replace the hard-coded values in components with the tokens.** For each, read the file and swap the literal for the `var(--…)`:
  - `AppBar.vue` — the `.app-bar__sheet` `background: linear-gradient(#f8f2df, #f1e7cb)` → `var(--surface-card)`; the `.app-bar__title` `text-shadow: 0 1px 0 #fff7e2` → `0 1px 0 var(--title-shadow)`.
  - `DockPanel.vue` — both `linear-gradient(#f8f2df, #f1e7cb)` → `var(--surface-card)`.
  - `ChronicleView.vue` — `linear-gradient(#f8f2df, #f1e7cb)` → `var(--surface-card)`.
  - `TreeView.vue` — the replay-button `linear-gradient(#f8f2df, #f1e7cb)` → `var(--surface-card)`; the tree-canvas `radial-gradient(...)` → `var(--canvas-bg)`.
  - `SearchField.vue`, `LanguagePicker.vue`, `OrientationToggle.vue` — `background: #fffdf5` → `var(--field-bg)`.
  - `TimeRail.vue` — `linear-gradient(var(--panel), #f2e9cf)` → `linear-gradient(var(--panel), var(--rail-grad-bottom))` (both occurrences).

- [ ] **Step 3: Add the dark overrides to `eighties.scss`** inside the `:root[data-theme='eighties']` block:

```scss
  --surface-card: linear-gradient(#26282c, #1f2125);
  --field-bg: #26282c;
  --title-shadow: rgba(0, 0, 0, 0.4);
  --rail-grad-bottom: #2c2f33;
  --canvas-bg: #5c5c5c;
```

- [ ] **Step 4: Verify classic is unchanged + build.** Run `npm run build` (clean). Then run the app (or visually diff) under the **classic** theme — it must look identical to before (the token values equal the old literals).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/styles/tokens.scss src/frontend/src/styles/themes/eighties.scss src/frontend/src/components/AppBar.vue src/frontend/src/components/DockPanel.vue src/frontend/src/components/SearchField.vue src/frontend/src/components/LanguagePicker.vue src/frontend/src/components/OrientationToggle.vue src/frontend/src/components/TimeRail.vue src/frontend/src/views/TreeView.vue src/frontend/src/views/ChronicleView.vue
git commit -m "refactor(theme): move hard-coded chrome colours to tokens"
```

---

## Task 6: Mount `ThemeToggle` in the app bar + visual verify

**Files:**
- Modify: `src/frontend/src/components/AppBar.vue`
- Test: `src/frontend/src/components/AppBar.spec.ts`

- [ ] **Step 1: Add the failing assertion** to `AppBar.spec.ts` — inside its `describe`, add (the existing file already mounts `AppBar` with i18n/pinia; reuse its `mount` helper — if it mounts per-test, copy that setup):

```ts
  it('renders the theme toggle on desktop', () => {
    const wrapper = mountAppBar(); // use the file's existing mount helper / inline mount
    expect(wrapper.find('[data-test="theme-toggle"]').exists()).toBe(true);
  });
```

> If `AppBar.spec.ts` stubs child components, add `ThemeToggle` to the stub allow-list or assert on the stubbed tag `theme-toggle-stub`. Match the existing file's convention.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- AppBar`
Expected: FAIL — toggle not found.

- [ ] **Step 3: Implement.** In `AppBar.vue`:

Add the import alongside the others:
```ts
import ThemeToggle from './ThemeToggle.vue';
```

Add to the desktop row, after `<OrientationToggle />`:
```vue
      <ThemeToggle />
```

Add to the mobile sheet, after the layout group:
```vue
          <div class="app-bar__group">
            <span class="app-bar__label">{{ t('theme.label') }}</span>
            <ThemeToggle />
          </div>
```

Add the desktop "never shrink" rule near the other `--desktop` rules in the `<style>`:
```scss
.app-bar__row--desktop :deep(.theme-toggle) { flex: 0 0 auto; }
```

- [ ] **Step 4: Run the AppBar tests**

Run: `npm test -- AppBar`
Expected: PASS.

- [ ] **Step 5: Full suite + build**

Run: `npm test` then `npm run build`
Expected: all green.

- [ ] **Step 6: Visual verification (REQUIRED).** Start the app (see the `run-app` skill / custom ports), open the preview, and:
  - Confirm the app bar shows the Classic/Film toggle.
  - Click **Film** → the whole chrome (bars, panels, search, popup, axis, canvas behind the oak) re-skins to the dark-grey palette and the canvas reads #5C5C5C.
  - Reload → the theme persists (localStorage).
  - Click **Classic** → reverts exactly to the original look.
  - Capture a screenshot of each theme for the PR.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/AppBar.vue src/frontend/src/components/AppBar.spec.ts
git commit -m "feat(theme): add theme toggle to the app bar"
```

> **Milestone A is shippable here.** Open PR 1 ("Add a switchable ’80s theme with a grey studio canvas"); run the `update-docs-for-pr` skill (Task 18 covers the doc content if you prefer to land docs with PR 2 instead — but PR 1 already has observable behaviour, so document the toggle now).

---

# MILESTONE B — Epoch medallions

## Task 7: Era classifier

**Files:**
- Create: `src/frontend/src/components/medallion/era.ts`
- Test: `src/frontend/src/components/medallion/era.spec.ts`

- [ ] **Step 1: Write the failing test** — `era.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cardEra } from './era';

describe('cardEra', () => {
  it('classifies pre-1900 births as cabinet', () => {
    expect(cardEra(1899)).toBe('cabinet');
    expect(cardEra(1820)).toBe('cabinet');
  });
  it('classifies 1900–1944 births as gelatin', () => {
    expect(cardEra(1900)).toBe('gelatin');
    expect(cardEra(1944)).toBe('gelatin');
  });
  it('classifies 1945+ births as film', () => {
    expect(cardEra(1945)).toBe('film');
    expect(cardEra(2010)).toBe('film');
  });
  it('falls back to film for an unknown birth year', () => {
    expect(cardEra(null)).toBe('film');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- era`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `era.ts`:

```ts
export type CardEra = 'cabinet' | 'gelatin' | 'film';

/** Picks the period-accurate photo medium for a person by birth year.
 *  Hard cutoffs (spec §5.2): <1900 cabinet · 1900–1944 gelatin · 1945+ film.
 *  Unknown birth year → film (the modern default). */
export function cardEra(birthYear: number | null): CardEra {
  if (birthYear == null) return 'film';
  if (birthYear < 1900) return 'cabinet';
  if (birthYear < 1945) return 'gelatin';
  return 'film';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- era`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/medallion/era.ts src/frontend/src/components/medallion/era.spec.ts
git commit -m "feat(theme): add era classifier for epoch medallions"
```

---

## Task 8: Seeded abrasion marks

**Files:**
- Create: `src/frontend/src/components/medallion/eighties/abrasion.ts`
- Test: `src/frontend/src/components/medallion/eighties/abrasion.spec.ts`

- [ ] **Step 1: Write the failing test** — `abrasion.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { abrasionFor } from './abrasion';

describe('abrasionFor', () => {
  it('is deterministic for a given id', () => {
    expect(abrasionFor('p-42')).toEqual(abrasionFor('p-42'));
  });
  it('differs across ids', () => {
    expect(abrasionFor('p-1')).not.toEqual(abrasionFor('p-2'));
  });
  it('returns a scratch x in [0,1] and 2–3 dust specks in range', () => {
    const a = abrasionFor('p-7');
    expect(a.scratchX).toBeGreaterThanOrEqual(0);
    expect(a.scratchX).toBeLessThanOrEqual(1);
    expect(a.dust.length).toBeGreaterThanOrEqual(2);
    expect(a.dust.length).toBeLessThanOrEqual(3);
    for (const d of a.dust) {
      expect(d.x).toBeGreaterThanOrEqual(0); expect(d.x).toBeLessThanOrEqual(1);
      expect(d.y).toBeGreaterThanOrEqual(0); expect(d.y).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- abrasion`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `abrasion.ts`:

```ts
export interface DustSpeck { x: number; y: number; dark: boolean }
export interface Abrasion { scratchX: number; dust: DustSpeck[] }

/** Tiny deterministic string hash → 32-bit seed. */
function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — deterministic, fast, good enough for cosmetic placement. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable, light wear marks for a person — one scratch + 2–3 dust specks, as
 *  fractions of the image box (0..1). Seeded from the id so it never changes. */
export function abrasionFor(id: string): Abrasion {
  const rand = mulberry32(hashSeed(id));
  const scratchX = 0.2 + rand() * 0.6;
  const count = 2 + Math.floor(rand() * 2); // 2 or 3
  const dust: DustSpeck[] = [];
  for (let i = 0; i < count; i++) {
    dust.push({ x: rand(), y: rand(), dark: rand() > 0.5 });
  }
  return { scratchX, dust };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- abrasion`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/medallion/eighties/abrasion.ts src/frontend/src/components/medallion/eighties/abrasion.spec.ts
git commit -m "feat(theme): add seeded film abrasion"
```

---

## Task 9: Card geometry

**Files:**
- Create: `src/frontend/src/components/medallion/eighties/cardGeom.ts`
- Test: `src/frontend/src/components/medallion/eighties/cardGeom.spec.ts`

Centres every era's card on the node origin `(0,0)` so it drops into the existing
layout exactly where the classic cameo sat, using the same per-role widths.

- [ ] **Step 1: Write the failing test** — `cardGeom.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cardGeom } from './cardGeom';

describe('cardGeom', () => {
  it('uses a wider card for the trunk than a leaf', () => {
    expect(cardGeom('trunk').w).toBeGreaterThan(cardGeom('leaf').w);
  });
  it('centres the image box horizontally on the origin', () => {
    const g = cardGeom('branch');
    expect(g.imgX).toBeCloseTo(-g.imgW / 2);
  });
  it('places the name above and the years below the image box', () => {
    const g = cardGeom('branch');
    expect(g.nameY).toBeLessThan(g.imgY);
    expect(g.yearsY).toBeGreaterThan(g.imgY + g.imgH);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- cardGeom`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `cardGeom.ts`:

```ts
import type { NodeRole } from '../../../layout/treeLayout';

export interface CardGeom {
  role: NodeRole;
  w: number;        // overall card width
  imgX: number; imgY: number; imgW: number; imgH: number; // portrait box (origin-centred)
  perfW: number;    // sprocket strip width (film era)
  nameY: number;    // baseline for the name (above)
  yearsY: number;   // baseline for the years chip (below)
  nameMax: number;  // usable one-line name width
  yearsSize: number;
}

// Match the classic medallion widths so layout spacing is unchanged.
const W_BY_ROLE: Record<NodeRole, number> = { trunk: 200, branch: 186, root: 186, leaf: 158 };
const IMG_RATIO = 1.32; // portrait h/w — vertical frame

export function cardGeom(role: NodeRole): CardGeom {
  const w = W_BY_ROLE[role];
  const perfW = Math.round(w * 0.085);
  const imgW = w - perfW * 2 - Math.round(w * 0.12); // leave room for perf + edge strips
  const imgH = imgW * IMG_RATIO;
  const imgX = -imgW / 2;
  const imgY = -imgH / 2;
  return {
    role, w, perfW,
    imgX, imgY, imgW, imgH,
    nameY: imgY - 10,
    yearsY: imgY + imgH + 18,
    nameMax: 0.82 * w,
    yearsSize: 0.072 * w
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- cardGeom`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/medallion/eighties/cardGeom.ts src/frontend/src/components/medallion/eighties/cardGeom.spec.ts
git commit -m "feat(theme): add eighties card geometry"
```

---

## Task 10: Shared SVG defs

**Files:**
- Create: `src/frontend/src/components/medallion/eighties/EightiesDefs.vue`

One instance lives in the oak `<defs>`; every film frame references these by id.
No behaviour to unit-test — verified when `FilmFrame` renders (Task 11) and live.

- [ ] **Step 1: Create** `EightiesDefs.vue`:

```vue
<script setup lang="ts"></script>

<template>
  <!-- shared ’80s film defs: grain, drop-shadow, selection glow. Sprocket holes
       are per-card (height varies by role) so they live in FilmFrame. -->
  <filter id="film-grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
    <feColorMatrix type="saturate" values="0" />
    <feComponentTransfer><feFuncA type="linear" slope="0.5" /></feComponentTransfer>
  </filter>
  <filter id="film-shadow" x="-40%" y="-40%" width="180%" height="180%">
    <feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#000" flood-opacity="0.5" />
  </filter>
  <filter id="film-glow" x="-40%" y="-40%" width="180%" height="180%">
    <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#e6e8ea" flood-opacity="0.9" />
  </filter>
</template>
```

- [ ] **Step 2: Render it in the oak.** In `src/frontend/src/components/OakTree.vue`, add the import:

```ts
import EightiesDefs from './medallion/eighties/EightiesDefs.vue';
```

…and inside the existing `<defs>…</defs>` (after the last gradient), add:

```vue
      <EightiesDefs />
```

(Harmless under the classic theme — unused defs don't render.)

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/components/medallion/eighties/EightiesDefs.vue src/frontend/src/components/OakTree.vue
git commit -m "feat(theme): add shared eighties SVG defs to the oak"
```

---

## Task 11: `FilmFrame` (1945+)

**Files:**
- Create: `src/frontend/src/components/medallion/eighties/FilmFrame.vue`
- Test: `src/frontend/src/components/medallion/eighties/FilmFrame.spec.ts`

Renders the validated POC frame in SVG, origin-centred, with the person's
portrait, name, years, edge text, seeded abrasion, and `filled`/selected states.

- [ ] **Step 1: Write the failing test** — `FilmFrame.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import FilmFrame from './FilmFrame.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import type { LayoutNode } from '../../../layout/treeLayout';
import type { PersonSummary } from '../../../types/family';

function person(o: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id: 'p1', givenName: { ru: 'Антон', be: null, en: 'Anton' }, surname: { ru: 'Карскі', be: null, en: 'Karski' },
    maidenName: null, sex: 'male', birthYear: 1952, deathYear: 2018, vocation: 'other',
    portrait: 'p-1.jpg', portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false, ...o
  };
}
function node(o: Partial<LayoutNode> = {}, p: Partial<PersonSummary> = {}): LayoutNode {
  const ps = person(p);
  return { id: ps.id, person: ps, x: 0, y: 0, year: ps.birthYear ?? 1950, role: 'branch', generation: 0, ...o };
}

beforeEach(() => {
  setActivePinia(createPinia());
  useLocaleStore().setLocale('en');
});

describe('FilmFrame', () => {
  it('renders the portrait, name and years', () => {
    const w = mount(FilmFrame, { props: { node: node() } });
    expect(w.find('[data-test="portrait"]').attributes('href')).toBe('/media/portraits/p-1.jpg');
    expect(w.find('[data-test="card-name"]').text()).toBe('Anton Karski');
    expect(w.find('[data-test="lifespan"]').text()).toBe('1952–2018');
  });
  it('punches sprocket holes (transparent) when not a match', () => {
    const w = mount(FilmFrame, { props: { node: node() } });
    expect(w.find('[data-test="perf-strips"]').attributes('mask')).toContain('film-sprockets');
  });
  it('fills the sprockets (perforated) for a search match', () => {
    const w = mount(FilmFrame, { props: { node: node(), match: true } });
    expect(w.find('[data-test="perf-strips"]').attributes('mask')).toBeUndefined();
    expect(w.find('[data-test="perf-fill"]').exists()).toBe(true);
  });
  it('shows the selection glow + bright edge when selected', () => {
    const w = mount(FilmFrame, { props: { node: node(), selected: true } });
    expect(w.find('[data-test="sel-edge"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- FilmFrame`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement** `FilmFrame.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutNode } from '../../../layout/treeLayout';
import { useLocaleStore } from '../../../stores/localeStore';
import { localize } from '../../../i18n/localize';
import { formatYearSpan } from '../../../format/lifespan';
import { mediaUrl } from '../../../media/mediaUrl';
import { nameFontSize } from '../nameFit';
import { cardGeom } from './cardGeom';
import { abrasionFor } from './abrasion';

const props = defineProps<{ node: LayoutNode; selected?: boolean; match?: boolean }>();
const localeStore = useLocaleStore();

const g = computed(() => cardGeom(props.node.role));
const fullName = computed(() => {
  const given = localize(props.node.person.givenName, localeStore.currentLocale);
  const surname = localize(props.node.person.surname, localeStore.currentLocale);
  return [given, surname].filter(s => s).join(' ');
});
const lifespan = computed(() => formatYearSpan(props.node.person.birthYear, props.node.person.deathYear));
const portraitHref = computed(() =>
  props.node.person.portrait ? mediaUrl('portraits', props.node.person.portrait) : null
);
const nameSize = computed(() => nameFontSize(fullName.value, g.value.nameMax));
const wear = computed(() => abrasionFor(props.node.id));

// frame metrics derived from geometry (origin-centred)
const m = computed(() => {
  const gv = g.value;
  const bodyX = gv.imgX - gv.perfW - 6;          // left celluloid edge
  const bodyW = gv.imgW + (gv.perfW + 6) * 2;    // full frame width
  const top = gv.imgY - 6;
  const h = gv.imgH + 12;
  return { bodyX, bodyW, top, h, leftPerfX: bodyX, rightPerfX: bodyX + bodyW - gv.perfW };
});
// sprocket hole rows down a strip
const holeRows = computed(() => {
  const rows: number[] = [];
  const step = 16, r0 = m.value.top + 6;
  for (let y = r0; y < m.value.top + m.value.h - 8; y += step) rows.push(y);
  return rows;
});
const holeMaskId = computed(() => `film-sprockets-${props.node.id}`);
</script>

<template>
  <g class="film" :filter="selected ? 'url(#film-glow)' : 'url(#film-shadow)'">
    <!-- per-card sprocket mask (hole rows depend on card height) -->
    <defs>
      <mask :id="holeMaskId" maskUnits="userSpaceOnUse">
        <rect :x="m.bodyX" :y="m.top" :width="m.bodyW" :height="m.h" fill="#fff" />
        <g fill="#000">
          <template v-for="y in holeRows" :key="`l${y}`">
            <rect :x="m.leftPerfX + g.perfW * 0.25" :y="y" :width="g.perfW * 0.5" height="9" rx="3" />
            <rect :x="m.rightPerfX + g.perfW * 0.25" :y="y" :width="g.perfW * 0.5" height="9" rx="3" />
          </template>
        </g>
      </mask>
    </defs>

    <!-- dark celluloid body -->
    <rect :x="m.bodyX" :y="m.top" :width="m.bodyW" :height="m.h" fill="var(--celluloid)" />

    <!-- portrait (Kodachrome grade via CSS filter on the SVG image) -->
    <image
      v-if="portraitHref"
      data-test="portrait"
      :href="portraitHref"
      :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH"
      preserveAspectRatio="xMidYMid slice"
      class="film__img"
    />
    <text
      v-else class="film__initial" text-anchor="middle"
      :x="0" :y="g.imgY + g.imgH * 0.58" :style="{ fontSize: `${g.imgW * 0.5}px` }"
    >{{ fullName.charAt(0) }}</text>

    <!-- grain -->
    <rect :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH" filter="url(#film-grain)" class="film__grain" />

    <!-- seeded abrasion -->
    <line
      :x1="g.imgX + wear.scratchX * g.imgW" :y1="g.imgY"
      :x2="g.imgX + wear.scratchX * g.imgW" :y2="g.imgY + g.imgH"
      stroke="#fff" stroke-opacity="0.16"
    />
    <circle
      v-for="(d, i) in wear.dust" :key="i"
      :cx="g.imgX + d.x * g.imgW" :cy="g.imgY + d.y * g.imgH" r="1"
      :fill="d.dark ? '#000' : '#fff'" :opacity="d.dark ? 0.3 : 0.35"
    />

    <!-- sprocket strips: masked (transparent) by default; filled for a match -->
    <g v-if="!match" data-test="perf-strips" :mask="`url(#${holeMaskId})`">
      <rect :x="m.leftPerfX" :y="m.top" :width="g.perfW" :height="m.h" fill="var(--celluloid)" />
      <rect :x="m.rightPerfX" :y="m.top" :width="g.perfW" :height="m.h" fill="var(--celluloid)" />
    </g>
    <g v-else data-test="perf-strips">
      <rect :x="m.leftPerfX" :y="m.top" :width="g.perfW" :height="m.h" fill="var(--celluloid)" />
      <rect :x="m.rightPerfX" :y="m.top" :width="g.perfW" :height="m.h" fill="var(--celluloid)" />
      <g data-test="perf-fill" fill="#3a3d42">
        <template v-for="y in holeRows" :key="`f${y}`">
          <rect :x="m.leftPerfX + g.perfW * 0.25" :y="y" :width="g.perfW * 0.5" height="9" rx="3" />
          <rect :x="m.rightPerfX + g.perfW * 0.25" :y="y" :width="g.perfW * 0.5" height="9" rx="3" />
        </template>
      </g>
    </g>

    <!-- edge printing -->
    <text class="film__edge" :transform="`rotate(-90 ${m.leftPerfX + g.perfW + 4} 0)`" :x="m.leftPerfX + g.perfW + 4" y="0" text-anchor="middle">PHOTO 400NC</text>
    <text class="film__edge" :transform="`rotate(90 ${m.rightPerfX - 4} 0)`" :x="m.rightPerfX - 4" y="0" text-anchor="middle">GPX · 2</text>

    <!-- bright selection edge -->
    <rect
      v-if="selected" data-test="sel-edge"
      :x="m.bodyX + 1" :y="m.top + 1" :width="m.bodyW - 2" :height="m.h - 2" rx="2"
      fill="none" stroke="var(--signal)" stroke-width="2"
    />

    <!-- name (above) -->
    <text class="film__name" text-anchor="middle" :x="0" :y="g.nameY" :style="{ fontSize: `${nameSize}px` }">{{ fullName }}</text>
    <!-- years chip (below) -->
    <g v-if="lifespan">
      <rect :x="-26" :y="g.yearsY - 11" width="52" height="16" rx="2" fill="var(--bark-dark)" stroke="var(--panel-edge)" />
      <text class="film__years" data-test="lifespan" text-anchor="middle" :x="0" :y="g.yearsY" :style="{ fontSize: `${g.yearsSize}px` }">{{ lifespan }}</text>
    </g>
    <text class="film__nameval" v-show="false" data-test="card-name">{{ fullName }}</text>
  </g>
</template>

<style scoped lang="scss">
.film__img { filter: sepia(0.42) saturate(1.22) contrast(1.05) brightness(1.04) hue-rotate(-6deg); }
.film__grain { mix-blend-mode: overlay; opacity: 0.4; pointer-events: none; }
// running-film flicker on hover (the static seeded marks always show; this only
// animates the grain layer). Disabled for reduced-motion users.
.film:hover .film__grain { animation: film-flicker 0.5s steps(3) infinite; }
@keyframes film-flicker { 0% { opacity: 0.32; } 50% { opacity: 0.46; } 100% { opacity: 0.34; } }
@media (prefers-reduced-motion: reduce) { .film:hover .film__grain { animation: none; } }
.film__edge { font-family: var(--font-mono); font-weight: 700; font-size: 7px; letter-spacing: 1.5px; fill: #c9c4b4; opacity: 0.85; }
.film__name { font-family: var(--font-display); font-weight: 600; fill: var(--ink); }
.film__years { font-family: var(--font-mono); font-weight: 700; fill: var(--ink-soft); }
.film__initial { font-family: var(--font-display); fill: var(--gilt-light); opacity: 0.6; }
</style>
```

> The hidden `data-test="card-name"` element exists only so the test can read the
> resolved name without depending on `<text>` sizing; the visible name is `.film__name`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- FilmFrame`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/medallion/eighties/FilmFrame.vue src/frontend/src/components/medallion/eighties/FilmFrame.spec.ts
git commit -m "feat(theme): add SVG film-frame medallion"
```

---

## Task 12: `CabinetCard` (< 1900)

**Files:**
- Create: `src/frontend/src/components/medallion/eighties/CabinetCard.vue`
- Test: `src/frontend/src/components/medallion/eighties/CabinetCard.spec.ts`

- [ ] **Step 1: Write the failing test** — `CabinetCard.spec.ts` (same `person`/`node` helpers as Task 11, with `birthYear: 1861`):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import CabinetCard from './CabinetCard.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import type { LayoutNode } from '../../../layout/treeLayout';
import type { PersonSummary } from '../../../types/family';

function person(o: Partial<PersonSummary> = {}): PersonSummary {
  return { id: 'p1', givenName: { ru: 'Марыя', be: null, en: 'Maria' }, surname: { ru: 'Карская', be: null, en: 'Karskaya' },
    maidenName: null, sex: 'female', birthYear: 1861, deathYear: 1924, vocation: 'other',
    portrait: 'm-1.jpg', portraitVideo: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false, ...o };
}
function node(o: Partial<LayoutNode> = {}, p: Partial<PersonSummary> = {}): LayoutNode {
  const ps = person(p);
  return { id: ps.id, person: ps, x: 0, y: 0, year: 1861, role: 'branch', generation: 0, ...o };
}
beforeEach(() => { setActivePinia(createPinia()); useLocaleStore().setLocale('en'); });

describe('CabinetCard', () => {
  it('renders the sepia portrait, name and years', () => {
    const w = mount(CabinetCard, { props: { node: node() } });
    expect(w.find('[data-test="portrait"]').attributes('href')).toBe('/media/portraits/m-1.jpg');
    expect(w.find('[data-test="lifespan"]').text()).toBe('1861–1924');
  });
  it('shows the selection edge when selected', () => {
    const w = mount(CabinetCard, { props: { node: node(), selected: true } });
    expect(w.find('[data-test="sel-edge"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- CabinetCard`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement** `CabinetCard.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutNode } from '../../../layout/treeLayout';
import { useLocaleStore } from '../../../stores/localeStore';
import { localize } from '../../../i18n/localize';
import { formatYearSpan } from '../../../format/lifespan';
import { mediaUrl } from '../../../media/mediaUrl';
import { nameFontSize } from '../nameFit';
import { cardGeom } from './cardGeom';

const props = defineProps<{ node: LayoutNode; selected?: boolean; match?: boolean }>();
const localeStore = useLocaleStore();
const g = computed(() => cardGeom(props.node.role));
const fullName = computed(() => {
  const given = localize(props.node.person.givenName, localeStore.currentLocale);
  const surname = localize(props.node.person.surname, localeStore.currentLocale);
  return [given, surname].filter(s => s).join(' ');
});
const lifespan = computed(() => formatYearSpan(props.node.person.birthYear, props.node.person.deathYear));
const portraitHref = computed(() => props.node.person.portrait ? mediaUrl('portraits', props.node.person.portrait) : null);
const nameSize = computed(() => nameFontSize(fullName.value, g.value.nameMax));
// cream card around the portrait, origin-centred
const m = computed(() => {
  const gv = g.value;
  const pad = 8, footer = 14;
  return { x: gv.imgX - pad, y: gv.imgY - pad, w: gv.imgW + pad * 2, h: gv.imgH + pad * 2 + footer };
});
</script>

<template>
  <g class="cab" :filter="selected ? 'url(#film-glow)' : 'url(#film-shadow)'">
    <rect :x="m.x" :y="m.y" :width="m.w" :height="m.h" rx="2" class="cab__mount" />
    <image
      v-if="portraitHref" data-test="portrait" :href="portraitHref"
      :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH"
      preserveAspectRatio="xMidYMid slice" class="cab__img"
    />
    <text v-else class="cab__initial" text-anchor="middle" :x="0" :y="g.imgY + g.imgH * 0.58" :style="{ fontSize: `${g.imgW * 0.5}px` }">{{ fullName.charAt(0) }}</text>
    <rect :x="g.imgX" :y="g.imgY" :width="g.imgW" :height="g.imgH" fill="none" stroke="#cbb784" />
    <text class="cab__studio" text-anchor="middle" :x="0" :y="m.y + m.h - 4">Studio · Minsk</text>
    <rect v-if="selected" data-test="sel-edge" :x="m.x + 1" :y="m.y + 1" :width="m.w - 2" :height="m.h - 2" rx="2" fill="none" stroke="var(--signal)" stroke-width="2" />
    <text class="cab__name" text-anchor="middle" :x="0" :y="g.nameY" :style="{ fontSize: `${nameSize}px` }">{{ fullName }}</text>
    <g v-if="lifespan">
      <rect :x="-26" :y="g.yearsY - 11" width="52" height="16" rx="2" fill="var(--bark-dark)" stroke="var(--panel-edge)" />
      <text class="cab__years" data-test="lifespan" text-anchor="middle" :x="0" :y="g.yearsY" :style="{ fontSize: `${g.yearsSize}px` }">{{ lifespan }}</text>
    </g>
  </g>
</template>

<style scoped lang="scss">
.cab__mount { fill: #ece1c6; }
.cab__img { filter: sepia(0.72) saturate(0.95) contrast(1.03) brightness(1.03); }
.cab__studio { font-family: var(--font-display); font-style: italic; font-size: 7.5px; fill: #8a6a2e; }
.cab__name { font-family: var(--font-display); font-weight: 600; fill: var(--ink); }
.cab__years { font-family: var(--font-mono); font-weight: 700; fill: var(--ink-soft); }
.cab__initial { font-family: var(--font-display); fill: #8a6a2e; opacity: 0.6; }
</style>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- CabinetCard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/medallion/eighties/CabinetCard.vue src/frontend/src/components/medallion/eighties/CabinetCard.spec.ts
git commit -m "feat(theme): add cabinet-card medallion"
```

---

## Task 13: `GelatinPrint` (1900–1944)

**Files:**
- Create: `src/frontend/src/components/medallion/eighties/GelatinPrint.vue`
- Test: `src/frontend/src/components/medallion/eighties/GelatinPrint.spec.ts`

- [ ] **Step 1: Write the failing test** — `GelatinPrint.spec.ts` (same helpers, `birthYear: 1908`, assert portrait href, lifespan `1908–1979`, and `sel-edge` when selected — copy the two `it()` blocks from Task 12 but import `GelatinPrint` and use `givenName.en: 'Stefan'`, `portrait: 's-1.jpg'`).

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import GelatinPrint from './GelatinPrint.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import type { LayoutNode } from '../../../layout/treeLayout';
import type { PersonSummary } from '../../../types/family';

function person(o: Partial<PersonSummary> = {}): PersonSummary {
  return { id: 'p1', givenName: { ru: 'Стэфан', be: null, en: 'Stefan' }, surname: { ru: 'Карскі', be: null, en: 'Karski' },
    maidenName: null, sex: 'male', birthYear: 1908, deathYear: 1979, vocation: 'other',
    portrait: 's-1.jpg', portraitVideo: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false, ...o };
}
function node(o: Partial<LayoutNode> = {}, p: Partial<PersonSummary> = {}): LayoutNode {
  const ps = person(p);
  return { id: ps.id, person: ps, x: 0, y: 0, year: 1908, role: 'branch', generation: 0, ...o };
}
beforeEach(() => { setActivePinia(createPinia()); useLocaleStore().setLocale('en'); });

describe('GelatinPrint', () => {
  it('renders the B&W portrait, name and years', () => {
    const w = mount(GelatinPrint, { props: { node: node() } });
    expect(w.find('[data-test="portrait"]').attributes('href')).toBe('/media/portraits/s-1.jpg');
    expect(w.find('[data-test="lifespan"]').text()).toBe('1908–1979');
  });
  it('shows the selection edge when selected', () => {
    const w = mount(GelatinPrint, { props: { node: node(), selected: true } });
    expect(w.find('[data-test="sel-edge"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- GelatinPrint`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement** `GelatinPrint.vue` — identical structure to `CabinetCard.vue` (Task 12) with these differences: a white mount, a grayscale image, and no studio imprint. Copy `CabinetCard.vue` and change the template/styles as follows:

Template: drop the `<text class="cab__studio">` line; keep everything else, renaming the class prefix `cab` → `gel`. The footer space can shrink — set `footer = 6` in the `m` computed.

Styles:
```scss
.gel__mount { fill: #f4f2ec; }
.gel__img { filter: grayscale(1) contrast(1.08) brightness(1.03); }
.gel__name { font-family: var(--font-display); font-weight: 600; fill: var(--ink); }
.gel__years { font-family: var(--font-mono); font-weight: 700; fill: var(--ink-soft); }
.gel__initial { font-family: var(--font-display); fill: #6b7177; opacity: 0.6; }
```

(Full component mirrors Task 12; only the mount fill, image filter, removed imprint, and class prefix change.)

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- GelatinPrint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/medallion/eighties/GelatinPrint.vue src/frontend/src/components/medallion/eighties/GelatinPrint.spec.ts
git commit -m "feat(theme): add silver-gelatin medallion"
```

---

## Task 14: `EightiesMedallion` dispatcher

**Files:**
- Create: `src/frontend/src/components/medallion/eighties/EightiesMedallion.vue`
- Test: `src/frontend/src/components/medallion/eighties/EightiesMedallion.spec.ts`

- [ ] **Step 1: Write the failing test** — `EightiesMedallion.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import EightiesMedallion from './EightiesMedallion.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import type { LayoutNode } from '../../../layout/treeLayout';
import type { PersonSummary } from '../../../types/family';

function node(birthYear: number | null): LayoutNode {
  const p: PersonSummary = { id: 'p1', givenName: { ru: 'Имя', be: null, en: 'Name' }, surname: { ru: 'Фамилия', be: null, en: 'Sur' },
    maidenName: null, sex: 'male', birthYear, deathYear: null, vocation: 'other', portrait: null, portraitVideo: null,
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false };
  return { id: p.id, person: p, x: 0, y: 0, year: birthYear ?? 1900, role: 'branch', generation: 0 };
}
beforeEach(() => { setActivePinia(createPinia()); useLocaleStore().setLocale('en'); });

describe('EightiesMedallion', () => {
  it('renders a cabinet card for a pre-1900 birth', () => {
    expect(mount(EightiesMedallion, { props: { node: node(1880) } }).find('.cab').exists()).toBe(true);
  });
  it('renders a gelatin print for a 1900–1944 birth', () => {
    expect(mount(EightiesMedallion, { props: { node: node(1920) } }).find('.gel').exists()).toBe(true);
  });
  it('renders a film frame for a 1945+ birth', () => {
    expect(mount(EightiesMedallion, { props: { node: node(1970) } }).find('.film').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- EightiesMedallion`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement** `EightiesMedallion.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { LayoutNode } from '../../../layout/treeLayout';
import { cardEra } from '../era';
import CabinetCard from './CabinetCard.vue';
import GelatinPrint from './GelatinPrint.vue';
import FilmFrame from './FilmFrame.vue';

const props = defineProps<{ node: LayoutNode; selected?: boolean; match?: boolean }>();
const era = computed(() => cardEra(props.node.person.birthYear));
</script>

<template>
  <CabinetCard v-if="era === 'cabinet'" :node="node" :selected="selected" :match="match" />
  <GelatinPrint v-else-if="era === 'gelatin'" :node="node" :selected="selected" :match="match" />
  <FilmFrame v-else :node="node" :selected="selected" :match="match" />
</template>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- EightiesMedallion`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/medallion/eighties/EightiesMedallion.vue src/frontend/src/components/medallion/eighties/EightiesMedallion.spec.ts
git commit -m "feat(theme): add epoch medallion dispatcher"
```

---

## Task 15: Branch `PersonMedallion` on the active theme

**Files:**
- Modify: `src/frontend/src/components/PersonMedallion.vue`
- Test: `src/frontend/src/components/PersonMedallion.spec.ts`

- [ ] **Step 1: Add the failing tests** to `PersonMedallion.spec.ts`. Add `useUiStore` to imports and these cases inside the `describe`:

```ts
  it('renders the classic gilt frame under the classic theme', () => {
    const wrapper = mountNode(node());
    expect(wrapper.find('image.oak__frame').exists()).toBe(true);
    expect(wrapper.find('.film, .cab, .gel').exists()).toBe(false);
  });

  it('renders an epoch card under the eighties theme', async () => {
    const { useUiStore } = await import('../stores/uiStore');
    useUiStore().setTheme('eighties');
    const wrapper = mountNode(node({}, { birthYear: 1970 }));
    expect(wrapper.find('.film').exists()).toBe(true);
    expect(wrapper.find('image.oak__frame').exists()).toBe(false);
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test -- PersonMedallion`
Expected: FAIL — `.film` not found (still always classic).

- [ ] **Step 3: Implement the branch.** In `PersonMedallion.vue`:

Add to the script imports:
```ts
import { useUiStore } from '../stores/uiStore';
import EightiesMedallion from './medallion/eighties/EightiesMedallion.vue';
```
Add after the other store/computed setup:
```ts
const ui = useUiStore();
```

Wrap the template: put the existing classic markup behind a theme check and render the dispatcher otherwise. Change the root of `<template>` to:

```vue
<template>
  <EightiesMedallion
    v-if="ui.theme === 'eighties'"
    :node="node" :selected="selected" :match="match"
  />
  <g v-else class="oak__medallion-card">
    <!-- …the entire existing classic medallion markup, unchanged… -->
  </g>
</template>
```

(Keep every existing classic element inside the `v-else` `<g>`; only the wrapper changed.)

- [ ] **Step 4: Run to verify all PersonMedallion tests pass**

Run: `npm test -- PersonMedallion`
Expected: PASS (classic tests still green via the default classic theme; new eighties test green).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonMedallion.vue src/frontend/src/components/PersonMedallion.spec.ts
git commit -m "feat(theme): swap medallion rendering by active theme"
```

---

## Task 16: Full-suite + live verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole frontend suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 2: Type-check + build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Live verification (REQUIRED).** Run the app (`run-app` skill), switch to the Film theme, and confirm:
  - A person born before 1900 shows a **cabinet card**; 1900–1944 a **gelatin print**; 1945+ a **film frame**.
  - Sprocket holes on film frames are **transparent** (the #5C5C5C canvas shows through); selecting a node shows the bright `#e6e8ea` edge; a search match shows **filled** sprockets.
  - Pan/zoom keeps the cards crisp; names/years are legible (try a long ru/be name).
  - Switching back to Classic restores the gilt cameos.
  - Capture screenshots of all three eras + a selected + a search-match state for the PR.

- [ ] **Step 4: Performance sanity.** With the full tree visible in the Film theme, confirm pan/zoom stays smooth. If grain is heavy, reduce `feTurbulence` `numOctaves` to 1 in `EightiesDefs.vue` and re-verify.

---

## Task 17: Documentation (lands with the PR)

**Files:**
- Modify: `docs/reference/` (the relevant feature page + roadmap), root `README.md`, `CLAUDE.md` overview.

- [ ] **Step 1: Run the docs skill**

Invoke the `update-docs-for-pr` skill. Ensure it captures: the two-theme model + app-bar toggle, the epoch-media behaviour with the **1900 / 1945** cutoffs, the #5C5C5C canvas, transparent-vs-filled sprockets, and that couple-pairing is a planned fast-follow.

- [ ] **Step 2: Update the product overview** in `README.md` and the `CLAUDE.md` "Project overview" so the app is described as having a classic sepia theme **and** a switchable ’80s film theme.

- [ ] **Step 3: Commit**

```bash
git add docs/reference README.md CLAUDE.md
git commit -m "docs: document the ’80s film theme"
```

> **Milestone B is shippable here.** Open PR 2 ("Add epoch-accurate film-card medallions to the ’80s theme").

---

## Self-Review (completed during authoring)

- **Spec coverage:** theme model + toggle (Tasks 1–6) ✓; #5C5C5C canvas + token block (Task 3) ✓; epoch classifier with 1900/1945 cutoffs (Task 7) ✓; three SVG cards (Tasks 11–13) ✓; transparent default + filled interaction sprockets (Task 11) ✓; neutral `#e6e8ea` accent (Tasks 3, 11) ✓; seeded abrasion (Task 8) ✓; name-above/years-below + nameFit (Task 9, 11) ✓; whole-app reskin via tokens (Task 3) ✓; tests + live verify (Tasks 6, 16) ✓; docs (Task 17) ✓. Couple-pairing and per-epoch background morph are explicitly out of scope per spec.
- **Type consistency:** `Theme`, `THEME_STORAGE_KEY`, `CardEra`/`cardEra`, `Abrasion`/`abrasionFor`, `CardGeom`/`cardGeom` are defined before use; shared SVG ids (`film-grain`, `film-shadow`, `film-glow`) defined in Task 10 and referenced in Tasks 11–13; per-card mask id is unique per node.
- **Abrasion:** static seeded marks + the `:hover` running-film flicker both ship in Task 11 (`prefers-reduced-motion` respected), matching the owner's decision.
