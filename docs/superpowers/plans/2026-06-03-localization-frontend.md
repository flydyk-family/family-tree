# Localization — Frontend i18n Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Vue web app switch between **English / Русский / Беларуская** instantly and client-side — UI strings via vue-i18n, Person free-text data via a `localize` helper over the backend's `{ru,be,en}` payload — with a flag language picker whose choice persists across sessions.

**Architecture:** A `useLocale` Pinia store owns the active locale (first-visit `navigator.language` detection → `localStorage` persistence → `ru` default) and, on change, syncs `vue-i18n`'s locale and `<html lang>`. UI strings come from `src/i18n/messages/{ru,be,en}.ts` through `vue-i18n` (`legacy:false`, `fallbackLocale:'ru'`). Localized **data** fields (now `LocalizedTextDto {ru,be,en}` from the API) render through a pure `localize(text, locale)` helper with a requested→ru→en→any fallback chain. A `LanguagePicker` flag control, hosted in a slim top **app bar**, drives `store.setLocale`.

**Tech Stack:** Vue 3.5 (Composition API, `<script setup>`), Pinia 2 (Options-store style), vue-router 4, **vue-i18n** (new), **flag-icons** (new, MIT SVG/CSS — flag emoji don't render on Windows Chrome), Vite 5, Vitest 1 + @vue/test-utils + jsdom.

**This is Plan B of two.** Plan A (merged) did the backend: `LocalizedText`, localized Person fields, `LocalizedTextDto`, localized sample data. The API already returns every localized field as `{ "ru": ..., "be": ..., "en": ... }` (values may be `null`); absent optional fields serialize as `null`. This plan consumes that shape on the frontend and does **not** touch the backend.

**Placement decision (chosen — Option B):** The language switch lives in a **slim top app bar** (brand on the left; an actions cluster on the right that hosts the picker now and will host **search** + a **directory** link later), wired as an app shell above `router-view`. This is the roadmap-aligned choice: the bar is a global, surface-independent home for the picker on every future surface (member popup, `/person/:id`, search, directory/table) — no later rework. The oak canvas fills the area below the bar. (Options considered: A floating chip — immersive but no home once non-canvas surfaces arrive; C canvas dock — strands a global control on canvas-only chrome. See `docs/superpowers/mockups/localization-placement.html`.)

**Conventions (match existing frontend):** 2-space indent, semicolons, single quotes, `<script setup lang="ts">`, Pinia Options stores (`state`/`getters`/`actions`), colocated `*.spec.ts`, `data-test="..."` hooks for queries, scoped SCSS using the CSS custom properties in `src/styles/tokens.scss` (`--ink`, `--parchment`, `--bark`, …). Vitest has `globals: true` (you may omit `describe/it/expect` imports, but existing files import them — keep importing for clarity). **Run all frontend commands from `src/frontend`.**

---

## File Structure

```
Create:
  src/frontend/src/constants/locales.ts                 Locale union, options (code/nativeName/flagClass), storage key
  src/frontend/src/i18n/localize.ts                     pure localize(text, locale) data helper
  src/frontend/src/i18n/localize.spec.ts                fallback-chain tests
  src/frontend/src/i18n/localeDetection.ts              load/store/detect locale (localStorage + navigator)
  src/frontend/src/i18n/localeDetection.spec.ts         detection/persistence tests
  src/frontend/src/i18n/messages/ru.ts                  Russian UI catalog
  src/frontend/src/i18n/messages/be.ts                  Belarusian UI catalog
  src/frontend/src/i18n/messages/en.ts                  English UI catalog
  src/frontend/src/i18n/index.ts                        createI18n instance
  src/frontend/src/stores/localeStore.ts                useLocaleStore (owns locale, syncs i18n + <html lang>)
  src/frontend/src/stores/localeStore.spec.ts           store tests
  src/frontend/src/components/LanguagePicker.vue         flag picker (dropdown of the three locales)
  src/frontend/src/components/LanguagePicker.spec.ts     picker tests
  src/frontend/src/components/AppBar.vue                  slim top bar: brand + actions cluster (hosts the picker)
  src/frontend/src/components/AppBar.spec.ts             app-bar tests

Modify:
  src/frontend/package.json                             + vue-i18n, + flag-icons
  src/frontend/vite.config.ts                           + vue-i18n feature-flag defines
  src/frontend/src/types/family.ts                      LocalizedText type; names/place → LocalizedText
  src/frontend/src/main.ts                              register vue-i18n, init locale store, import flag-icons CSS
  src/frontend/src/App.vue                              app shell: AppBar above a body region holding router-view
  src/frontend/src/views/TreeView.vue                  localize loading/error strings; fill below the app bar
  src/frontend/src/components/OakTree.vue               render localized node name via localize() + store
  src/frontend/src/components/OakTree.spec.ts          localized graph + locale-switch assertion
  src/frontend/src/stores/familyStore.spec.ts          mocks → localized name shape
```

`YearAxis.vue` / `timeScale.ts` need **no change** — axis labels already render `String(year)` (plain numbers, never locale-formatted), satisfying spec §4.

---

## Baseline (do this once, before Task 1)

- [ ] Confirm a green starting point.

Run (from `src/frontend`):
```bash
npm test
```
Expected: all existing specs pass (`familyStore.spec.ts`, `OakTree.spec.ts`, and any others). If `node_modules` is missing, run `npm install` first. Do not start Task 1 until the baseline is green.

---

## Task 1: Locale constants + pure `localize` data helper

No new dependencies. Pure TypeScript; additive (nothing else imports these yet), so the build/tests stay green.

**Files:**
- Create: `src/frontend/src/constants/locales.ts`
- Modify: `src/frontend/src/types/family.ts` (ADD the `LocalizedText` type only — do **not** change `PersonSummary` yet; that happens in Task 5)
- Create: `src/frontend/src/i18n/localize.ts`
- Test: `src/frontend/src/i18n/localize.spec.ts`

- [ ] **Step 1: Add the locale constants**

Create `src/frontend/src/constants/locales.ts`:

```ts
export const LOCALES = ['ru', 'be', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_STORAGE_KEY = 'familytree.locale';

export interface LocaleOption {
  code: Locale;
  nativeName: string;
  flagClass: string;
}

// Display order in the picker. flagClass uses flag-icons country codes:
// gb (United Kingdom) for English, ru for Russian, by (official Belarus) for Belarusian.
export const LOCALE_OPTIONS: LocaleOption[] = [
  { code: 'en', nativeName: 'English', flagClass: 'fi fi-gb' },
  { code: 'ru', nativeName: 'Русский', flagClass: 'fi fi-ru' },
  { code: 'be', nativeName: 'Беларуская', flagClass: 'fi fi-by' }
];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
```

- [ ] **Step 2: Add the `LocalizedText` TS type (additive)**

In `src/frontend/src/types/family.ts`, add this interface at the **top** of the file (above `ParentsRef`). Values are nullable because the API serializes absent variants as `null`:

```ts
export interface LocalizedText {
  ru: string | null;
  be: string | null;
  en: string | null;
}
```

Leave `PersonSummary` unchanged in this task.

- [ ] **Step 3: Write the failing test for `localize`**

Create `src/frontend/src/i18n/localize.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { localize } from './localize';

describe('localize', () => {
  it('returns the requested locale when present', () => {
    expect(localize({ ru: 'Анна', be: 'Ганна', en: 'Anna' }, 'be')).toBe('Ганна');
  });

  it('falls back to ru when the requested locale is empty', () => {
    expect(localize({ ru: 'Анна', be: null, en: 'Anna' }, 'be')).toBe('Анна');
  });

  it('falls back to en when ru is missing', () => {
    expect(localize({ ru: null, be: null, en: 'Anna' }, 'ru')).toBe('Anna');
  });

  it('falls back to any available value', () => {
    expect(localize({ ru: null, be: 'Ганна', en: null }, 'en')).toBe('Ганна');
  });

  it('treats whitespace-only values as empty', () => {
    expect(localize({ ru: '   ', be: null, en: 'Anna' }, 'ru')).toBe('Anna');
  });

  it('returns an empty string for null text', () => {
    expect(localize(null, 'ru')).toBe('');
  });

  it('returns an empty string when all values are empty', () => {
    expect(localize({ ru: null, be: null, en: null }, 'ru')).toBe('');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run (from `src/frontend`):
```bash
npx vitest run src/i18n/localize.spec.ts
```
Expected: FAIL — cannot resolve `./localize`.

- [ ] **Step 5: Implement `localize`**

Create `src/frontend/src/i18n/localize.ts`:

```ts
import type { Locale } from '../constants/locales';
import type { LocalizedText } from '../types/family';

// Fallback chain mirrors the backend LocalizedText.Resolve: requested → ru → en → any.
export function localize(text: LocalizedText | null | undefined, locale: Locale): string {
  if (!text) {
    return '';
  }
  const candidates = [text[locale], text.ru, text.en, text.be];
  return candidates.find(value => typeof value === 'string' && value.trim() !== '') ?? '';
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run (from `src/frontend`):
```bash
npx vitest run src/i18n/localize.spec.ts
```
Expected: PASS (7 cases).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/constants/locales.ts src/frontend/src/types/family.ts src/frontend/src/i18n/localize.ts src/frontend/src/i18n/localize.spec.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add locale constants and pure localize data helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Locale detection/persistence + vue-i18n setup + message catalogs

Adds the `vue-i18n` dependency and the i18n instance + UI catalogs. Additive — only these files import each other; nothing in the app wires them in yet (that's Task 4), so the build/tests stay green.

**Files:**
- Modify: `src/frontend/package.json` (via `npm install`)
- Modify: `src/frontend/vite.config.ts`
- Create: `src/frontend/src/i18n/localeDetection.ts`
- Test: `src/frontend/src/i18n/localeDetection.spec.ts`
- Create: `src/frontend/src/i18n/messages/ru.ts`, `be.ts`, `en.ts`
- Create: `src/frontend/src/i18n/index.ts`

- [ ] **Step 1: Install vue-i18n**

Run (from `src/frontend`):
```bash
npm install vue-i18n
```
Expected: `vue-i18n` added to `dependencies` in `package.json`.

- [ ] **Step 2: Add vue-i18n feature-flag defines (clean build, no warnings)**

In `src/frontend/vite.config.ts`, add a top-level `define` block (sibling of `plugins`). The file becomes:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  define: {
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false
  },
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

- [ ] **Step 3: Write the failing test for locale detection**

Create `src/frontend/src/i18n/localeDetection.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LOCALE_STORAGE_KEY } from '../constants/locales';
import { loadStoredLocale, storeLocale, detectInitialLocale } from './localeDetection';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('localeDetection', () => {
  it('loadStoredLocale returns a valid stored locale', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    expect(loadStoredLocale()).toBe('en');
  });

  it('loadStoredLocale returns null for an unsupported value', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'xx');
    expect(loadStoredLocale()).toBeNull();
  });

  it('storeLocale round-trips through localStorage', () => {
    storeLocale('be');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('be');
  });

  it('detectInitialLocale prefers the stored locale', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    expect(detectInitialLocale()).toBe('en');
  });

  it('detectInitialLocale uses navigator.language when nothing is stored', () => {
    vi.stubGlobal('navigator', { language: 'be-BY' });
    expect(detectInitialLocale()).toBe('be');
  });

  it('detectInitialLocale defaults to ru for an unsupported browser language', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    expect(detectInitialLocale()).toBe('ru');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run (from `src/frontend`):
```bash
npx vitest run src/i18n/localeDetection.spec.ts
```
Expected: FAIL — cannot resolve `./localeDetection`.

- [ ] **Step 5: Implement locale detection/persistence**

Create `src/frontend/src/i18n/localeDetection.ts`:

```ts
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale, type Locale } from '../constants/locales';

export function loadStoredLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return raw && isLocale(raw) ? raw : null;
  } catch {
    return null; // localStorage may be unavailable (private mode)
  }
}

export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore persistence failures (private mode / quota)
  }
}

export function detectInitialLocale(): Locale {
  const stored = loadStoredLocale();
  if (stored) {
    return stored;
  }
  const browser = typeof navigator !== 'undefined'
    ? navigator.language.slice(0, 2).toLowerCase()
    : '';
  return isLocale(browser) ? browser : DEFAULT_LOCALE;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run (from `src/frontend`):
```bash
npx vitest run src/i18n/localeDetection.spec.ts
```
Expected: PASS (6 cases).

- [ ] **Step 7: Add the message catalogs**

Create `src/frontend/src/i18n/messages/ru.ts`:

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
  }
};
```

Create `src/frontend/src/i18n/messages/be.ts`:

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
  }
};
```

Create `src/frontend/src/i18n/messages/en.ts`:

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
  }
};
```

- [ ] **Step 8: Create the i18n instance**

Create `src/frontend/src/i18n/index.ts`:

```ts
import { createI18n } from 'vue-i18n';
import { DEFAULT_LOCALE } from '../constants/locales';
import { detectInitialLocale } from './localeDetection';
import { ru } from './messages/ru';
import { be } from './messages/be';
import { en } from './messages/en';

export const i18n = createI18n({
  legacy: false,
  locale: detectInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { ru, be, en }
});
```

- [ ] **Step 9: Verify the suite still compiles & passes**

Run (from `src/frontend`):
```bash
npm test
```
Expected: all specs pass (the two new i18n spec files plus the originals). No TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add src/frontend/package.json src/frontend/package-lock.json src/frontend/vite.config.ts src/frontend/src/i18n
git commit -m "$(cat <<'EOF'
feat(frontend): add vue-i18n setup, message catalogs, and locale detection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
(If `package-lock.json` does not exist, omit it from `git add`.)

---

## Task 3: `useLocale` Pinia store

Owns the active locale and, on change, persists it, sets `<html lang>`, and syncs the vue-i18n locale. Additive (nothing imports it yet) — build/tests stay green.

**Files:**
- Create: `src/frontend/src/stores/localeStore.ts`
- Test: `src/frontend/src/stores/localeStore.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/stores/localeStore.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { LOCALE_STORAGE_KEY } from '../constants/locales';
import { i18n } from '../i18n';
import { useLocaleStore } from './localeStore';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  i18n.global.locale.value = 'ru';
  document.documentElement.lang = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('localeStore', () => {
  it('initializes from the persisted locale', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const store = useLocaleStore();
    expect(store.currentLocale).toBe('en');
  });

  it('defaults to ru when nothing is stored and the browser is unsupported', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    const store = useLocaleStore();
    expect(store.currentLocale).toBe('ru');
  });

  it('setLocale updates state, persists, sets <html lang>, and switches i18n', () => {
    const store = useLocaleStore();

    store.setLocale('be');

    expect(store.currentLocale).toBe('be');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('be');
    expect(document.documentElement.lang).toBe('be');
    expect(i18n.global.locale.value).toBe('be');
  });

  it('exposes the locale options in display order', () => {
    const store = useLocaleStore();
    expect(store.options.map(option => option.code)).toEqual(['en', 'ru', 'be']);
  });

  it('currentOption reflects the active locale', () => {
    const store = useLocaleStore();
    store.setLocale('en');
    expect(store.currentOption.nativeName).toBe('English');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `src/frontend`):
```bash
npx vitest run src/stores/localeStore.spec.ts
```
Expected: FAIL — cannot resolve `./localeStore`.

- [ ] **Step 3: Implement the store**

Create `src/frontend/src/stores/localeStore.ts`:

```ts
import { defineStore } from 'pinia';
import { LOCALE_OPTIONS, type Locale, type LocaleOption } from '../constants/locales';
import { detectInitialLocale, storeLocale } from '../i18n/localeDetection';
import { i18n } from '../i18n';

interface LocaleState {
  currentLocale: Locale;
}

export const useLocaleStore = defineStore('locale', {
  state: (): LocaleState => ({
    currentLocale: detectInitialLocale()
  }),
  getters: {
    options(): LocaleOption[] {
      return LOCALE_OPTIONS;
    },
    currentOption(state): LocaleOption {
      return LOCALE_OPTIONS.find(option => option.code === state.currentLocale) ?? LOCALE_OPTIONS[0];
    }
  },
  actions: {
    setLocale(locale: Locale): void {
      this.currentLocale = locale;
      storeLocale(locale);
      i18n.global.locale.value = locale;
      if (typeof document !== 'undefined') {
        document.documentElement.lang = locale;
      }
    },
    // Apply the detected/persisted locale to i18n + <html lang> at app startup.
    initLocale(): void {
      this.setLocale(this.currentLocale);
    }
  }
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `src/frontend`):
```bash
npx vitest run src/stores/localeStore.spec.ts
```
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/stores/localeStore.ts src/frontend/src/stores/localeStore.spec.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add useLocale store (detect, persist, sync i18n + html lang)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: App bar + flag picker + app wiring + localized UI strings

Adds the flag picker and the slim top **app bar** that hosts it, registers vue-i18n in the app, initializes the locale store at startup, imports the flag-icons CSS, wires the app shell (bar above the oak), and localizes the TreeView loading/error strings.

**Files:**
- Modify: `src/frontend/package.json` (via `npm install flag-icons`)
- Create: `src/frontend/src/components/LanguagePicker.vue`
- Test: `src/frontend/src/components/LanguagePicker.spec.ts`
- Create: `src/frontend/src/components/AppBar.vue`
- Test: `src/frontend/src/components/AppBar.spec.ts`
- Modify: `src/frontend/src/main.ts`
- Modify: `src/frontend/src/App.vue`
- Modify: `src/frontend/src/views/TreeView.vue`

- [ ] **Step 1: Install flag-icons**

Run (from `src/frontend`):
```bash
npm install flag-icons
```
Expected: `flag-icons` added to `dependencies`.

- [ ] **Step 2: Write the failing test for the picker**

Create `src/frontend/src/components/LanguagePicker.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import LanguagePicker from './LanguagePicker.vue';
import { i18n } from '../i18n';
import { useLocaleStore } from '../stores/localeStore';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  i18n.global.locale.value = 'ru';
});

function mountPicker() {
  return mount(LanguagePicker, { global: { plugins: [i18n] } });
}

describe('LanguagePicker', () => {
  it('shows the current locale flag and native name', () => {
    const store = useLocaleStore();
    store.setLocale('en');

    const wrapper = mountPicker();

    const toggle = wrapper.get('[data-test="language-picker-toggle"]');
    expect(toggle.text()).toContain('English');
    expect(wrapper.find('.fi.fi-gb').exists()).toBe(true);
  });

  it('opens and lists the three locales', async () => {
    const wrapper = mountPicker();

    await wrapper.get('[data-test="language-picker-toggle"]').trigger('click');

    expect(wrapper.findAll('[data-test="language-option"]')).toHaveLength(3);
  });

  it('selecting a locale updates the store and closes the menu', async () => {
    const wrapper = mountPicker();
    const store = useLocaleStore();

    await wrapper.get('[data-test="language-picker-toggle"]').trigger('click');
    // Options render in order en, ru, be → index 2 is Belarusian.
    await wrapper.findAll('[data-test="language-option"]')[2].trigger('click');

    expect(store.currentLocale).toBe('be');
    expect(wrapper.findAll('[data-test="language-option"]')).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `src/frontend`):
```bash
npx vitest run src/components/LanguagePicker.spec.ts
```
Expected: FAIL — cannot resolve `./LanguagePicker.vue`.

- [ ] **Step 4: Implement the picker**

Create `src/frontend/src/components/LanguagePicker.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocaleStore } from '../stores/localeStore';
import type { Locale } from '../constants/locales';

const store = useLocaleStore();
const { t } = useI18n();
const open = ref(false);

function toggle(): void {
  open.value = !open.value;
}

function choose(locale: Locale): void {
  store.setLocale(locale);
  open.value = false;
}
</script>

<template>
  <div class="lang-picker" data-test="language-picker">
    <button
      type="button"
      class="lang-picker__current"
      :aria-label="t('picker.label')"
      :aria-expanded="open"
      data-test="language-picker-toggle"
      @click="toggle"
    >
      <span :class="store.currentOption.flagClass" class="lang-picker__flag" aria-hidden="true"></span>
      <span class="lang-picker__name">{{ store.currentOption.nativeName }}</span>
    </button>

    <ul v-if="open" class="lang-picker__menu" role="listbox">
      <li
        v-for="option in store.options"
        :key="option.code"
        role="option"
        :aria-selected="option.code === store.currentLocale"
      >
        <button
          type="button"
          class="lang-picker__option"
          data-test="language-option"
          @click="choose(option.code)"
        >
          <span :class="option.flagClass" class="lang-picker__flag" aria-hidden="true"></span>
          <span class="lang-picker__name">{{ option.nativeName }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.lang-picker {
  position: relative;
  font-family: Georgia, serif;

  &__current,
  &__option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    background: var(--parchment-2);
    border: 1px solid var(--ink-soft);
    border-radius: 6px;
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }

  &__menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--parchment);
    border: 1px solid var(--ink-soft);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(74, 63, 51, 0.2);

    li { margin: 2px 0; }
  }

  &__option {
    border: none;
    background: transparent;
    white-space: nowrap;
    &:hover { background: var(--parchment-2); }
  }

  &__flag {
    width: 1.2em;
    line-height: 1em;
    border-radius: 2px;
  }
}
</style>
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `src/frontend`):
```bash
npx vitest run src/components/LanguagePicker.spec.ts
```
Expected: PASS (3 cases). If vue-i18n warns that `t` resolved against a non-global scope, change the picker's `useI18n()` call to `useI18n({ useScope: 'global' })` and re-run.

- [ ] **Step 6: Register vue-i18n, init the locale store, and import flag-icons CSS**

Replace `src/frontend/src/main.ts`:

```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { i18n } from './i18n';
import { useLocaleStore } from './stores/localeStore';
import 'flag-icons/css/flag-icons.min.css';
import './styles/global.scss';

const app = createApp(App);
app.use(createPinia()).use(i18n).use(router);
// Pinia's install sets the active pinia, so the store is usable here.
useLocaleStore().initLocale();
app.mount('#app');
```

- [ ] **Step 7: Write the failing test for the app bar**

Create `src/frontend/src/components/AppBar.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AppBar from './AppBar.vue';
import { i18n } from '../i18n';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  i18n.global.locale.value = 'en';
});

describe('AppBar', () => {
  it('renders the localized app title and contains the language picker', () => {
    const wrapper = mount(AppBar, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toContain('Family Tree');
    expect(wrapper.find('[data-test="language-picker"]').exists()).toBe(true);
  });
});
```

Run (from `src/frontend`):
```bash
npx vitest run src/components/AppBar.spec.ts
```
Expected: FAIL — cannot resolve `./AppBar.vue`.

- [ ] **Step 8: Implement the app bar**

Create `src/frontend/src/components/AppBar.vue` — a slim top bar with the brand on the left and an actions cluster on the right (the cluster is where search / a directory link will land later; for now it holds the picker):

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import LanguagePicker from './LanguagePicker.vue';

const { t } = useI18n();
</script>

<template>
  <header class="app-bar" data-test="app-bar">
    <span class="app-bar__brand">{{ t('app.title') }}</span>
    <div class="app-bar__actions">
      <!-- future: search field, directory link -->
      <LanguagePicker />
    </div>
  </header>
</template>

<style scoped lang="scss">
.app-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 16px;
  background: rgba(220, 207, 174, 0.92);
  border-bottom: 1px solid rgba(95, 82, 64, 0.25);
  font-family: Georgia, serif;
  color: var(--ink);

  &__brand {
    font-size: 15px;
    letter-spacing: 0.3px;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}
</style>
```

Run (from `src/frontend`):
```bash
npx vitest run src/components/AppBar.spec.ts
```
Expected: PASS.

- [ ] **Step 9: Wire the app shell in App.vue**

Replace `src/frontend/src/App.vue` so the bar sits above a body region that fills the rest of the viewport (the routed oak renders in the body, below the bar):

```vue
<script setup lang="ts">
import AppBar from './components/AppBar.vue';
</script>

<template>
  <div class="app-shell">
    <AppBar />
    <div class="app-shell__body">
      <router-view />
    </div>
  </div>
</template>

<style scoped lang="scss">
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.app-shell__body {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
```

- [ ] **Step 10: Localize the TreeView strings and fit it below the bar**

In `src/frontend/src/views/TreeView.vue`: (a) localize the status strings via `useI18n`, and (b) change the root from full-viewport to fill-parent so it occupies the area below the app bar (not the whole screen).

Add the import in `<script setup>` (after the existing imports):

```ts
import { useI18n } from 'vue-i18n';
```
and after `const { people, unions, focusId, loading, error } = storeToRefs(store);`:

```ts
const { t } = useI18n();
```

Change the two status lines in the template:

```html
    <p v-if="loading" class="tree-view__status">{{ t('status.loading') }}</p>
    <p v-else-if="error" class="tree-view__status tree-view__status--error">{{ t('status.error') }}</p>
```

Change the `.tree-view` size rules from viewport units to fill the parent body — only the `height`/`width` values change (`100vh`→`100%`, `100vw`→`100%`); the rest of the `.tree-view` block and the `@media` rule are unchanged:

```scss
.tree-view {
  height: 100%;
  width: 100%;
  overflow: hidden;
```

(The raw store `error` value stays available for debugging; the visible text is now a friendly localized message.)

- [ ] **Step 11: Run the full suite + typecheck/build**

Run (from `src/frontend`):
```bash
npm test
npm run build
```
Expected: all specs pass; `vue-tsc` typecheck + `vite build` succeed with no errors.

- [ ] **Step 12: Commit**

```bash
git add src/frontend/package.json src/frontend/package-lock.json src/frontend/src/components/LanguagePicker.vue src/frontend/src/components/LanguagePicker.spec.ts src/frontend/src/components/AppBar.vue src/frontend/src/components/AppBar.spec.ts src/frontend/src/main.ts src/frontend/src/App.vue src/frontend/src/views/TreeView.vue
git commit -m "$(cat <<'EOF'
feat(frontend): add slim app bar with flag picker and localize UI strings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
(If `package-lock.json` does not exist, omit it.)

---

## Task 5: Localize Person data — types + OakTree rendering

Flip the localized `family.ts` fields from `string` to `LocalizedText` (matching the API), render the OakTree node name through `localize()` with the active locale, and update the affected specs to the localized shape. This is one cohesive change so the build stays type-correct.

**Files:**
- Modify: `src/frontend/src/types/family.ts`
- Modify: `src/frontend/src/components/OakTree.vue`
- Modify: `src/frontend/src/components/OakTree.spec.ts`
- Modify: `src/frontend/src/stores/familyStore.spec.ts`

- [ ] **Step 1: Convert the localized fields in `PersonSummary`**

In `src/frontend/src/types/family.ts`, change `PersonSummary`'s name fields to `LocalizedText` (the `LocalizedText` interface was added in Task 1). The interface becomes:

```ts
export interface PersonSummary {
  id: string;
  givenName: LocalizedText;
  surname: LocalizedText;
  maidenName: LocalizedText | null;
  sex: string;
  birthYear: number | null;
  deathYear: number | null;
  vocation: string;
  portrait: string | null;
  parents: ParentsRef;
  marriedIntoFamily: boolean;
  isDefaultRoot: boolean;
}
```

(`sex`/`vocation` stay strings — they are localized as UI labels in a later phase, not as data. `Union`, `ParentsRef`, `FamilyGraph` are unchanged.)

- [ ] **Step 2: Render the localized node name in OakTree**

In `src/frontend/src/components/OakTree.vue`, add the store + helper imports and a `displayName` function, and route the `<text>` through it.

In `<script setup>`, add after the existing imports:

```ts
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import type { LayoutNode } from '../layout/treeLayout';
```
(If `LayoutNode` is already imported in the existing `import type { TreeLayout, LayoutNode, LayoutLink } ...` line, do **not** add a duplicate import — it already is; reuse it.)

Add after `const props = defineProps<{ layout: TreeLayout }>();`:

```ts
const localeStore = useLocaleStore();

function displayName(node: LayoutNode): string {
  return localize(node.person.givenName, localeStore.currentLocale);
}
```

Change the name `<text>` element (currently `{{ node.person.givenName }}`) to:

```html
        <text y="-14" text-anchor="middle" class="oak__name">{{ displayName(node) }}</text>
```

- [ ] **Step 3: Update the OakTree spec to the localized shape + add a locale-switch assertion**

Replace `src/frontend/src/components/OakTree.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import OakTree from './OakTree.vue';
import { buildLayout } from '../layout/treeLayout';
import { useLocaleStore } from '../stores/localeStore';
import type { FamilyGraph } from '../types/family';

const graph: FamilyGraph = {
  people: [
    { id: 'a', givenName: { ru: 'Анна', be: null, en: 'Anna' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'male', birthYear: 1850, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true },
    { id: 'b', givenName: { ru: 'Борис', be: null, en: 'Boris' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'female', birthYear: 1880, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: 'a' }, marriedIntoFamily: false, isDefaultRoot: false }
  ],
  unions: [{ id: 'u', partnerIds: ['a'], marriageYear: null, childIds: ['b'] }]
};

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

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
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    const names = () => wrapper.findAll('.oak__name').map(node => node.text());
    expect(names()).toContain('Anna');

    store.setLocale('ru');
    await wrapper.vm.$nextTick();

    expect(names()).toContain('Анна');
  });
});
```

- [ ] **Step 4: Update the familyStore spec mocks to the localized shape**

In `src/frontend/src/stores/familyStore.spec.ts`, replace the `person` helper so names are `LocalizedText`, and update the one assertion that read `givenName` as a string.

Replace the `person` factory:

```ts
function person(id: string, isDefaultRoot = false) {
  return {
    id,
    givenName: { ru: id, be: null, en: id },
    surname: { ru: 'X', be: null, en: 'X' },
    maidenName: null,
    sex: 'male',
    birthYear: 1900, deathYear: null, vocation: 'other', portrait: null,
    parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot
  };
}
```

Change the `personById` assertion from `?.givenName` to the localized field:

```ts
    expect(store.personById('p-1')?.givenName.ru).toBe('p-1');
```

(The other two tests in that file are unchanged.)

- [ ] **Step 5: Run the full suite + build**

Run (from `src/frontend`):
```bash
npm test
npm run build
```
Expected: all specs pass (including the new locale-switch assertion); `vue-tsc` + `vite build` succeed with no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/types/family.ts src/frontend/src/components/OakTree.vue src/frontend/src/components/OakTree.spec.ts src/frontend/src/stores/familyStore.spec.ts
git commit -m "$(cat <<'EOF'
feat(frontend): localize Person names and render via active locale

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] **Automated:** from `src/frontend`, `npm test` → all specs green; `npm run build` → `vue-tsc` typecheck + `vite build` succeed, no errors/warnings.
- [ ] **Live smoke (frontend + backend together):**
  1. Start the backend: from repo root, `dotnet run --project src/backend/FamilyTree.Api` (serves `http://localhost:5037`).
  2. Start the frontend dev server: from `src/frontend`, `npm run dev` (serves `http://localhost:5173`; it proxies `/api` → `5037`).
  3. In the browser: a slim **app bar** spans the top (brand on the left; the picker on the right showing the current flag + native name), with the oak filling the area below it. Switching to **English** / **Русский** / **Беларуская** updates the node names **instantly** (no reload, no refetch) and updates the bar title + loading/error copy. Reload the page → the chosen language persists (localStorage `familytree.locale`); `<html lang>` matches.
  4. Stop both servers.
- [ ] **Spec checks:** flags render as SVG (flag-icons), not emoji; year-axis labels are plain numbers (e.g. `1842`, never `1 842`); first visit with no stored choice follows `navigator.language` (ru/be/en) else `ru`.

---

## Plan self-review notes

- **Spec coverage (Plan B scope):** §4 UI i18n → Task 2 (vue-i18n + catalogs, `fallbackLocale:'ru'`) + Task 4 (TreeView strings); year-axis plain numbers already satisfied (no change, noted). §5 data i18n → Task 1 (`LocalizedText` type + `localize` helper) + Task 5 (types flipped, OakTree renders via `localize`). §6 picker → Task 3 (`useLocale` store: locale, ordered options, `setLocale`, detection, persistence) + Task 4 (flag picker in a slim top **app bar** — chosen Option B placement — `flag-icons` gb/ru/by, keyboard-accessible `aria-label`, instant re-render; the bar is the global home that search/directory join later). §2 resolution/persistence → Task 2/3 (`familytree.locale`, navigator detection, `ru` default, `<html lang>`, fallback chain). §8 testing → `localize` fallback incl. null→'' (Task 1), `useLocale` store detect/persist/setLocale (Task 3), picker renders 3 + switching updates locale (Task 4), node name changes with locale (Task 5).
- **Out of scope (deferred per spec §9):** URL-carried locale; localized date formatting in the member popup; localized `vocation`/`sex` enum labels and the member popup itself (frontend interactions phase). Surname/maidenName/summary/biography are not currently rendered anywhere, so they are typed as `LocalizedText` (Task 5) but no new rendering is added for them here.
- **Type consistency:** `Locale` (Task 1) is the type used by `localize` (Task 1), `localeDetection` (Task 2), `localeStore`/`LOCALE_OPTIONS` (Task 1/3), the picker (Task 4), and OakTree (Task 5). `LocalizedText {ru,be,en: string|null}` (Task 1) is what `PersonSummary` carries (Task 5), what `localize` consumes (Task 1), and what every test mock builds (Tasks 4/5). The store's `setLocale`/`currentLocale`/`options`/`currentOption` names are identical across store, picker, and OakTree.
- **Green at every boundary:** Tasks 1–3 are additive (new files only, plus a non-breaking type addition); Task 4 wires i18n/picker without touching data types; Task 5 flips the data types and updates all consumers + mocks together. `npm run build` (vue-tsc) is run at Tasks 4 and 5 to catch type regressions.
- **No backend changes**; the API already emits `{ru,be,en}` (Plan A, merged). The dev proxy (`/api` → `5037`) is pre-existing.
