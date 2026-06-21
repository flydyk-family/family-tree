# Biography Editor UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline, popup-only biography editor that lets signed-in editors edit a person's three-locale biography and save it via the existing `PUT /api/people/{id}/biography`, reflecting the result in the UI.

**Architecture:** A new controlled `BiographyEditor.vue` (tabbed ru/be/en textareas with a resilient buffer) is rendered inside `PersonDossier.vue` in place of the read-only `ChroniclePager` while editing. `PersonDossier` gains an `editable` prop (set only by `PersonPopup`) and gates the Edit affordance behind `editable && authStore.canEdit`. Saving calls a new `biographyApi.putBiography` client; on a confirmed 200 the returned `PersonDetail` is pushed into `selectionStore` via a new `applyDetail` action, so both the popup and the rail (which read from the same cache) update.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), Pinia (options stores), vue-i18n, scoped SCSS with `var(--token)` design tokens, Vitest + `@vue/test-utils`.

## Global Constraints

- Frontend root is `src/frontend`; run all npm commands from there. Tests: `npm test` (= `vitest run`). Type-check + build: `npm run build` (= `vue-tsc -b && vite build`).
- Vue components use `<script setup lang="ts">`; Pinia uses the **options** store style; styles are **scoped SCSS** using existing `var(--token)` tokens from `src/styles/tokens.scss` (do not hard-code colours).
- Every interactive element gets a `data-test` attribute. Tests are TDD (test first, watch it fail, then implement).
- i18n **key parity across en/ru/be is enforced** by `src/frontend/src/i18n/messages/messages.spec.ts` — every new key must exist in all three catalogs with the same path.
- Auth calls send the session cookie and **no Authorization header**: use `credentials: 'include'`.
- The biography PUT has **replace-all** semantics — it replaces the entire biography value, so always submit all three locales you want to keep.
- Git: branch is already `claude/angry-hamilton-a1880a` off `main`. Commit per task. Do **not** self-merge; open a PR into `main` at the end (owner reviews + squash-merges).

---

## File Structure

- **Create** `src/frontend/src/api/biographyApi.ts` — `putBiography(personId, biography, baseUrl?)` cookie-aware PUT client.
- **Create** `src/frontend/src/api/biographyApi.spec.ts` — its unit test.
- **Create** `src/frontend/src/components/BiographyEditor.vue` — the tabbed editor component.
- **Create** `src/frontend/src/components/BiographyEditor.spec.ts` — its component test.
- **Modify** `src/frontend/src/stores/selectionStore.ts` — add `applyDetail` action.
- **Modify** `src/frontend/src/stores/selectionStore.spec.ts` — test `applyDetail`.
- **Modify** `src/frontend/src/components/PersonDossier.vue` — `editable` prop, auth gate, edit button, empty-state, edit-mode wiring.
- **Modify** `src/frontend/src/components/PersonDossier.spec.ts` — new editor-affordance tests.
- **Modify** `src/frontend/src/components/PersonPopup.vue` — pass `editable` to `PersonDossier`.
- **Modify** `src/frontend/src/components/PersonPopup.spec.ts` — editor-visibility tests.
- **Modify** `src/frontend/src/i18n/messages/{en,ru,be}.ts` — new `editor` namespace.
- **Modify** `src/frontend/src/i18n/messages/messages.spec.ts` — assert the new keys exist.
- **Modify** docs: `docs/reference/features/person-details.md`, `docs/reference/roadmap.md`, `CLAUDE.md`.

---

## Task 1: i18n `editor` namespace

**Files:**
- Modify: `src/frontend/src/i18n/messages/en.ts`
- Modify: `src/frontend/src/i18n/messages/ru.ts`
- Modify: `src/frontend/src/i18n/messages/be.ts`
- Test: `src/frontend/src/i18n/messages/messages.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: i18n keys `editor.{edit,add,empty,save,cancel,saving,saveFailed,requireOne,confirmBlank,confirmDiscard,keepEditing,saveAnyway,discard}` in all three catalogs. `editor.confirmBlank` takes a `{locales}` parameter.

- [ ] **Step 1: Extend the parity test to require the new keys**

In `src/frontend/src/i18n/messages/messages.spec.ts`, inside the second `it('include the person popup labels', …)` loop, add these assertions after the existing `auth.*` ones:

```ts
      expect(keys).toContain('editor.edit');
      expect(keys).toContain('editor.add');
      expect(keys).toContain('editor.empty');
      expect(keys).toContain('editor.save');
      expect(keys).toContain('editor.cancel');
      expect(keys).toContain('editor.saving');
      expect(keys).toContain('editor.saveFailed');
      expect(keys).toContain('editor.requireOne');
      expect(keys).toContain('editor.confirmBlank');
      expect(keys).toContain('editor.confirmDiscard');
      expect(keys).toContain('editor.keepEditing');
      expect(keys).toContain('editor.saveAnyway');
      expect(keys).toContain('editor.discard');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- messages.spec`
Expected: FAIL — the `editor.*` keys are missing (and the parity test fails because no catalog has them).

- [ ] **Step 3: Add the `editor` block to all three catalogs**

In `src/frontend/src/i18n/messages/en.ts`, add this key as the last entry of the top-level object (add a comma after the current last `auth: { … }` entry):

```ts
  editor: {
    edit: 'Edit biography',
    add: 'Add biography',
    empty: 'No biography yet.',
    save: 'Save',
    cancel: 'Cancel',
    saving: 'Saving…',
    saveFailed: 'Could not save. Your text is kept — try again.',
    requireOne: 'Enter a biography in at least one language.',
    confirmBlank: 'This will remove the biography in: {locales}. Save anyway?',
    confirmDiscard: 'Discard your unsaved changes?',
    keepEditing: 'Keep editing',
    saveAnyway: 'Save anyway',
    discard: 'Discard'
  }
```

In `src/frontend/src/i18n/messages/ru.ts`, likewise:

```ts
  editor: {
    edit: 'Редактировать биографию',
    add: 'Добавить биографию',
    empty: 'Биографии пока нет.',
    save: 'Сохранить',
    cancel: 'Отмена',
    saving: 'Сохранение…',
    saveFailed: 'Не удалось сохранить. Ваш текст сохранён — попробуйте ещё раз.',
    requireOne: 'Введите биографию хотя бы на одном языке.',
    confirmBlank: 'Это удалит биографию на: {locales}. Всё равно сохранить?',
    confirmDiscard: 'Отменить несохранённые изменения?',
    keepEditing: 'Продолжить',
    saveAnyway: 'Всё равно сохранить',
    discard: 'Отменить'
  }
```

In `src/frontend/src/i18n/messages/be.ts`, likewise:

```ts
  editor: {
    edit: 'Рэдагаваць біяграфію',
    add: 'Дадаць біяграфію',
    empty: 'Біяграфіі пакуль няма.',
    save: 'Захаваць',
    cancel: 'Адмена',
    saving: 'Захаванне…',
    saveFailed: 'Не ўдалося захаваць. Ваш тэкст захаваны — паспрабуйце яшчэ раз.',
    requireOne: 'Увядзіце біяграфію хаця б на адной мове.',
    confirmBlank: 'Гэта выдаліць біяграфію на: {locales}. Усё роўна захаваць?',
    confirmDiscard: 'Скасаваць незахаваныя змены?',
    keepEditing: 'Працягнуць',
    saveAnyway: 'Усё роўна захаваць',
    discard: 'Скасаваць'
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- messages.spec`
Expected: PASS — parity holds and all `editor.*` keys are present.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/i18n/messages
git commit -m "Add editor i18n strings (en/ru/be) for the biography editor"
```

---

## Task 2: `biographyApi.putBiography` client

**Files:**
- Create: `src/frontend/src/api/biographyApi.ts`
- Test: `src/frontend/src/api/biographyApi.spec.ts`

**Interfaces:**
- Consumes: `LocalizedText`, `PersonDetail` from `../types/family`.
- Produces: `putBiography(personId: string, biography: LocalizedText, baseUrl?: string): Promise<PersonDetail>` — PUTs to `/api/people/{personId}/biography` with `credentials: 'include'`; resolves to the parsed `PersonDetail` on 200; throws on a non-OK response.

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/api/biographyApi.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { putBiography } from './biographyApi';
import type { LocalizedText, PersonDetail } from '../types/family';

afterEach(() => { vi.restoreAllMocks(); });

const payload: LocalizedText = { ru: 'Жизнеописание', be: null, en: 'A life.' };
const updated = { id: 'p-0016', biography: payload } as unknown as PersonDetail;

describe('putBiography', () => {
  it('PUTs the biography with credentials and returns the updated person', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => updated });
    vi.stubGlobal('fetch', fetchMock);

    const result = await putBiography('p-0016', payload);

    expect(fetchMock).toHaveBeenCalledWith('/api/people/p-0016/biography', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    expect(result).toEqual(updated);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(putBiography('p-0016', payload)).rejects.toThrow('403');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- biographyApi`
Expected: FAIL — `./biographyApi` cannot be resolved.

- [ ] **Step 3: Write the implementation**

Create `src/frontend/src/api/biographyApi.ts`:

```ts
import type { LocalizedText, PersonDetail } from '../types/family';

// Sends the session cookie (HttpOnly, browser-owned) and no Authorization header —
// the same convention as authApi. Throwing on a non-OK response is what lets the
// editor keep the user's text and offer a retry rather than losing it.
export async function putBiography(
  personId: string,
  biography: LocalizedText,
  baseUrl = ''
): Promise<PersonDetail> {
  const response = await fetch(`${baseUrl}/api/people/${personId}/biography`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(biography)
  });
  if (!response.ok) {
    throw new Error(`Failed to save biography: ${response.status}`);
  }
  return (await response.json()) as PersonDetail;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- biographyApi`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/api/biographyApi.ts src/frontend/src/api/biographyApi.spec.ts
git commit -m "Add putBiography API client for the biography editor"
```

---

## Task 3: `selectionStore.applyDetail` action

**Files:**
- Modify: `src/frontend/src/stores/selectionStore.ts`
- Test: `src/frontend/src/stores/selectionStore.spec.ts`

**Interfaces:**
- Consumes: `PersonDetail`, the store's existing `cache`, `detail`, `selectedId`.
- Produces: `applyDetail(detail: PersonDetail): void` — writes `cache[detail.id] = detail` and, when `selectedId === detail.id`, also sets the live `detail`.

- [ ] **Step 1: Write the failing tests**

Add to `src/frontend/src/stores/selectionStore.spec.ts` inside the `describe('selectionStore', …)` block:

```ts
  it('applyDetail updates the cache and the live detail for the selected person', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail);
    const store = useSelectionStore();
    await store.open('p-0016');

    const next = { id: 'p-0016', vocation: 'writer' } as unknown as PersonDetail;
    store.applyDetail(next);

    expect(store.cache['p-0016']).toEqual(next);
    expect(store.detail).toEqual(next);
  });

  it('applyDetail updates the cache but leaves the live detail when another person is selected', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail);
    const store = useSelectionStore();
    await store.open('p-0016');

    const otherUpdate = { id: 'p-0042', vocation: 'farmer' } as unknown as PersonDetail;
    store.applyDetail(otherUpdate);

    expect(store.cache['p-0042']).toEqual(otherUpdate);
    expect(store.detail).toEqual(detail);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- selectionStore`
Expected: FAIL — `store.applyDetail is not a function`.

- [ ] **Step 3: Add the action**

In `src/frontend/src/stores/selectionStore.ts`, add this action inside the `actions: { … }` object (e.g. after `close()`):

```ts
    // Replace a cached person with an authoritative server copy (e.g. after a
    // biography save). Both the popup (reads `detail`) and the rail (reads
    // `cache[id]`) render from this store, so updating here reflects everywhere.
    applyDetail(detail: PersonDetail): void {
      this.cache[detail.id] = detail;
      if (this.selectedId === detail.id) {
        this.detail = detail;
      }
    },
```

(`PersonDetail` is already imported at the top of the file.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- selectionStore`
Expected: PASS (all cases, including the existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/stores/selectionStore.ts src/frontend/src/stores/selectionStore.spec.ts
git commit -m "Add selectionStore.applyDetail to reflect saved person updates"
```

---

## Task 4: `BiographyEditor.vue` component

**Files:**
- Create: `src/frontend/src/components/BiographyEditor.vue`
- Test: `src/frontend/src/components/BiographyEditor.spec.ts`

**Interfaces:**
- Consumes: `putBiography` (Task 2); `LOCALE_OPTIONS`, `Locale` from `../constants/locales`; `LocalizedText`, `PersonDetail` from `../types/family`; the `editor.*` i18n keys (Task 1).
- Produces: a component with props `{ personId: string; biography: LocalizedText | null }` that emits `saved(detail: PersonDetail)` and `cancel()`. Renders `data-test` hooks: `bio-editor`, `bio-tab-ru|be|en`, `bio-input`, `bio-require`, `bio-error`, `bio-save`, `bio-cancel`, `bio-confirm`, `bio-confirm-accept`, `bio-confirm-cancel`.

**Behaviour notes (encoded by the tests below):**
- Three buffers seeded from `biography` (null → `''`), never cleared on save failure.
- Tabs ru → be → en; the active tab's textarea is editable; each tab shows a filled dot when its buffer has non-whitespace text.
- Save trims every locale (`'' → null`) and submits **all three**. Save is disabled and `editor.requireOne` shows when all three are empty.
- If saving would blank a locale that was non-empty in the original `biography`, an inline blank-confirm appears first; confirming proceeds with the save.
- A failed save sets `editor.saveFailed`, keeps the buffers, and re-enables Save for retry.
- Cancel emits immediately when clean; when dirty it shows an inline discard-confirm first.

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/components/BiographyEditor.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import { useLocaleStore } from '../stores/localeStore';
import type { LocalizedText, PersonDetail } from '../types/family';

vi.mock('../api/biographyApi', () => ({ putBiography: vi.fn() }));
import { putBiography } from '../api/biographyApi';
import BiographyEditor from './BiographyEditor.vue';

const bio: LocalizedText = { ru: 'Русский текст', be: null, en: 'English text' };
const updated = { id: 'p-0016', biography: bio } as unknown as PersonDetail;

function mountEditor(biography: LocalizedText | null = bio) {
  return mount(BiographyEditor, {
    props: { personId: 'p-0016', biography },
    global: { plugins: [i18n] }
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  vi.mocked(putBiography).mockReset();
});

describe('BiographyEditor', () => {
  it('seeds the active (ru) textarea from the biography', () => {
    const w = mountEditor();
    expect((w.find('[data-test="bio-input"]').element as HTMLTextAreaElement).value).toBe('Русский текст');
  });

  it('switches the textarea content when another tab is selected', async () => {
    const w = mountEditor();
    await w.find('[data-test="bio-tab-en"]').trigger('click');
    expect((w.find('[data-test="bio-input"]').element as HTMLTextAreaElement).value).toBe('English text');
  });

  it('marks tabs that have text with a filled dot', () => {
    const w = mountEditor();
    expect(w.find('[data-test="bio-tab-ru"] .bio-editor__dot--filled').exists()).toBe(true);
    expect(w.find('[data-test="bio-tab-en"] .bio-editor__dot--filled').exists()).toBe(true);
    expect(w.find('[data-test="bio-tab-be"] .bio-editor__dot--filled').exists()).toBe(false);
  });

  it('disables Save and shows the require-one hint when every locale is empty', () => {
    const w = mountEditor({ ru: null, be: null, en: null });
    expect((w.find('[data-test="bio-save"]').element as HTMLButtonElement).disabled).toBe(true);
    expect(w.find('[data-test="bio-require"]').exists()).toBe(true);
  });

  it('saves all locales (trimmed; empty → null) and emits saved with the server detail', async () => {
    vi.mocked(putBiography).mockResolvedValue(updated);
    const w = mountEditor({ ru: 'Текст', be: null, en: null });

    await w.find('[data-test="bio-save"]').trigger('click');
    await Promise.resolve();

    expect(putBiography).toHaveBeenCalledWith('p-0016', { ru: 'Текст', be: null, en: null });
    expect(w.emitted('saved')?.[0]).toEqual([updated]);
  });

  it('keeps the buffer and shows an error when the save fails, then retries', async () => {
    vi.mocked(putBiography).mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce(updated);
    const w = mountEditor({ ru: 'Текст', be: null, en: null });

    await w.find('[data-test="bio-save"]').trigger('click');
    await Promise.resolve();
    await Promise.resolve();

    expect(w.find('[data-test="bio-error"]').exists()).toBe(true);
    expect((w.find('[data-test="bio-input"]').element as HTMLTextAreaElement).value).toBe('Текст');
    expect(w.emitted('saved')).toBeUndefined();

    await w.find('[data-test="bio-save"]').trigger('click');
    await Promise.resolve();
    expect(w.emitted('saved')?.[0]).toEqual([updated]);
  });

  it('confirms before blanking a previously non-empty locale, then saves on accept', async () => {
    vi.mocked(putBiography).mockResolvedValue(updated);
    const w = mountEditor(); // ru + en have text
    // Clear the en buffer via its tab.
    await w.find('[data-test="bio-tab-en"]').trigger('click');
    await w.find('[data-test="bio-input"]').setValue('');

    await w.find('[data-test="bio-save"]').trigger('click');
    // Blank-confirm shown; no save yet.
    expect(w.find('[data-test="bio-confirm"]').exists()).toBe(true);
    expect(putBiography).not.toHaveBeenCalled();

    await w.find('[data-test="bio-confirm-accept"]').trigger('click');
    await Promise.resolve();
    expect(putBiography).toHaveBeenCalledWith('p-0016', { ru: 'Русский текст', be: null, en: null });
  });

  it('emits cancel immediately when nothing changed', async () => {
    const w = mountEditor();
    await w.find('[data-test="bio-cancel"]').trigger('click');
    expect(w.emitted('cancel')).toHaveLength(1);
  });

  it('confirms before discarding when the buffer is dirty', async () => {
    const w = mountEditor();
    await w.find('[data-test="bio-input"]').setValue('changed');

    await w.find('[data-test="bio-cancel"]').trigger('click');
    expect(w.find('[data-test="bio-confirm"]').exists()).toBe(true);
    expect(w.emitted('cancel')).toBeUndefined();

    await w.find('[data-test="bio-confirm-accept"]').trigger('click');
    expect(w.emitted('cancel')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- BiographyEditor`
Expected: FAIL — `./BiographyEditor.vue` cannot be resolved.

- [ ] **Step 3: Write the component**

Create `src/frontend/src/components/BiographyEditor.vue`:

```vue
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { LOCALE_OPTIONS, type Locale } from '../constants/locales';
import type { LocalizedText, PersonDetail } from '../types/family';
import { putBiography } from '../api/biographyApi';

const props = defineProps<{ personId: string; biography: LocalizedText | null }>();
const emit = defineEmits<{ saved: [detail: PersonDetail]; cancel: [] }>();
const { t } = useI18n({ useScope: 'global' });

// Editor tab order: ru primary, then be, en.
const TABS: Locale[] = ['ru', 'be', 'en'];
function localeName(code: Locale): string {
  return LOCALE_OPTIONS.find(option => option.code === code)?.nativeName ?? code;
}

// Resilient buffers, seeded from the current biography (null → ''). Never cleared
// on a failed save, so typed text is never lost.
const seed = (code: Locale): string => props.biography?.[code] ?? '';
const buffers = reactive<Record<Locale, string>>({ ru: seed('ru'), be: seed('be'), en: seed('en') });

const activeTab = ref<Locale>('ru');
const saving = ref(false);
const error = ref<string | null>(null);
const pendingConfirm = ref<'blank' | 'discard' | null>(null);

function hasText(code: Locale): boolean {
  return buffers[code].trim() !== '';
}
const allEmpty = computed(() => TABS.every(code => !hasText(code)));
const dirty = computed(() => TABS.some(code => buffers[code] !== seed(code)));

// Locales that had text originally but would be blanked by this save.
function blankedLocales(): Locale[] {
  return TABS.filter(code => (props.biography?.[code] ?? '').trim() !== '' && !hasText(code));
}
const blankedNames = computed(() => blankedLocales().map(localeName).join(', '));

function buildPayload(): LocalizedText {
  return {
    ru: buffers.ru.trim() || null,
    be: buffers.be.trim() || null,
    en: buffers.en.trim() || null
  };
}

async function save(): Promise<void> {
  if (allEmpty.value || saving.value) {
    return;
  }
  if (pendingConfirm.value !== 'blank' && blankedLocales().length > 0) {
    pendingConfirm.value = 'blank';
    return;
  }
  saving.value = true;
  error.value = null;
  try {
    const updated = await putBiography(props.personId, buildPayload());
    emit('saved', updated);
  } catch {
    error.value = t('editor.saveFailed');
  } finally {
    saving.value = false;
    pendingConfirm.value = null;
  }
}

function cancel(): void {
  if (dirty.value) {
    pendingConfirm.value = 'discard';
    return;
  }
  emit('cancel');
}

function acceptConfirm(): void {
  if (pendingConfirm.value === 'blank') {
    void save();
  } else {
    emit('cancel');
  }
}
function dismissConfirm(): void {
  pendingConfirm.value = null;
}
</script>

<template>
  <div class="bio-editor" data-test="bio-editor">
    <div class="bio-editor__tabs" role="tablist">
      <button
        v-for="code in TABS"
        :key="code"
        type="button"
        role="tab"
        class="bio-editor__tab"
        :class="{ 'bio-editor__tab--active': activeTab === code }"
        :aria-selected="activeTab === code"
        :data-test="`bio-tab-${code}`"
        @click="activeTab = code"
      >
        {{ localeName(code) }}
        <span class="bio-editor__dot" :class="{ 'bio-editor__dot--filled': hasText(code) }" aria-hidden="true" />
      </button>
    </div>

    <textarea v-model="buffers[activeTab]" class="bio-editor__input" data-test="bio-input" rows="6" />

    <p v-if="allEmpty" class="bio-editor__hint" data-test="bio-require">{{ t('editor.requireOne') }}</p>
    <p v-if="error" class="bio-editor__error" data-test="bio-error">{{ error }}</p>

    <div v-if="pendingConfirm" class="bio-editor__confirm" data-test="bio-confirm">
      <p class="bio-editor__confirm-msg">
        {{ pendingConfirm === 'blank'
          ? t('editor.confirmBlank', { locales: blankedNames })
          : t('editor.confirmDiscard') }}
      </p>
      <div class="bio-editor__actions">
        <button type="button" class="bio-editor__btn bio-editor__btn--ghost" data-test="bio-confirm-cancel" @click="dismissConfirm">
          {{ t('editor.keepEditing') }}
        </button>
        <button type="button" class="bio-editor__btn bio-editor__btn--warn" data-test="bio-confirm-accept" @click="acceptConfirm">
          {{ pendingConfirm === 'blank' ? t('editor.saveAnyway') : t('editor.discard') }}
        </button>
      </div>
    </div>

    <div v-else class="bio-editor__actions">
      <button type="button" class="bio-editor__btn bio-editor__btn--ghost" data-test="bio-cancel" @click="cancel">
        {{ t('editor.cancel') }}
      </button>
      <button type="button" class="bio-editor__btn bio-editor__btn--primary" data-test="bio-save" :disabled="allEmpty || saving" @click="save">
        {{ saving ? t('editor.saving') : t('editor.save') }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bio-editor { display: flex; flex-direction: column; gap: 10px; font-family: var(--font-body); }
.bio-editor__tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.bio-editor__tab {
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 14px; border-radius: 15px; cursor: pointer;
  border: 1px solid var(--glass-border); background: transparent; color: var(--ink-soft);
  font-family: var(--font-display); font-size: 13px; letter-spacing: 0.3px;
  &--active { border-color: var(--gilt); background: linear-gradient(var(--control-grad-top), var(--control-grad-bottom)); color: var(--gilt-deep); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
.bio-editor__dot {
  width: 6px; height: 6px; border-radius: 50%;
  border: 1px solid var(--ink-faint); background: transparent;
  &--filled { border-color: var(--leaf-deep); background: var(--leaf-deep); }
}
.bio-editor__input {
  width: 100%; box-sizing: border-box; resize: vertical; min-height: 120px;
  padding: 10px 12px; border: 1px solid var(--glass-border); border-radius: 8px;
  background: var(--field-bg); color: var(--ink);
  font-family: var(--font-body); font-size: 16px; line-height: 1.55;
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 1px; }
}
.bio-editor__hint { margin: 0; font-size: 14px; color: var(--ink-soft); }
.bio-editor__error { margin: 0; font-size: 14px; color: var(--umber); }
.bio-editor__confirm {
  border: 1px solid rgba(156, 90, 50, 0.35); background: rgba(156, 90, 50, 0.1);
  border-radius: 8px; padding: 10px 12px;
}
.bio-editor__confirm-msg { margin: 0 0 10px; font-size: 14px; color: var(--umber); line-height: 1.45; }
.bio-editor__actions { display: flex; justify-content: flex-end; gap: 10px; }
.bio-editor__btn {
  height: 32px; padding: 0 16px; border-radius: 8px; cursor: pointer;
  font-family: var(--font-display); font-size: 14px; letter-spacing: 0.3px;
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  &--ghost { border: none; background: transparent; color: var(--ink-soft); font-family: var(--font-body); &:hover { background: var(--btn-hover); } }
  &--primary { border: 1px solid var(--leaf-deep); background: var(--leaf-deep); color: var(--on-accent); &:disabled { opacity: 0.45; cursor: default; } }
  &--warn { border: 1px solid var(--umber); background: var(--umber); color: var(--on-accent); }
}
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- BiographyEditor`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/BiographyEditor.vue src/frontend/src/components/BiographyEditor.spec.ts
git commit -m "Add BiographyEditor: tabbed three-locale editor with resilient save"
```

---

## Task 5: Wire the editor into `PersonDossier.vue`

**Files:**
- Modify: `src/frontend/src/components/PersonDossier.vue`
- Test: `src/frontend/src/components/PersonDossier.spec.ts`

**Interfaces:**
- Consumes: `BiographyEditor` (Task 4); `useAuthStore` (`authStore.canEdit`); `useSelectionStore` (`applyDetail`, Task 3); `editor.*` i18n keys (Task 1).
- Produces: `PersonDossier` accepts a new `editable?: boolean` prop (default `false`). When `editable && authStore.canEdit`, it renders the biography section (even when empty) with an icon-only gilt circle Edit button (`data-test="bio-edit"`) that opens `BiographyEditor` inline.

- [ ] **Step 1: Write the failing tests**

Add to `src/frontend/src/components/PersonDossier.spec.ts`. First extend the imports at the top:

```ts
import { useAuthStore } from '../stores/authStore';
import { useSelectionStore } from '../stores/selectionStore';
import BiographyEditor from './BiographyEditor.vue';
```

Then add a helper below the existing `mountWith` function:

```ts
function mountEditable(detail: PersonDetail, canEdit = true) {
  useAuthStore().canEdit = canEdit;
  return mount(PersonDossier, {
    props: { detail, editable: true },
    global: { plugins: [i18n], stubs: { teleport: true } }
  });
}
```

Then add these tests inside `describe('PersonDossier', …)`:

```ts
  it('shows the edit button for an editor in editable mode', () => {
    const w = mountEditable(base, true);
    expect(w.find('[data-test="bio-edit"]').exists()).toBe(true);
  });

  it('hides the edit button when not editable, even for an editor', () => {
    useAuthStore().canEdit = true;
    const w = mountWith(base); // editable defaults to false
    expect(w.find('[data-test="bio-edit"]').exists()).toBe(false);
  });

  it('hides the edit button for a non-editor in editable mode', () => {
    const w = mountEditable(base, false);
    expect(w.find('[data-test="bio-edit"]').exists()).toBe(false);
  });

  it('shows an add affordance and empty text for an editor when the biography is empty', () => {
    const w = mountEditable({ ...base, biography: { ru: null, be: null, en: null } }, true);
    expect(w.find('[data-test="biography"]').exists()).toBe(true);
    expect(w.find('[data-test="bio-edit"]').attributes('aria-label')).toBe('Add biography');
    expect(w.find('.dossier__empty').text()).toContain('No biography yet.');
  });

  it('opens the inline editor when the edit button is clicked', async () => {
    const w = mountEditable(base, true);
    await w.find('[data-test="bio-edit"]').trigger('click');
    expect(w.find('[data-test="bio-input"]').exists()).toBe(true);
    expect(w.find('[data-test="bio-edit"]').exists()).toBe(false);
  });

  it('applies a saved detail to the selection store and exits edit mode', async () => {
    const w = mountEditable(base, true);
    await w.find('[data-test="bio-edit"]').trigger('click');

    const next = { ...base, biography: { ru: null, be: null, en: 'Updated.' } } as PersonDetail;
    w.findComponent(BiographyEditor).vm.$emit('saved', next);
    await w.vm.$nextTick();

    expect(useSelectionStore().cache['p-0016']).toEqual(next);
    expect(w.find('[data-test="bio-input"]').exists()).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- PersonDossier`
Expected: FAIL — `data-test="bio-edit"` does not exist (the dossier has no editable mode yet).

- [ ] **Step 3: Update the component script**

In `src/frontend/src/components/PersonDossier.vue`, change the first import line from:

```ts
import { computed } from 'vue';
```

to:

```ts
import { computed, ref } from 'vue';
```

Add these imports below the existing `import ChroniclePager from './ChroniclePager.vue';` line:

```ts
import BiographyEditor from './BiographyEditor.vue';
import { useAuthStore } from '../stores/authStore';
import { useSelectionStore } from '../stores/selectionStore';
```

Replace the props/setup lines:

```ts
const props = defineProps<{ detail: PersonDetail }>();
const { t, te } = useI18n({ useScope: 'global' });
const localeStore = useLocaleStore();
```

with:

```ts
const props = defineProps<{ detail: PersonDetail; editable?: boolean }>();
const { t, te } = useI18n({ useScope: 'global' });
const localeStore = useLocaleStore();
const auth = useAuthStore();
const selection = useSelectionStore();

const editing = ref(false);
const canEdit = computed(() => props.editable === true && auth.canEdit);

function onSaved(updated: PersonDetail): void {
  selection.applyDetail(updated);
  editing.value = false;
}
```

- [ ] **Step 4: Update the biography section template**

In the same file, replace this block:

```html
    <section v-if="biographyText" class="dossier__block" data-cascade data-test="biography">
      <h3 class="dossier__title">{{ t('person.biography') }}</h3>
      <ChroniclePager :text="biographyText" />
    </section>
```

with:

```html
    <section v-if="canEdit || biographyText" class="dossier__block" data-cascade data-test="biography">
      <div class="dossier__bio-head">
        <h3 class="dossier__title">{{ t('person.biography') }}</h3>
        <button
          v-if="canEdit && !editing"
          type="button"
          class="dossier__edit"
          data-test="bio-edit"
          :aria-label="biographyText ? t('editor.edit') : t('editor.add')"
          @click="editing = true"
        >
          <svg v-if="biographyText" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          <svg v-else width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
      <BiographyEditor
        v-if="editing"
        :person-id="detail.id"
        :biography="detail.biography"
        @saved="onSaved"
        @cancel="editing = false"
      />
      <ChroniclePager v-else-if="biographyText" :text="biographyText" />
      <p v-else class="dossier__empty">{{ t('editor.empty') }}</p>
    </section>
```

- [ ] **Step 5: Add the styles**

In the same file's `<style scoped lang="scss">` block, add:

```scss
.dossier__bio-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.dossier__bio-head .dossier__title { margin: 0; }
.dossier__edit {
  flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
  border: 1px solid var(--gilt); background: linear-gradient(var(--control-grad-top), var(--control-grad-bottom));
  color: var(--gilt-deep); display: grid; place-items: center;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
.dossier__empty { margin: 0; font-style: italic; color: var(--ink-faint); }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- PersonDossier`
Expected: PASS — new editor tests pass and the existing dossier tests (which never pass `editable`) are unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/PersonDossier.vue src/frontend/src/components/PersonDossier.spec.ts
git commit -m "Wire the inline biography editor into PersonDossier (editor-gated)"
```

---

## Task 6: Enable editing in the popup (`PersonPopup.vue`)

**Files:**
- Modify: `src/frontend/src/components/PersonPopup.vue`
- Test: `src/frontend/src/components/PersonPopup.spec.ts`

**Interfaces:**
- Consumes: the `editable` prop on `PersonDossier` (Task 5); `authStore.canEdit`.
- Produces: the bigger-view popup renders the dossier with `editable` so editors see the Edit affordance there (and only there — the rail keeps the default `editable=false`).

- [ ] **Step 1: Write the failing tests**

Add to `src/frontend/src/components/PersonPopup.spec.ts`. Extend the imports:

```ts
import { useAuthStore } from '../stores/authStore';
```

Add these tests inside `describe('PersonPopup (bigger-view modal)', …)`:

```ts
  it('shows the biography edit button for a signed-in editor', () => {
    useAuthStore().canEdit = true;
    const w = mountModal();
    expect(w.find('[data-test="bio-edit"]').exists()).toBe(true);
  });

  it('hides the biography edit button for an anonymous viewer', () => {
    const w = mountModal(); // canEdit defaults to false
    expect(w.find('[data-test="bio-edit"]').exists()).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- PersonPopup`
Expected: FAIL — the editor button test fails because the popup does not pass `editable` yet.

- [ ] **Step 3: Pass `editable` to the dossier**

In `src/frontend/src/components/PersonPopup.vue`, change:

```html
            <PersonDossier :detail="detail" />
```

to:

```html
            <PersonDossier :detail="detail" editable />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- PersonPopup`
Expected: PASS (new and existing cases).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/PersonPopup.vue src/frontend/src/components/PersonPopup.spec.ts
git commit -m "Enable inline biography editing in the bigger-view popup"
```

---

## Task 7: Documentation

**Files:**
- Modify: `docs/reference/features/person-details.md`
- Modify: `docs/reference/roadmap.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing (prose).
- Produces: docs that describe the shipped editor and remove "not yet built" notes.

- [ ] **Step 1: Update the person-details feature doc**

In `docs/reference/features/person-details.md`, add a subsection documenting the biography editor (adapt wording to the file's existing style). Cover: it appears only in the bigger-view popup, only for signed-in editors (`canEdit`); a gilt circle Edit/Add button in the biography section header opens an inline tabbed editor (ru/be/en) with per-tab content dots; Save submits all three locales (replace-all) via `PUT /api/people/{id}/biography`; a failed save keeps the text and offers retry; clearing a previously-filled locale or cancelling with unsaved changes prompts an inline confirm; on success the popup and rail reflect the new biography. Example anchor text:

```markdown
### Editing a biography (signed-in editors)

Editors (`authStore.canEdit`) see an Edit control in the biography section of the
bigger-view popup — a gilt circle button (pencil when a biography exists, plus when
empty). It opens an inline editor with one tab per locale (Русский / Беларуская /
English, ru first); a dot marks tabs that contain text. Save submits **all three**
locales at once (the API replaces the whole biography), persisting via
`PUT /api/people/{id}/biography`. The buffer survives a failed save (an inline error
offers retry); clearing a previously-filled locale, or cancelling with unsaved
changes, asks for confirmation first. On success the popup and rail update in place.
The rail panels themselves stay read-only.
```

- [ ] **Step 2: Update the roadmap**

In `docs/reference/roadmap.md`, move the biography-editing UI from planned/not-built to shipped (edit the relevant line to reflect that the in-app editor now exists; if there is a "done"/"shipped" section, move it there).

- [ ] **Step 3: Update the project overview**

In `CLAUDE.md`, replace the sentence in the project overview that reads (approximately):

> The **biography editing UI** (in-app editor calling `PUT /api/people/{id}/biography`) is the remaining frontend piece — a later PR.

with:

> The **biography editing UI** is shipped: signed-in editors edit the localized biography inline in the bigger-view popup (tabbed ru/be/en editor with resilient save) via `PUT /api/people/{id}/biography`.

- [ ] **Step 4: Commit**

```bash
git add docs/reference/features/person-details.md docs/reference/roadmap.md CLAUDE.md
git commit -m "Document the shipped in-app biography editor"
```

---

## Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full frontend test suite**

Run (from `src/frontend`): `npm test`
Expected: PASS — all suites green, including the existing ones.

- [ ] **Step 2: Type-check and build**

Run (from `src/frontend`): `npm run build`
Expected: `vue-tsc` reports no type errors and the production build completes.

- [ ] **Step 3: Manual smoke (optional, requires the Google client ID)**

Per `docs/ci-cd/google-signin-setup.md`, run `node scripts/dev.mjs`, sign in as an allow-listed editor, open a person's bigger-view popup, edit a biography across locales, and confirm the change persists and reflects after save. (Unit/component tests already cover the logic; this validates the real auth path.)

- [ ] **Step 4: Open the PR**

The `gh pr create` PreToolUse hook will prompt the `update-docs-for-pr` skill — run it to confirm docs are in sync (they were updated in Task 7). Open the PR into `main`; do **not** self-merge.

```bash
git push -u origin claude/angry-hamilton-a1880a
gh pr create --base main --title "Add the in-app biography editor UI" --body "<summary + test notes>"
```

---

## Self-Review

**Spec coverage:**
- Edit affordance gated by `canEdit`, popup-only → Tasks 5 (gate, `editable` prop) + 6 (popup passes `editable`); rail untouched (default `editable=false`). ✓
- Edit all three locales, save via PUT → Tasks 2 (`putBiography`) + 4 (editor submits all three). ✓
- Resilient save (buffer kept until confirmed 200) → Task 4 (failure keeps buffer + retry test). ✓
- Reflect updated biography on success → Task 3 (`applyDetail`) + Task 5 (`onSaved`). ✓
- New i18n strings in ru/be/en → Task 1. ✓
- Tabs with content dots, ru primary → Task 4. ✓
- Confirm-before-blank + block fully-empty → Task 4 (blank-confirm test; `requireOne` + disabled Save test). ✓
- Confirm-if-dirty Cancel → Task 4 (discard-confirm test). ✓
- Edit button look/placement (gilt circle in section header, pencil/plus) → Task 5. ✓
- Empty-biography add affordance for editors → Task 5 (empty-state test). ✓
- Docs in same PR → Task 7. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands include expected output. ✓

**Type consistency:** `putBiography(personId, biography, baseUrl?)` returns `PersonDetail` (Tasks 2, 4); `applyDetail(detail: PersonDetail)` (Tasks 3, 5); `BiographyEditor` props `{ personId, biography }` and emits `saved(PersonDetail)` / `cancel` (Tasks 4, 5); `editable?: boolean` prop on `PersonDossier` (Tasks 5, 6). Names align across tasks. ✓
