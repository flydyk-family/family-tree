# Unified Photo Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the popup's three photo blocks (read-only gallery strip + portrait block + gallery block) with one unified `PersonPhotos.vue` grid where the portrait is a flagged photo, each image carries on-image set-as-portrait/remove actions, an Add tile lives in the grid, and visitors get the same grid read-only.

**Architecture:** Frontend-only. A new `PersonPhotos.vue` composes a single ordered list `[portrait?, ...gallery]` from the existing `PersonDetail` and drives the existing `photosApi` (`promote`/`delete`/upload). It replaces `GalleryViewer.vue` + `PhotoManager.vue`, mounted once in `PersonDossier.vue`. No backend, API, or DTO change; no data migration.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Pinia, vue-i18n, Vitest + @vue/test-utils, SCSS design tokens.

## Global Constraints

- **Frontend conventions:** `<script setup lang="ts">`; TSDoc/inline comments concise; reuse SCSS design tokens (`var(--gilt)`, `var(--glass-border)`, `var(--leaf-deep)`, `var(--umber)`, `var(--ink-soft)`, `var(--parchment-2)`, `var(--control-hover)`, `var(--gilt-deep)`, `var(--on-accent)`); sentence-case UI copy; buttons/inputs carry `aria-label`s.
- **No backend changes.** Reuse `photosApi.ts` (`uploadPhoto(id, file, 'portrait'|'gallery')`, `deletePortrait(id)`, `deleteGalleryPhoto(id, photoId)`, `promoteGalleryPhoto(id, photoId)`), `resolveMediaUrl`, `MediaLightbox.vue` (has an `initialIndex?: number` prop), the DTO, and `PersonHeader.vue` (unchanged).
- **Seed-vs-uploaded rule:** a value containing `/` is an uploaded `uploads/…` key; a bare filename is a seed asset. The portrait is removable only when its key contains `/`.
- **Resilient save UX** (mirror `BiographyEditor`/old `PhotoManager`): a `busy` ref disables controls during a request; failures show `data-test="photo-error"` and never lose state; success emits `updated(PersonDetail)`, applied by `PersonDossier` via `useSelectionStore().applyDetail`.
- **i18n parity:** `src/frontend/src/i18n/messages/{en,ru,be}.ts` must stay structurally identical — `messages.spec.ts` enforces it. Any key added/removed happens in all three.
- **Tests:** Vitest; mock `../api/photosApi`; mount with `global: { plugins: [i18n], stubs: { teleport: true } }`; `i18n` is imported from `../i18n`. Use the file-input trick `Object.defineProperty(input.element, 'files', { value: [file] }); await input.trigger('change')`.
- **Run from `src/frontend`:** `npm test`, `npm run build`. Commit frequently.

---

## File Structure

- **Create** `src/frontend/src/components/PersonPhotos.vue` — the unified grid (read-only + editor), Add tile, inline delete-confirm, busy/error state, lightbox. One responsibility: present and manage a person's photos.
- **Create** `src/frontend/src/components/PersonPhotos.spec.ts` — unit tests.
- **Modify** `src/frontend/src/i18n/messages/{en,ru,be}.ts` — consolidate the photo keys.
- **Modify** `src/frontend/src/components/PersonDossier.vue` — mount `PersonPhotos` instead of `GalleryViewer` + `PhotoManager`.
- **Modify** `src/frontend/src/components/PersonDossier.spec.ts` — retarget the gallery/photo-manager assertions to `PersonPhotos`.
- **Delete** `GalleryViewer.vue`, `GalleryViewer.spec.ts`, `PhotoManager.vue`, `PhotoManager.spec.ts`.
- **Modify** `docs/reference/features/person-details.md` (and `roadmap.md` if it describes the photo-manager UI).

---

## Task 1: Build `PersonPhotos.vue` with tests

**Files:**
- Create: `src/frontend/src/components/PersonPhotos.vue`
- Create: `src/frontend/src/components/PersonPhotos.spec.ts`
- Modify: `src/frontend/src/i18n/messages/en.ts`, `ru.ts`, `be.ts` (add new keys; keep the old ones for now so the still-present `PhotoManager` keeps working)

**Interfaces:**
- Produces a component `PersonPhotos` with props `{ detail: PersonDetail; canEdit: boolean; name: string }` and emit `updated: [detail: PersonDetail]`.
- Consumes: `photosApi` (all four functions), `resolveMediaUrl`, `MediaLightbox` (`:initial-index`), the i18n keys below.

- [ ] **Step 1: Add the new i18n keys (all three locales, keep existing keys)**

In `en.ts`, inside the `photos: { … }` object, add these keys (leave the existing `portrait`, `gallery`, `addPortrait`, `replacePortrait`, `deletePortrait`, `addToGallery`, `makePortrait`, `delete`, `deletePhoto`, `confirmDelete`, `saveFailed` in place for now):

```ts
    add: 'Add photo',
    setPortrait: 'Set as portrait',
    remove: 'Remove',
    confirmRemove: 'Remove',
    view: 'View photo of {name}',
```

In `ru.ts` `photos`:

```ts
    add: 'Добавить фото',
    setPortrait: 'Сделать портретом',
    remove: 'Удалить',
    confirmRemove: 'Удалить',
    view: 'Посмотреть фото — {name}',
```

In `be.ts` `photos`:

```ts
    add: 'Дадаць фота',
    setPortrait: 'Зрабіць партрэтам',
    remove: 'Выдаліць',
    confirmRemove: 'Выдаліць',
    view: 'Паглядзець фота — {name}',
```

Run: `npm --prefix src/frontend test -- messages`
Expected: PASS (all three locales still structurally identical).

- [ ] **Step 2: Write the failing test file**

```ts
// src/frontend/src/components/PersonPhotos.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';

vi.mock('../api/photosApi', () => ({
  uploadPhoto: vi.fn(),
  deletePortrait: vi.fn(),
  deleteGalleryPhoto: vi.fn(),
  promoteGalleryPhoto: vi.fn()
}));

import * as photosApi from '../api/photosApi';
import PersonPhotos from './PersonPhotos.vue';
import MediaLightbox from './MediaLightbox.vue';
import type { PersonDetail } from '../types/family';

const empty: PersonDetail = {
  id: 'p-0001',
  givenName: { ru: null, be: null, en: 'A' },
  surname: { ru: null, be: null, en: 'B' },
  maidenName: null, sex: 'M',
  birth: { year: null, month: null, day: null, approx: false, place: null },
  death: null, vocation: '', summary: null, biography: null,
  portrait: null, portraitThumb: null, portraitVideo: null,
  gallery: [], links: [], residences: [],
  parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false
};
const gphoto = { id: 'h2', full: 'uploads/p-0001/h2.webp', thumb: 'uploads/p-0001/h2.thumb.webp' };
const withGallery: PersonDetail = { ...empty, gallery: [gphoto] };
const uploadedPortrait: PersonDetail = {
  ...empty, portrait: 'uploads/p-0001/h1.webp', portraitThumb: 'uploads/p-0001/h1.thumb.webp', gallery: [gphoto]
};
const seedPortrait: PersonDetail = { ...empty, portrait: 'p-0001.jpg' };

function mountPhotos(detail: PersonDetail, canEdit: boolean) {
  return mount(PersonPhotos, {
    props: { detail, canEdit, name: 'A B' },
    global: { plugins: [i18n], stubs: { teleport: true } }
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(photosApi.uploadPhoto).mockReset();
  vi.mocked(photosApi.deletePortrait).mockReset();
  vi.mocked(photosApi.deleteGalleryPhoto).mockReset();
  vi.mocked(photosApi.promoteGalleryPhoto).mockReset();
});

describe('PersonPhotos', () => {
  it('renders the portrait first then gallery, with a Portrait badge on the first tile', () => {
    const w = mountPhotos(uploadedPortrait, true);
    const tiles = w.findAll('.person-photos__tile');
    expect(w.find('[data-test="photo-open-0"]').exists()).toBe(true);
    expect(w.find('[data-test="photo-open-1"]').exists()).toBe(true);
    expect(tiles[0].find('[data-test="portrait-badge"]').exists()).toBe(true);
  });

  it('sets a gallery photo as portrait via promote and emits updated', async () => {
    const updated = { ...uploadedPortrait, portrait: 'uploads/p-0001/h2.webp' };
    const spy = vi.spyOn(photosApi, 'promoteGalleryPhoto').mockResolvedValue(updated);
    const w = mountPhotos(uploadedPortrait, true);

    await w.get('[data-test="set-portrait-h2"]').trigger('click');
    await flushPromises();

    expect(spy).toHaveBeenCalledWith('p-0001', 'h2');
    expect(w.emitted('updated')?.[0]?.[0]).toEqual(updated);
  });

  it('removes a gallery photo after inline confirm via deleteGalleryPhoto', async () => {
    const updated = { ...uploadedPortrait, gallery: [] };
    const spy = vi.spyOn(photosApi, 'deleteGalleryPhoto').mockResolvedValue(updated);
    const w = mountPhotos(uploadedPortrait, true);

    await w.get('[data-test="remove-h2"]').trigger('click');
    await w.get('[data-test="remove-confirm-h2"]').trigger('click');
    await flushPromises();

    expect(spy).toHaveBeenCalledWith('p-0001', 'h2');
    expect(w.emitted('updated')?.[0]?.[0]).toEqual(updated);
  });

  it('removes an uploaded portrait via deletePortrait', async () => {
    const updated = { ...uploadedPortrait, portrait: null, portraitThumb: null };
    const spy = vi.spyOn(photosApi, 'deletePortrait').mockResolvedValue(updated);
    const w = mountPhotos(uploadedPortrait, true);

    await w.get('[data-test="remove-portrait"]').trigger('click');
    await w.get('[data-test="remove-confirm-portrait"]').trigger('click');
    await flushPromises();

    expect(spy).toHaveBeenCalledWith('p-0001');
  });

  it('shows the Portrait badge but no remove for a seed portrait', () => {
    const w = mountPhotos(seedPortrait, true);
    expect(w.find('[data-test="portrait-badge"]').exists()).toBe(true);
    expect(w.find('[data-test="remove-portrait"]').exists()).toBe(false);
  });

  it('uploads as portrait when there is no portrait, as gallery when there is', async () => {
    vi.spyOn(photosApi, 'uploadPhoto').mockResolvedValue(empty);
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });

    const wEmpty = mountPhotos(empty, true);
    const i1 = wEmpty.get('[data-test="photo-add-input"]');
    Object.defineProperty(i1.element, 'files', { value: [file] });
    await i1.trigger('change');
    await flushPromises();
    expect(photosApi.uploadPhoto).toHaveBeenCalledWith('p-0001', file, 'portrait');

    vi.mocked(photosApi.uploadPhoto).mockClear();
    const wPortrait = mountPhotos(uploadedPortrait, true);
    const i2 = wPortrait.get('[data-test="photo-add-input"]');
    Object.defineProperty(i2.element, 'files', { value: [file] });
    await i2.trigger('change');
    await flushPromises();
    expect(photosApi.uploadPhoto).toHaveBeenCalledWith('p-0001', file, 'gallery');
  });

  it('shows an error and keeps the grid when an upload fails', async () => {
    vi.spyOn(photosApi, 'uploadPhoto').mockRejectedValue(new Error('403'));
    const w = mountPhotos(empty, true);
    const input = w.get('[data-test="photo-add-input"]');
    Object.defineProperty(input.element, 'files', { value: [new File([new Uint8Array([1])], 'x.png', { type: 'image/png' })] });
    await input.trigger('change');
    await flushPromises();
    expect(w.get('[data-test="photo-error"]').isVisible()).toBe(true);
    expect(w.find('[data-test="photo-add-input"]').exists()).toBe(true);
  });

  it('is read-only for visitors: no actions or add tile, and nothing at all when empty', () => {
    const wGallery = mountPhotos(withGallery, false);
    expect(wGallery.find('[data-test="photo-open-0"]').exists()).toBe(true);
    expect(wGallery.find('[data-test="set-portrait-h2"]').exists()).toBe(false);
    expect(wGallery.find('[data-test="photo-add-input"]').exists()).toBe(false);

    const wEmpty = mountPhotos(empty, false);
    expect(wEmpty.find('[data-test="person-photos"]').exists()).toBe(false);
  });

  it('opens the lightbox at the clicked photo index', async () => {
    const w = mountPhotos(uploadedPortrait, false);
    await w.get('[data-test="photo-open-1"]').trigger('click');
    const lb = w.findComponent(MediaLightbox);
    expect(lb.exists()).toBe(true);
    expect(lb.props('initialIndex')).toBe(1);
  });
});
```

- [ ] **Step 3: Run the test — expect FAIL (component missing)**

Run: `npm --prefix src/frontend test -- PersonPhotos`
Expected: FAIL (cannot resolve `./PersonPhotos.vue`).

- [ ] **Step 4: Implement `PersonPhotos.vue`**

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PersonDetail } from '../types/family';
import type { MediaItem } from '../media/types';
import { resolveMediaUrl } from '../media/mediaUrl';
import {
  uploadPhoto,
  deletePortrait,
  deleteGalleryPhoto,
  promoteGalleryPhoto
} from '../api/photosApi';
import MediaLightbox from './MediaLightbox.vue';

interface PhotoTile {
  key: string;
  thumbUrl: string;
  fullUrl: string;
  isPortrait: boolean;
  galleryId: string | null;
  removable: boolean;
}

const props = defineProps<{ detail: PersonDetail; canEdit: boolean; name: string }>();
const emit = defineEmits<{ updated: [detail: PersonDetail] }>();
const { t } = useI18n({ useScope: 'global' });

const busy = ref(false);
const error = ref<string | null>(null);
const confirmRemoveKey = ref<string | null>(null);
const lightboxOpen = ref(false);
const lightboxIndex = ref(0);
const triggerRefs = ref<HTMLButtonElement[]>([]);

const items = computed<PhotoTile[]>(() => {
  const list: PhotoTile[] = [];
  const portrait = props.detail.portrait;
  if (portrait) {
    const thumb = props.detail.portraitThumb ?? portrait;
    list.push({
      key: 'portrait',
      thumbUrl: resolveMediaUrl(thumb),
      fullUrl: resolveMediaUrl(portrait),
      isPortrait: true,
      galleryId: null,
      // Only an editor-uploaded portrait (a full uploads/ key) can be removed in-app;
      // a seed portrait (bare filename) stays managed by the seed.
      removable: portrait.includes('/')
    });
  }
  for (const photo of props.detail.gallery) {
    list.push({
      key: photo.id,
      thumbUrl: resolveMediaUrl(photo.thumb),
      fullUrl: resolveMediaUrl(photo.full),
      isPortrait: false,
      galleryId: photo.id,
      removable: true
    });
  }
  return list;
});

const lightboxItems = computed<MediaItem[]>(() =>
  items.value.map(i => ({ kind: 'image' as const, src: i.fullUrl }))
);

watch(() => props.detail.id, () => {
  lightboxOpen.value = false;
  confirmRemoveKey.value = null;
  error.value = null;
});

async function run(action: () => Promise<PersonDetail>): Promise<void> {
  if (busy.value) {
    return;
  }
  busy.value = true;
  error.value = null;
  confirmRemoveKey.value = null;
  try {
    const updated = await action();
    emit('updated', updated);
  } catch {
    error.value = t('photos.saveFailed');
  } finally {
    busy.value = false;
  }
}

function onAdd(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) {
    return;
  }
  // First photo on a person with no portrait becomes the portrait — initials to a
  // face in one action; otherwise it appends to the grid.
  const role = props.detail.portrait ? 'gallery' : 'portrait';
  void run(() => uploadPhoto(props.detail.id, file, role));
}

function onSetPortrait(tile: PhotoTile): void {
  if (tile.galleryId === null) {
    return;
  }
  void run(() => promoteGalleryPhoto(props.detail.id, tile.galleryId!));
}

function onRemove(tile: PhotoTile): void {
  void run(() =>
    tile.galleryId === null
      ? deletePortrait(props.detail.id)
      : deleteGalleryPhoto(props.detail.id, tile.galleryId)
  );
}

function openAt(index: number): void {
  lightboxIndex.value = index;
  lightboxOpen.value = true;
}

function closeLightbox(): void {
  const trigger = triggerRefs.value[lightboxIndex.value];
  lightboxOpen.value = false;
  trigger?.focus();
}

function setTriggerRef(el: Element | null, index: number): void {
  if (el) {
    triggerRefs.value[index] = el as HTMLButtonElement;
  }
}
</script>

<template>
  <div v-if="canEdit || items.length" class="person-photos" data-test="person-photos">
    <div class="person-photos__grid">
      <div
        v-for="(tile, index) in items"
        :key="tile.key"
        class="person-photos__tile"
        :class="{ 'person-photos__tile--portrait': tile.isPortrait }"
      >
        <button
          type="button"
          class="person-photos__open"
          :ref="el => setTriggerRef(el as Element | null, index)"
          :data-test="`photo-open-${index}`"
          :aria-label="t('photos.view', { name })"
          @click="openAt(index)"
        >
          <img :src="tile.thumbUrl" class="person-photos__img" alt="" />
        </button>

        <span v-if="tile.isPortrait" class="person-photos__badge" data-test="portrait-badge">
          {{ t('photos.portrait') }}
        </span>

        <div v-if="canEdit" class="person-photos__actions">
          <button
            v-if="!tile.isPortrait"
            type="button"
            class="person-photos__act"
            :data-test="`set-portrait-${tile.galleryId}`"
            :disabled="busy"
            :aria-label="t('photos.setPortrait')"
            @click="onSetPortrait(tile)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.8 5.8 20.9l1.6-6.8L2.2 9.5l6.9-.6z"/></svg>
          </button>

          <template v-if="tile.removable">
            <template v-if="confirmRemoveKey === tile.key">
              <button
                type="button"
                class="person-photos__act person-photos__act--warn"
                :data-test="`remove-confirm-${tile.key}`"
                :disabled="busy"
                @click="onRemove(tile)"
              >{{ t('photos.confirmRemove') }}</button>
              <button
                type="button"
                class="person-photos__act"
                :data-test="`remove-cancel-${tile.key}`"
                :aria-label="t('editor.cancel')"
                @click="confirmRemoveKey = null"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </template>
            <button
              v-else
              type="button"
              class="person-photos__act person-photos__act--danger"
              :data-test="`remove-${tile.key}`"
              :disabled="busy"
              :aria-label="t('photos.remove')"
              @click="confirmRemoveKey = tile.key"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"/></svg>
            </button>
          </template>
        </div>
      </div>

      <label v-if="canEdit" class="person-photos__tile person-photos__add">
        <input
          type="file"
          accept="image/*"
          class="person-photos__file"
          data-test="photo-add-input"
          :disabled="busy"
          @change="onAdd"
        />
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        <span>{{ t('photos.add') }}</span>
      </label>
    </div>

    <p v-if="error" class="person-photos__error" data-test="photo-error">{{ error }}</p>

    <Teleport to="body">
      <MediaLightbox
        v-if="lightboxOpen"
        :items="lightboxItems"
        :name="name"
        :initial-index="lightboxIndex"
        @close="closeLightbox"
      />
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.person-photos { margin-top: 12px; font-family: var(--font-body); }
.person-photos__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 8px;
}
.person-photos__tile {
  position: relative;
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  background: var(--parchment-2);
}
.person-photos__tile--portrait { border: 2px solid var(--gilt); }
.person-photos__open {
  display: block; width: 100%; height: 100%; padding: 0;
  border: none; background: none; cursor: zoom-in;
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: -2px; }
}
.person-photos__img { width: 100%; height: 100%; object-fit: cover; display: block; }
.person-photos__badge {
  position: absolute; left: 4px; bottom: 4px;
  padding: 1px 7px; border-radius: 999px;
  font-size: 11px; font-family: var(--font-display); letter-spacing: 0.3px;
  background: var(--gilt); color: var(--gilt-deep);
  pointer-events: none;
}
.person-photos__actions {
  position: absolute; top: 4px; right: 4px;
  display: flex; gap: 4px;
  opacity: 0; transition: opacity 120ms ease;
}
.person-photos__tile:hover .person-photos__actions,
.person-photos__tile:focus-within .person-photos__actions { opacity: 1; }
@media (hover: none) { .person-photos__actions { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .person-photos__actions { transition: none; } }
.person-photos__act {
  width: 24px; height: 24px; border-radius: 50%;
  display: grid; place-items: center; cursor: pointer;
  border: 1px solid var(--glass-border);
  background: var(--parchment-2); color: var(--ink-soft);
  &:not(:disabled):hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 1px; }
  &:disabled { opacity: 0.45; cursor: default; }
  svg { width: 14px; height: 14px; }
  &--danger { color: var(--umber); }
  &--warn {
    width: auto; padding: 0 8px; border-radius: 12px;
    background: var(--umber); border-color: var(--umber); color: var(--on-accent);
    font-size: 12px; font-family: var(--font-display);
  }
}
.person-photos__add {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; cursor: pointer; color: var(--ink-soft);
  border: 1px dashed var(--glass-border); background: transparent;
  font-size: 12px; font-family: var(--font-display);
  &:hover { border-color: var(--gilt); color: var(--gilt-deep); }
  &:focus-within { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  svg { width: 18px; height: 18px; }
}
.person-photos__file { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
.person-photos__error { margin: 8px 0 0; font-size: 14px; color: var(--umber); }
</style>
```

- [ ] **Step 5: Run the test — expect PASS**

Run: `npm --prefix src/frontend test -- PersonPhotos`
Expected: PASS (9 tests).

- [ ] **Step 6: Type-check still compiles**

Run: `npm --prefix src/frontend run build`
Expected: PASS (the new component compiles; `PhotoManager`/`GalleryViewer` still exist and still use their old keys — untouched).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/src/components/PersonPhotos.vue src/frontend/src/components/PersonPhotos.spec.ts src/frontend/src/i18n/messages
git commit -m "feat(web): unified PersonPhotos grid component"
```

---

## Task 2: Mount in the popup, remove the old components, prune i18n

**Files:**
- Modify: `src/frontend/src/components/PersonDossier.vue:10-11,63-65` (imports + the two mounts)
- Modify: `src/frontend/src/components/PersonDossier.spec.ts` (retarget gallery/photo-manager assertions)
- Delete: `GalleryViewer.vue`, `GalleryViewer.spec.ts`, `PhotoManager.vue`, `PhotoManager.spec.ts`
- Modify: `src/frontend/src/i18n/messages/{en,ru,be}.ts` (remove now-unused keys)

**Interfaces:**
- Consumes `PersonPhotos` (Task 1). `PersonDossier` already computes `canEdit` and `displayName` and has `onDetailUpdated(updated) → selection.applyDetail(updated)`.

- [ ] **Step 1: Update `PersonDossier.vue`**

Replace the two imports (lines 10-11):

```ts
import PersonPhotos from './PersonPhotos.vue';
```

Replace the two mounts (lines 63-65) with a single one:

```vue
    <PersonPhotos :detail="detail" :can-edit="canEdit" :name="displayName" @updated="onDetailUpdated" />
```

(`onSaved`, `onDetailUpdated`, `canEdit`, `displayName` are unchanged and already present.)

- [ ] **Step 2: Update `PersonDossier.spec.ts`**

Replace the `PhotoManager` import (line 10) with:

```ts
import PersonPhotos from './PersonPhotos.vue';
```

Replace the four photo-related tests (the `renders GalleryViewer thumbnails…`, `does not render gallery thumbs…`, `renders PhotoManager only when editable and canEdit`, and `applies an updated detail from PhotoManager…` tests, lines 168-209) with:

```ts
  it('renders the unified photo grid when the detail has photos', () => {
    const withGallery: PersonDetail = {
      ...base,
      gallery: [{ id: 'h2', full: 'uploads/p-0016/h2.webp', thumb: 'uploads/p-0016/h2.thumb.webp' }]
    };
    const w = mountWith(withGallery);
    expect(w.find('[data-test="photo-open-0"]').exists()).toBe(true);
  });

  it('does not render the photo grid for a visitor with no photos', () => {
    const w = mountWith(base); // base has no portrait and no gallery
    expect(w.find('[data-test="person-photos"]').exists()).toBe(false);
  });

  it('shows photo edit affordances only when editable and canEdit', () => {
    const withGallery: PersonDetail = {
      ...base,
      gallery: [{ id: 'h2', full: 'uploads/p-0016/h2.webp', thumb: 'uploads/p-0016/h2.thumb.webp' }]
    };
    const wGuest = mountWith(withGallery);
    expect(wGuest.find('[data-test="photo-add-input"]').exists()).toBe(false);

    const wEditor = mountEditable(withGallery, true);
    expect(wEditor.find('[data-test="photo-add-input"]').exists()).toBe(true);

    const wNonEditor = mountEditable(withGallery, false);
    expect(wNonEditor.find('[data-test="photo-add-input"]').exists()).toBe(false);
  });

  it('applies an updated detail from PersonPhotos to the selection store', async () => {
    const selection = useSelectionStore();
    selection.selectedId = base.id;
    selection.detail = base;

    const w = mountEditable(base, true);
    const next: PersonDetail = {
      ...base,
      gallery: [{ id: 'h2', full: 'uploads/p-0016/h2.webp', thumb: 'uploads/p-0016/h2.thumb.webp' }]
    };
    w.findComponent(PersonPhotos).vm.$emit('updated', next);
    await w.vm.$nextTick();

    expect(selection.cache['p-0016']).toEqual(next);
    expect(selection.detail).toEqual(next);
  });
```

(Keep the `vi.mock('../api/photosApi', …)` block at the top — `PersonPhotos` imports it.)

- [ ] **Step 3: Delete the obsolete components and their specs**

```bash
git rm src/frontend/src/components/GalleryViewer.vue src/frontend/src/components/GalleryViewer.spec.ts \
       src/frontend/src/components/PhotoManager.vue src/frontend/src/components/PhotoManager.spec.ts
```

- [ ] **Step 4: Prune the now-unused i18n keys (all three locales)**

In `en.ts`, `ru.ts`, and `be.ts`: delete the top-level `gallery: { open: … }` block entirely, and from the `photos` object delete `gallery`, `addPortrait`, `replacePortrait`, `deletePortrait`, `addToGallery`, `makePortrait`, `delete`, `deletePhoto`, and `confirmDelete`. Keep only: `portrait`, `add`, `setPortrait`, `remove`, `confirmRemove`, `view`, `saveFailed`. Apply the identical deletions in all three files so the structures stay equal.

> Before deleting, `grep -rn "photos\.\(gallery\|addPortrait\|replacePortrait\|deletePortrait\|addToGallery\|makePortrait\|delete\|deletePhoto\|confirmDelete\)\|gallery\.open" src/frontend/src` and confirm the only matches were in the deleted files. If any other consumer appears, stop and report it.

- [ ] **Step 5: Run the full frontend suite + build**

Run: `npm --prefix src/frontend test`
Expected: PASS (no references to the deleted components/keys; `messages.spec` parity holds).

Run: `npm --prefix src/frontend run build`
Expected: PASS (`vue-tsc` clean — no dangling imports).

- [ ] **Step 6: Commit**

```bash
git add -A src/frontend/src
git commit -m "feat(web): swap popup to unified photo grid; remove old gallery/portrait UIs"
```

---

## Task 3: Documentation

**Files:**
- Modify: `docs/reference/features/person-details.md` (the photo gallery + photo-manager sections)
- Modify: `docs/reference/roadmap.md` (only if it describes the photo-manager UI shape)

- [ ] **Step 1: Update the reference docs**

In `docs/reference/features/person-details.md`, replace the separate "Photo gallery (all visitors)" and "Photo manager (signed-in editors)" descriptions with the unified model: one photo grid in the popup; the portrait is whichever photo is flagged (gold ring + "Portrait" tag); editors get per-image **set as portrait** (`promote`) and **remove** (`deleteGalleryPhoto` / `deletePortrait`, with an inline confirm) plus an **Add photo** tile (first photo on a person with no portrait becomes the portrait); a **seed** portrait shows the badge but no remove; visitors see the same grid read-only with a click-to-lightbox (opens at the clicked photo); the portrait still also appears in the header/medallion. Note the endpoints are unchanged. Keep the prose tight and consistent with the existing doc tone.

In `roadmap.md`, if the implemented-features entry describes the old three-section UI, update the wording to "a unified photo grid (portrait = flagged photo, per-image actions, add tile)"; otherwise leave it.

- [ ] **Step 2: Commit**

```bash
git add docs
git commit -m "docs: unified photo manager UI"
```

---

## Self-Review

**Spec coverage:**
- One component, three blocks → one → Tasks 1-2 (`PersonPhotos` replaces both old components; mounted once). ✓
- Per-image set-as-portrait + remove → Task 1 (`onSetPortrait`/promote, `onRemove`/delete with inline confirm). ✓
- Add tile in the grid; first-photo-becomes-portrait → Task 1 (`onAdd` role logic). ✓
- Portrait = flagged photo, no separate portrait concept → Task 1 (unified `items`, badge, no portrait-only block). ✓
- Seed portrait: badge, no remove (`/`-rule) → Task 1 (`removable: portrait.includes('/')`) + test. ✓
- Visitor: same grid read-only, nothing when empty, lightbox at clicked photo → Task 1 (`v-if="canEdit || items.length"`, `canEdit` gates actions/add, `initialIndex`) + tests. ✓
- Resilient save (busy/error/emit → applyDetail) → Task 1 `run()` + Task 2 wiring. ✓
- Cleanup (delete old components/specs, prune i18n, update PersonDossier + spec) → Task 2. ✓
- i18n parity across ru/be/en → Tasks 1-2 (identical edits, `messages.spec`). ✓
- No backend change → entire plan is `src/frontend` + docs. ✓
- Docs in the same branch → Task 3. ✓

**Type/selector consistency:** `PersonPhotos` props `{ detail, canEdit, name }` and emit `updated` are used identically in the spec, the component, and the `PersonDossier` mount. Test selectors are stable and shared between the component template and both spec files: `person-photos`, `photo-open-${index}`, `portrait-badge`, `set-portrait-${galleryId}`, `remove-${key}` / `remove-confirm-${key}` / `remove-cancel-${key}`, `photo-add-input`, `photo-error`. The i18n keys referenced by the template (`photos.view/portrait/setPortrait/remove/confirmRemove/add/saveFailed`, `editor.cancel`) all exist after Task 1 and survive the Task 2 prune.
