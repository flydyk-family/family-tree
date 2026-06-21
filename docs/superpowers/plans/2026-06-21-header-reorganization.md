# Header Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crowded, wrapping desktop header with a stable single-tier layout — tabs left, a compacted centered masthead, and a tidy right cluster (search · Settings popover · account) — so nothing reflows across desktop widths.

**Architecture:** Restructure `AppBar.vue` into a 3-column CSS grid. Extract the set-and-forget display preferences (language / theme / orientation) into a reusable `SettingsPanel.vue`, hosted in a desktop popover (`SettingsMenu.vue`) and reused inline in the mobile sheet. Evolve `SignInControl.vue` so the signed-in state is an initials-avatar button opening an account menu, keeping its slot a fixed width.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), Pinia, vue-i18n, Vitest + @vue/test-utils, SCSS with design tokens (`src/styles/tokens.scss`).

## Global Constraints

- Frontend lives in `src/frontend`; run frontend commands from there. Tests: `npm test` (Vitest). Type-check/build: `npm run build`.
- Three locales kept at full key parity: `ru` (primary), `be`, `en` — `messages.spec.ts` enforces identical key paths across all three. Any new i18n key MUST be added to all three catalogs.
- Vue components use `<script setup lang="ts">`, scoped SCSS, and `@use '../styles/tokens.scss' as t;` where tokens are needed. Colors come from CSS variables (`var(--ink)`, `var(--bark)`, `var(--panel-edge)`, etc.), never hardcoded hex.
- Icons are inline SVG (the codebase pattern — see `OrientationToggle.vue`). Do NOT introduce an icon webfont.
- Preserve existing `data-test` attribute names where the element still exists; add new ones for new elements.
- Mobile vs desktop split is driven by `useMediaQuery(MOBILE_MEDIA_QUERY)` from `src/frontend/src/composables/useMediaQuery.ts`. In jsdom `matchMedia` is undefined → `useMediaQuery` returns `false` → `isMobile` is `false` (desktop) unless a test stubs `matchMedia`.
- Popover dismissal pattern follows `LanguagePicker.vue`: a `@focusout` handler that closes when `relatedTarget` is outside the root, plus `@keydown.esc`. Match that pattern; do not add document-level click listeners.
- Out of scope (do NOT implement): custom GIS button restyle, GIS locale sync, Google `picture` avatar. The signed-out state keeps the default Google GIS button unchanged.

---

## File Structure

- **Create** `src/frontend/src/components/SettingsPanel.vue` — inner, chrome-less content: three labelled groups (inline language list, `ThemeToggle`, `OrientationToggle`). Reused by both the desktop popover and the mobile sheet.
- **Create** `src/frontend/src/components/SettingsMenu.vue` — desktop popover: trigger button + floating panel wrapping `SettingsPanel`, with open/close/focusout/Esc.
- **Modify** `src/frontend/src/components/SignInControl.vue` — signed-in state becomes an initials-avatar button + account-menu popover (identity / Editor badge / Sign out). Signed-out GIS path unchanged.
- **Modify** `src/frontend/src/components/AppBar.vue` — desktop 3-column grid + compacted masthead + Settings/account slots; mobile sheet uses `SettingsPanel`; (Task 6) narrow-desktop search collapse.
- **Modify** `src/frontend/src/composables/useMediaQuery.ts` — add `NARROW_DESKTOP_MEDIA_QUERY` constant (Task 6).
- **Modify** `src/frontend/src/i18n/messages/{en,ru,be}.ts` — add `settings.label`.
- **Tests:** create `SettingsPanel.spec.ts`, `SettingsMenu.spec.ts`; update `SignInControl.spec.ts`, `AppBar.spec.ts`; `messages.spec.ts` updated assertion.
- **Docs:** `docs/reference/features/app-shell-and-localization.md` updated at PR time.

---

### Task 1: Add the `settings.label` i18n key

**Files:**
- Modify: `src/frontend/src/i18n/messages/en.ts:64` (the line after `theme:` — add a `settings` entry)
- Modify: `src/frontend/src/i18n/messages/ru.ts:64`
- Modify: `src/frontend/src/i18n/messages/be.ts:64`
- Test: `src/frontend/src/i18n/messages/messages.spec.ts`

**Interfaces:**
- Produces: i18n key `settings.label` available in all three catalogs (`t('settings.label')`).

- [ ] **Step 1: Add a failing assertion for the new key**

In `messages.spec.ts`, inside the `for (const catalog of [en, ru, be])` loop in the second test, add:

```ts
      expect(keys).toContain('settings.label');
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `src/frontend`): `npm test -- messages`
Expected: FAIL — `settings.label` not found in catalogs.

- [ ] **Step 3: Add the key to all three catalogs**

In `en.ts`, add after the `theme: { ... }` line:

```ts
  settings: { label: 'Settings' },
```

In `ru.ts`, add after the `theme: { ... }` line:

```ts
  settings: { label: 'Настройки' },
```

In `be.ts`, add after the `theme: { ... }` line:

```ts
  settings: { label: 'Налады' },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `src/frontend`): `npm test -- messages`
Expected: PASS — both the parity test and the key-presence test pass.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/i18n/messages
git commit -m "Add settings.label i18n key for the header settings popover"
```

---

### Task 2: `SettingsPanel.vue` — reusable display-preferences content

**Files:**
- Create: `src/frontend/src/components/SettingsPanel.vue`
- Test: `src/frontend/src/components/SettingsPanel.spec.ts`

**Interfaces:**
- Consumes: `useLocaleStore()` (`.options`, `.currentLocale`, `.setLocale(code)`); `ThemeToggle`, `OrientationToggle` components; i18n keys `nav.language`, `theme.label`, `orientation.label`, `picker.label`.
- Produces: component `SettingsPanel` exposing `data-test="settings-panel"`, locale buttons `data-test="settings-language-option"` (3 of them); embeds `ThemeToggle` and `OrientationToggle`.

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/components/SettingsPanel.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SettingsPanel from './SettingsPanel.vue';
import { i18n } from '../i18n';
import { useLocaleStore } from '../stores/localeStore';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  i18n.global.locale.value = 'en';
});

function mountPanel() {
  return mount(SettingsPanel, { global: { plugins: [i18n] } });
}

describe('SettingsPanel', () => {
  it('renders the three preference groups', () => {
    const w = mountPanel();
    expect(w.find('[data-test="settings-panel"]').exists()).toBe(true);
    expect(w.findComponent({ name: 'ThemeToggle' }).exists()).toBe(true);
    expect(w.findComponent({ name: 'OrientationToggle' }).exists()).toBe(true);
  });

  it('lists the three locales inline (no nested dropdown)', () => {
    const w = mountPanel();
    expect(w.findAll('[data-test="settings-language-option"]')).toHaveLength(3);
  });

  it('selecting a locale updates the store', async () => {
    const w = mountPanel();
    const store = useLocaleStore();
    // Options render in order en, ru, be → index 2 is Belarusian.
    await w.findAll('[data-test="settings-language-option"]')[2].trigger('click');
    expect(store.currentLocale).toBe('be');
  });

  it('marks the active locale as pressed', async () => {
    const w = mountPanel();
    const store = useLocaleStore();
    store.setLocale('ru');
    await w.vm.$nextTick();
    // Order en, ru, be → index 1 is Russian.
    const ruBtn = w.findAll('[data-test="settings-language-option"]')[1];
    expect(ruBtn.attributes('aria-pressed')).toBe('true');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `src/frontend`): `npm test -- SettingsPanel`
Expected: FAIL — cannot resolve `./SettingsPanel.vue`.

- [ ] **Step 3: Create the component**

Create `src/frontend/src/components/SettingsPanel.vue`:

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useLocaleStore } from '../stores/localeStore';
import type { Locale } from '../constants/locales';
import ThemeToggle from './ThemeToggle.vue';
import OrientationToggle from './OrientationToggle.vue';

const { t } = useI18n({ useScope: 'global' });
const locale = useLocaleStore();

function choose(code: Locale): void {
  locale.setLocale(code);
}
</script>

<template>
  <div class="settings-panel" data-test="settings-panel">
    <div class="settings-panel__group">
      <span class="settings-panel__label">{{ t('nav.language') }}</span>
      <ul class="settings-panel__locales" role="group" :aria-label="t('picker.label')">
        <li v-for="option in locale.options" :key="option.code">
          <button
            type="button"
            class="settings-panel__locale"
            :class="{ 'settings-panel__locale--on': option.code === locale.currentLocale }"
            :aria-pressed="option.code === locale.currentLocale"
            data-test="settings-language-option"
            @click="choose(option.code)"
          >
            <span :class="option.flagClass" class="settings-panel__flag" aria-hidden="true"></span>
            <span class="settings-panel__name">{{ option.nativeName }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div class="settings-panel__group">
      <span class="settings-panel__label">{{ t('theme.label') }}</span>
      <ThemeToggle />
    </div>

    <div class="settings-panel__group">
      <span class="settings-panel__label">{{ t('orientation.label') }}</span>
      <OrientationToggle />
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 220px;
}
.settings-panel__group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.settings-panel__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--gilt-deep);
  font-family: var(--font-display);
}
.settings-panel__locales {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.settings-panel__locale {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 17px;
  cursor: pointer;
  &:hover { background: var(--control-hover); }
  &--on { background: var(--bark); color: var(--on-accent); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.settings-panel__flag {
  width: 1.2em;
  line-height: 1em;
  border-radius: 2px;
}
// The embedded toggles stretch to fill the panel width.
.settings-panel :deep(.theme-toggle),
.settings-panel :deep(.orient) { display: flex; width: 100%; }
.settings-panel :deep(.theme-toggle__btn),
.settings-panel :deep(.orient__btn) { flex: 1 1 0; justify-content: center; }
</style>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `src/frontend`): `npm test -- SettingsPanel`
Expected: PASS — all four tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/SettingsPanel.vue src/frontend/src/components/SettingsPanel.spec.ts
git commit -m "Add SettingsPanel: reusable language/theme/orientation controls"
```

---

### Task 3: `SettingsMenu.vue` — desktop settings popover

**Files:**
- Create: `src/frontend/src/components/SettingsMenu.vue`
- Test: `src/frontend/src/components/SettingsMenu.spec.ts`

**Interfaces:**
- Consumes: `SettingsPanel` component; i18n key `settings.label`.
- Produces: component `SettingsMenu` with trigger `data-test="settings-menu-toggle"` (carries `aria-expanded`, `aria-haspopup="menu"`) and panel `data-test="settings-menu-panel"` (rendered only when open).

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/components/SettingsMenu.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SettingsMenu from './SettingsMenu.vue';
import { i18n } from '../i18n';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  i18n.global.locale.value = 'en';
});

function mountMenu() {
  return mount(SettingsMenu, { global: { plugins: [i18n] } });
}

describe('SettingsMenu', () => {
  it('is closed by default — panel not rendered', () => {
    const w = mountMenu();
    expect(w.find('[data-test="settings-menu-panel"]').exists()).toBe(false);
    expect(w.get('[data-test="settings-menu-toggle"]').attributes('aria-expanded')).toBe('false');
  });

  it('opens the panel on trigger click and shows the settings panel', async () => {
    const w = mountMenu();
    await w.get('[data-test="settings-menu-toggle"]').trigger('click');
    expect(w.find('[data-test="settings-menu-panel"]').exists()).toBe(true);
    expect(w.findComponent({ name: 'SettingsPanel' }).exists()).toBe(true);
    expect(w.get('[data-test="settings-menu-toggle"]').attributes('aria-expanded')).toBe('true');
  });

  it('closes on Esc', async () => {
    const w = mountMenu();
    await w.get('[data-test="settings-menu-toggle"]').trigger('click');
    expect(w.find('[data-test="settings-menu-panel"]').exists()).toBe(true);
    await w.get('[data-test="settings-menu"]').trigger('keydown', { key: 'Escape' });
    expect(w.find('[data-test="settings-menu-panel"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `src/frontend`): `npm test -- SettingsMenu`
Expected: FAIL — cannot resolve `./SettingsMenu.vue`.

- [ ] **Step 3: Create the component**

Create `src/frontend/src/components/SettingsMenu.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import SettingsPanel from './SettingsPanel.vue';

const { t } = useI18n({ useScope: 'global' });
const open = ref(false);

function toggle(): void {
  open.value = !open.value;
}

// Close when focus leaves the menu entirely (tab-away / click-away),
// mirroring LanguagePicker's dismissal pattern.
function onFocusOut(event: FocusEvent): void {
  const root = event.currentTarget as HTMLElement;
  if (!root.contains(event.relatedTarget as Node | null)) {
    open.value = false;
  }
}
</script>

<template>
  <div
    class="settings-menu"
    data-test="settings-menu"
    @keydown.esc.stop="open = false"
    @focusout="onFocusOut"
  >
    <button
      type="button"
      class="settings-menu__trigger"
      :aria-label="t('settings.label')"
      :aria-expanded="open"
      aria-haspopup="menu"
      aria-controls="settings-menu-panel"
      data-test="settings-menu-toggle"
      @click="toggle"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <g stroke="currentColor" stroke-width="1.5" fill="none">
          <line x1="2" y1="4" x2="14" y2="4" />
          <line x1="2" y1="8" x2="14" y2="8" />
          <line x1="2" y1="12" x2="14" y2="12" />
          <circle cx="6" cy="4" r="1.7" fill="var(--paper)" />
          <circle cx="10" cy="8" r="1.7" fill="var(--paper)" />
          <circle cx="5" cy="12" r="1.7" fill="var(--paper)" />
        </g>
      </svg>
    </button>

    <div
      v-if="open"
      id="settings-menu-panel"
      class="settings-menu__panel"
      data-test="settings-menu-panel"
    >
      <SettingsPanel />
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings-menu {
  position: relative;
  display: inline-flex;
}
.settings-menu__trigger {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--panel-edge);
  border-radius: 8px;
  background: var(--field-bg);
  color: var(--ink);
  cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.settings-menu__panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  padding: 12px;
  background: var(--panel);
  border: 1px solid var(--panel-edge);
  border-radius: 10px;
  box-shadow: 0 6px 18px var(--shadow);
}
</style>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `src/frontend`): `npm test -- SettingsMenu`
Expected: PASS — all three tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/SettingsMenu.vue src/frontend/src/components/SettingsMenu.spec.ts
git commit -m "Add SettingsMenu desktop popover wrapping SettingsPanel"
```

---

### Task 4: Account avatar + menu in `SignInControl.vue`

**Files:**
- Modify: `src/frontend/src/components/SignInControl.vue` (the `<template v-if="auth.signedIn">` block and `<style>`)
- Test: `src/frontend/src/components/SignInControl.spec.ts`

**Interfaces:**
- Consumes: `useAuthStore()` (`signedIn`, `name`, `email`, `canEdit`, `signOut()`); `disableAutoSelect` from `../auth/googleIdentity`.
- Produces: when signed in, an avatar button `data-test="account-avatar"` (carries `aria-expanded`, `aria-haspopup="menu"`) opening menu `data-test="account-menu"` containing existing hooks `data-test="sign-in-identity"`, `data-test="editor-badge"` (when `canEdit`), `data-test="sign-out"`. Signed-out GIS path (`data-test="gis-button"`) and unconfigured behavior unchanged.

- [ ] **Step 1: Update the tests to expect the avatar/menu**

In `SignInControl.spec.ts`, replace the three signed-in tests (`shows the identity and a sign-out button when signed in`, `shows the editor badge when canEdit`, `calls signOut when the sign-out button is clicked...`) with versions that open the avatar menu first, and add an avatar/initials test:

```ts
  it('shows an initials avatar when signed in (identity hidden until opened)', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada Lovelace', canEdit: false });
    const w = mountControl();
    await w.vm.$nextTick();

    const avatar = w.find('[data-test="account-avatar"]');
    expect(avatar.exists()).toBe(true);
    expect(avatar.text()).toContain('AL');
    expect(w.find('[data-test="gis-button"]').exists()).toBe(false);
    // Identity is behind the menu, not shown until the avatar is clicked.
    expect(w.find('[data-test="sign-in-identity"]').exists()).toBe(false);
  });

  it('opens the account menu with identity and sign-out when the avatar is clicked', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: false });
    const w = mountControl();
    await w.vm.$nextTick();

    await w.get('[data-test="account-avatar"]').trigger('click');
    expect(w.find('[data-test="sign-in-identity"]').text()).toContain('Ada');
    expect(w.find('[data-test="sign-out"]').exists()).toBe(true);
    expect(w.find('[data-test="editor-badge"]').exists()).toBe(false);
  });

  it('shows the editor badge in the menu when canEdit', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: true });
    const w = mountControl();
    await w.vm.$nextTick();

    await w.get('[data-test="account-avatar"]').trigger('click');
    expect(w.find('[data-test="editor-badge"]').exists()).toBe(true);
  });

  it('calls signOut from the menu and clears GIS auto-select', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: true });
    const spy = vi.spyOn(store, 'signOut').mockResolvedValue();
    const w = mountControl();
    await w.vm.$nextTick();

    await w.get('[data-test="account-avatar"]').trigger('click');
    await w.get('[data-test="sign-out"]').trigger('click');
    await flushPromises();

    expect(spy).toHaveBeenCalled();
    expect(disableAutoSelect).toHaveBeenCalled();
  });
```

Leave the signed-out tests (`shows the GIS button mount point when signed out`, `re-renders the GIS button after sign-out`, `signs in through the GIS credential callback`, `shows a localized error message`, `renders nothing interactive when no client id is configured`) unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `src/frontend`): `npm test -- SignInControl`
Expected: FAIL — no `[data-test="account-avatar"]` element exists yet.

- [ ] **Step 3: Implement the avatar + menu**

In `SignInControl.vue`, add to the `<script setup>` (after the existing `const auth = useAuthStore();` and imports — also import `computed`):

```ts
import { computed, onMounted, ref, watch } from 'vue';
```

(replace the existing `import { onMounted, ref, watch } from 'vue';` line with the line above), then add:

```ts
const menuOpen = ref(false);

// Two-letter initials for the avatar: first letters of the first two name words,
// else the first two characters of the name/email. Falls back to "?".
const initials = computed(() => {
  const source = (auth.name || auth.email || '').trim();
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
});

function onFocusOut(event: FocusEvent): void {
  const root = event.currentTarget as HTMLElement;
  if (!root.contains(event.relatedTarget as Node | null)) {
    menuOpen.value = false;
  }
}
```

Replace the signed-in branch of the template (the `<template v-if="auth.signedIn"> ... </template>` block, currently lines 66–74) with:

```vue
    <template v-if="auth.signedIn">
      <div
        class="signin__account"
        @keydown.esc.stop="menuOpen = false"
        @focusout="onFocusOut"
      >
        <button
          type="button"
          class="signin__avatar"
          :aria-label="t('auth.signedInAs', { name: auth.name || auth.email })"
          :aria-expanded="menuOpen"
          aria-haspopup="menu"
          aria-controls="account-menu"
          data-test="account-avatar"
          @click="menuOpen = !menuOpen"
        >{{ initials }}</button>

        <div v-if="menuOpen" id="account-menu" class="signin__menu" data-test="account-menu">
          <span class="signin__identity" data-test="sign-in-identity">
            {{ t('auth.signedInAs', { name: auth.name || auth.email }) }}
          </span>
          <span v-if="auth.canEdit" class="signin__badge" data-test="editor-badge">{{ t('auth.editorBadge') }}</span>
          <button type="button" class="signin__out" data-test="sign-out" @click="signOut">
            {{ t('auth.signOut') }}
          </button>
        </div>
      </div>
    </template>
```

In the `<style scoped>`, replace the `.signin__identity` rule's surrounding context by adding these rules (keep the existing `.signin`, `.signin__badge`, `.signin__out`, `.signin__gis`, `.signin__error` rules; the `.signin__identity` rule changes to a block layout inside the menu):

```scss
.signin__account { position: relative; display: inline-flex; }
.signin__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--gilt);
  background: var(--bark);
  color: var(--on-accent);
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 0.5px;
  cursor: pointer;
  display: grid;
  place-items: center;
  &:hover { filter: brightness(1.08); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.signin__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  min-width: 200px;
  background: var(--panel);
  border: 1px solid var(--panel-edge);
  border-radius: 10px;
  box-shadow: 0 6px 18px var(--shadow);
}
```

And change the existing `.signin__identity` rule to drop `white-space: nowrap` (it now wraps inside the menu):

```scss
.signin__identity {
  font-size: 15px;
  color: var(--ink-soft);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `src/frontend`): `npm test -- SignInControl`
Expected: PASS — all signed-in and signed-out tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/SignInControl.vue src/frontend/src/components/SignInControl.spec.ts
git commit -m "Sign-in: collapse the signed-in state to an initials-avatar account menu"
```

---

### Task 5: Restructure `AppBar.vue` — 3-column desktop grid, compacted masthead, mobile sheet via SettingsPanel

**Files:**
- Modify: `src/frontend/src/components/AppBar.vue`
- Test: `src/frontend/src/components/AppBar.spec.ts`

**Interfaces:**
- Consumes: `TabNav`, `SearchField`, `SettingsMenu` (Task 3), `SignInControl` (Task 4), `SettingsPanel` (Task 2); `useMediaQuery(MOBILE_MEDIA_QUERY)`.
- Produces: desktop row `data-test="app-bar"` containing `[data-test="tab-nav"]`, the masthead (`[data-test="app-bar-subtitle"]`), `[data-test="search-input"]`, `[data-test="settings-menu"]`, `[data-test="sign-in-control-slot"]`. Mobile sheet `[data-test="nav-sheet"]` contains `TabNav`, `SettingsPanel`, `SignInControl`.

- [ ] **Step 1: Update the AppBar tests for the new structure**

In `AppBar.spec.ts`, replace the first two desktop tests and the mobile-sheet test as follows.

Replace `renders tabs, search, language picker and orientation toggle`:

```ts
  it('renders tabs, search and the settings menu on desktop', async () => {
    const wrapper = await mountBar();
    expect(wrapper.find('[data-test="tab-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="search-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="settings-menu"]').exists()).toBe(true);
  });

  it('hosts language, theme and orientation inside the settings popover', async () => {
    const wrapper = await mountBar();
    // Closed by default — controls are not in the DOM yet.
    expect(wrapper.find('[data-test="orientation-toggle"]').exists()).toBe(false);
    await wrapper.get('[data-test="settings-menu-toggle"]').trigger('click');
    expect(wrapper.find('[data-test="orientation-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="theme-toggle"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="settings-language-option"]')).toHaveLength(3);
  });
```

Delete the now-obsolete `renders the theme toggle on desktop` test (theme is covered by the popover test above).

Replace `opens the menu sheet with views, language and layout`:

```ts
  it('opens the menu sheet with views and the settings panel', async () => {
    const w = await mountMobileBar();
    await w.get('[data-test="nav-menu"]').trigger('click');
    const sheet = w.get('[data-test="nav-sheet"]');
    expect(sheet.findComponent({ name: 'TabNav' }).exists()).toBe(true);
    expect(sheet.findComponent({ name: 'SettingsPanel' }).exists()).toBe(true);
    expect(sheet.findComponent({ name: 'OrientationToggle' }).exists()).toBe(true);
  });
```

Leave the search-reveal, Esc, brand-title, and sign-in tests unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `src/frontend`): `npm test -- AppBar`
Expected: FAIL — `[data-test="settings-menu"]` not found; masthead/sheet structure not present.

- [ ] **Step 3: Rewrite AppBar's script + template**

Replace the `<script setup>` imports block in `AppBar.vue` (lines 1–11) — drop `LanguagePicker`, `OrientationToggle`, `ThemeToggle` direct imports, add `SettingsMenu` and `SettingsPanel`:

```ts
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFamilyStore } from '../stores/familyStore';
import { useMediaQuery, MOBILE_MEDIA_QUERY } from '../composables/useMediaQuery';
import TabNav from './TabNav.vue';
import SearchField from './SearchField.vue';
import SettingsMenu from './SettingsMenu.vue';
import SettingsPanel from './SettingsPanel.vue';
import SignInControl from './SignInControl.vue';
```

(Keep the rest of the script — `t`, `family`, `menuOpen`, `searchOpen`, `isMobile`, `closeAll`, `subtitle` — exactly as is.)

Replace the desktop row (lines 36–45) with the 3-column layout:

```vue
    <!-- Desktop row — only mounted on desktop -->
    <div v-if="!isMobile" class="app-bar__row app-bar__row--desktop">
      <div class="app-bar__nav"><TabNav /></div>
      <div class="app-bar__masthead">
        <h1 class="app-bar__title"><b>{{ t('brand.titleLead') }}</b> {{ t('brand.titleRest') }}</h1>
        <p class="app-bar__subtitle" data-test="app-bar-subtitle">{{ subtitle }}</p>
      </div>
      <div class="app-bar__controls">
        <SearchField />
        <SettingsMenu />
        <span class="app-bar__signin" data-test="sign-in-control-slot"><SignInControl /></span>
      </div>
    </div>
```

Replace the mobile sheet groups (lines 80–101) with the SettingsPanel-based sheet:

```vue
        <!-- Dropdown sheet revealed by ☰ -->
        <div v-if="menuOpen" class="app-bar__sheet" data-test="nav-sheet">
          <div class="app-bar__group">
            <span class="app-bar__label">{{ t('nav.views') }}</span>
            <TabNav />
          </div>
          <div class="app-bar__group">
            <span class="app-bar__label">{{ t('settings.label') }}</span>
            <SettingsPanel />
          </div>
          <div class="app-bar__group">
            <span class="app-bar__label">{{ t('auth.signIn') }}</span>
            <SignInControl />
          </div>
        </div>
```

Delete the standalone desktop title/subtitle lines (the old lines 105–107: `<h1 ... app-bar__title>` and `<p ... app-bar__subtitle>` that sit after the mobile block) — the masthead now lives in the grid's center column.

- [ ] **Step 4: Update AppBar's styles**

In the `<style>` block, replace the desktop-row rules. Remove the old `.app-bar__row { display:flex }`, `.app-bar__spacer`, the `flex-wrap`/`:deep` release-valve rules (old lines 117–120 and 165–179) and the old centered `.app-bar__title` (49px) / `.app-bar__subtitle` (21px) rules. Add:

```scss
.app-bar__row--desktop {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
}
.app-bar__nav { justify-self: start; }
.app-bar__masthead { justify-self: center; text-align: center; }
.app-bar__controls {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 10px;
}
.app-bar__signin { flex: 0 0 auto; display: inline-flex; }

// Compacted masthead — title size is tunable; validate against both themes/locales.
.app-bar__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  letter-spacing: 2px;
  font-size: 22px;
  line-height: 1.1;
  color: var(--ink);
  text-shadow: 0 1px 0 var(--title-shadow);
  b { font-weight: 600; color: var(--ink); }
}
.app-bar__subtitle {
  margin: 1px 0 0;
  font-family: var(--font-body);
  font-style: italic;
  letter-spacing: 0.5px;
  font-size: 13px;
  color: var(--ink-soft);
}
```

Keep the mobile-specific rules (`.app-bar__mobilewrap`, `.app-bar__mobile`, `.app-bar__searchrow`, `.app-bar__sheet`, `.app-bar__backdrop`, `.app-bar__icon`, `.app-bar__brand`, `.app-bar__group`, `.app-bar__label`) as they are. The old `.app-bar__sheet :deep(.orient)` / `:deep(.theme-toggle)` / `:deep(.tabnav)` stretch rules (old lines 176–183) can be removed — `SettingsPanel` now owns that layout.

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `src/frontend`): `npm test -- AppBar`
Expected: PASS — desktop and mobile tests pass.

- [ ] **Step 6: Run the full frontend test suite + type-check**

Run (from `src/frontend`): `npm test`
Expected: PASS — no regressions in `LanguagePicker.spec`, `ThemeToggle.spec`, `OrientationToggle.spec`, etc.
Run (from `src/frontend`): `npm run build`
Expected: type-check + build succeed (no unused-import or template type errors).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/AppBar.vue src/frontend/src/components/AppBar.spec.ts
git commit -m "Restructure the desktop header into a single-tier 3-column layout"
```

---

### Task 6: Collapse search to an icon on narrow desktop

**Files:**
- Modify: `src/frontend/src/composables/useMediaQuery.ts`
- Modify: `src/frontend/src/components/AppBar.vue`
- Test: `src/frontend/src/components/AppBar.spec.ts`

**Interfaces:**
- Consumes: `useMediaQuery`.
- Produces: exported constant `NARROW_DESKTOP_MEDIA_QUERY`; AppBar desktop search toggle `data-test="desktop-search-toggle"` and a revealed search row when active.

- [ ] **Step 1: Add the narrow-desktop test**

In `AppBar.spec.ts`, add a mount helper that stubs `matchMedia` to match only the narrow-desktop query, then a test. Add this helper after `mountMobileBar`:

```ts
/**
 * Mount in narrow-desktop mode: not mobile, but below the search-collapse width.
 * matchMedia matches the narrow-desktop query only.
 */
async function mountNarrowDesktopBar() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('1499.98px'),
    media: q,
    addEventListener() {},
    removeEventListener() {}
  }));
  const router = makeRouter();
  await router.push('/');
  await router.isReady();
  return mount(AppBar, { global: { plugins: [i18n, router] } });
}
```

And the test:

```ts
  it('collapses search to an icon on narrow desktop and reveals it on click', async () => {
    const w = await mountNarrowDesktopBar();
    // Not mobile: the desktop row (settings menu) is present.
    expect(w.find('[data-test="settings-menu"]').exists()).toBe(true);
    // Search starts collapsed — the field is not shown, the toggle is.
    expect(w.find('[data-test="search-input"]').exists()).toBe(false);
    const toggle = w.get('[data-test="desktop-search-toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    await toggle.trigger('click');
    expect(w.find('[data-test="search-input"]').exists()).toBe(true);
    expect(w.get('[data-test="desktop-search-toggle"]').attributes('aria-expanded')).toBe('true');
  });
```

Note: the existing `renders tabs, search and the settings menu on desktop` test uses `mountBar()` where `matchMedia` is undefined, so both `isMobile` and `isNarrowDesktop` are false → the inline search field still renders there. That test stays valid.

- [ ] **Step 2: Run the test to verify it fails**

Run (from `src/frontend`): `npm test -- AppBar`
Expected: FAIL — `[data-test="desktop-search-toggle"]` not found.

- [ ] **Step 3: Add the media-query constant**

In `useMediaQuery.ts`, after the `SLIM_MEDIA_QUERY` export, add:

```ts
/** Narrow desktop (wider than mobile, but tight for an inline search field). */
export const NARROW_DESKTOP_MEDIA_QUERY = '(min-width: 1200px) and (max-width: 1499.98px)';
```

- [ ] **Step 4: Wire the collapse into AppBar**

In `AppBar.vue` script, extend the media-query import and add state:

```ts
import { useMediaQuery, MOBILE_MEDIA_QUERY, NARROW_DESKTOP_MEDIA_QUERY } from '../composables/useMediaQuery';
```

After `const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);` add:

```ts
const isNarrowDesktop = useMediaQuery(NARROW_DESKTOP_MEDIA_QUERY);
const deskSearchOpen = ref(false);
```

Replace the `<SearchField />` line inside `.app-bar__controls` with the collapsible variant:

```vue
        <button
          v-if="isNarrowDesktop"
          type="button"
          class="app-bar__icon"
          data-test="desktop-search-toggle"
          :aria-label="t('search.label')"
          :aria-expanded="deskSearchOpen"
          @click="deskSearchOpen = !deskSearchOpen"
        >⌕</button>
        <SearchField v-else />
```

Add a revealed search row directly after the desktop row's closing `</div>` (still inside the `v-if="!isMobile"` region — wrap both in a `<template>` if needed). Concretely, change the desktop block opening from `<div v-if="!isMobile" ...>` to a `<template v-if="!isMobile">` wrapping the row plus the reveal:

```vue
    <template v-if="!isMobile">
      <div class="app-bar__row app-bar__row--desktop">
        ...existing nav / masthead / controls...
      </div>
      <div v-if="isNarrowDesktop && deskSearchOpen" class="app-bar__searchrow" data-test="desktop-searchrow">
        <SearchField />
      </div>
    </template>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `src/frontend`): `npm test -- AppBar`
Expected: PASS — including the new narrow-desktop test and the existing desktop test.

- [ ] **Step 6: Type-check**

Run (from `src/frontend`): `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/composables/useMediaQuery.ts src/frontend/src/components/AppBar.vue src/frontend/src/components/AppBar.spec.ts
git commit -m "Collapse the header search to an icon on narrow desktop widths"
```

---

### Task 7: Manual verification + reference docs

**Files:**
- Modify: `docs/reference/features/app-shell-and-localization.md`

**Interfaces:**
- Consumes: nothing — verification + documentation.

- [ ] **Step 1: Run the app and verify the three desktop widths**

Use the run-app skill / `node scripts/dev.mjs` (custom ports — never the defaults). With the API + dev server running, open the SPA and confirm at ~1280px, ~1440px, and ~1920px:
- The control row never wraps; tabs sit left, the masthead is centered, search/settings/account sit right.
- The Settings popover opens and contains language (3 options), theme, orientation; selecting each updates the view; Esc and click-away close it.
- Signed-out shows the Google button in the account slot; (if you can sign in) signed-in shows the initials avatar opening the account menu with identity / Editor badge / Sign out.
- At ~1280px the search collapses to an icon that reveals the field on click.
- Resize below 1200px → the mobile ☰ / ⌕ bar appears; the ☰ sheet shows Views, the Settings panel, and the account control.

Capture a screenshot of the desktop header for the PR.

- [ ] **Step 2: Update the reference doc**

In `docs/reference/features/app-shell-and-localization.md`, update the app-bar/header description to reflect: the single-tier 3-column desktop layout, the Settings popover housing language/theme/orientation, the account slot (Google button signed-out, initials-avatar menu signed-in), and the narrow-desktop search collapse. (Run the `update-docs-for-pr` skill at `gh pr create` time to catch any other doc impact.)

- [ ] **Step 3: Commit**

```bash
git add docs/reference/features/app-shell-and-localization.md
git commit -m "Docs: describe the reorganized header and settings popover"
```

---

## Self-Review

**Spec coverage:**
- Single-tier 3-column desktop layout → Task 5.
- Compacted masthead (tunable title size) → Task 5.
- Settings popover (language/theme/orientation, orientation always present) → Tasks 2 + 3, mounted in Task 5.
- Account slot, initials avatar + menu signed-in, GIS button signed-out → Task 4, mounted in Task 5.
- Search collapse on narrow desktop → Task 6.
- Mobile sheet realigned to mirror the popover → Task 5.
- i18n `settings.label` in all three locales → Task 1.
- Tests for all of the above → in each task.
- Docs in the same PR → Task 7.
- Non-goals (custom GIS button, locale sync, picture avatar) → explicitly excluded in Global Constraints.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N" — all steps carry concrete code and commands.

**Type consistency:** `setLocale`/`options`/`currentLocale` match `localeStore`; `auth.name`/`email`/`canEdit`/`signOut`/`signedIn` match `authStore`; `disableAutoSelect` matches `googleIdentity`; component names (`SettingsPanel`, `SettingsMenu`, `SignInControl`, `TabNav`, `OrientationToggle`, `ThemeToggle`) match files; `data-test` hooks are consistent across the tasks that produce and consume them; `MOBILE_MEDIA_QUERY` / `NARROW_DESKTOP_MEDIA_QUERY` match `useMediaQuery.ts`.
