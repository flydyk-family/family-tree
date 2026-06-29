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
  promoteGalleryPhoto,
  suppressSeed
} from '../api/photosApi';
import MediaLightbox from './MediaLightbox.vue';

interface PhotoTile {
  key: string;
  thumbUrl: string;
  fullUrl: string;
  isPortrait: boolean;
  galleryId: string | null;
  removable: boolean;
  kind: 'image' | 'video';
  seed: boolean;
}

const MAX_PHOTOS = 5;

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
      removable: true,
      kind: 'image',
      seed: !portrait.includes('/')
    });
  }
  const video = props.detail.portraitVideo;
  if (video) {
    list.push({
      key: 'portrait-video',
      thumbUrl: portrait ? resolveMediaUrl(props.detail.portraitThumb ?? portrait) : '',
      fullUrl: resolveMediaUrl(video),
      isPortrait: false,
      galleryId: null,
      removable: true,
      kind: 'video',
      seed: true
    });
  }
  for (const photo of props.detail.gallery) {
    list.push({
      key: photo.id,
      thumbUrl: resolveMediaUrl(photo.thumb),
      fullUrl: resolveMediaUrl(photo.full),
      isPortrait: false,
      galleryId: photo.id,
      removable: true,
      kind: 'image',
      seed: !photo.full.includes('/')
    });
  }
  return list;
});

const lightboxItems = computed<MediaItem[]>(() =>
  items.value.map(i =>
    i.kind === 'video'
      ? { kind: 'video' as const, src: i.fullUrl, poster: i.thumbUrl || undefined }
      : { kind: 'image' as const, src: i.fullUrl }
  )
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
  void run(() => {
    if (tile.kind === 'video') {
      return suppressSeed(props.detail.id, 'video');
    }
    if (tile.seed) {
      return suppressSeed(props.detail.id, 'portrait');
    }
    return tile.galleryId === null
      ? deletePortrait(props.detail.id)
      : deleteGalleryPhoto(props.detail.id, tile.galleryId);
  });
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
  <div v-if="canEdit || items.length > 1" class="person-photos" data-test="person-photos">
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
          <img v-if="tile.thumbUrl" :src="tile.thumbUrl" class="person-photos__img" alt="" />
          <span v-else class="person-photos__img person-photos__img--placeholder" aria-hidden="true"></span>
          <span v-if="tile.kind === 'video'" class="person-photos__play" aria-hidden="true">▶</span>
        </button>

        <span v-if="tile.isPortrait" class="person-photos__badge" data-test="portrait-badge">
          {{ t('photos.portrait') }}
        </span>

        <div v-if="canEdit" class="person-photos__actions">
          <button
            v-if="!tile.isPortrait && tile.kind === 'image'"
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
                class="person-photos__act person-photos__act--danger"
                :data-test="`remove-confirm-${tile.key}`"
                :disabled="busy"
                :title="t('photos.confirmRemove')"
                :aria-label="t('photos.confirmRemove')"
                @click="onRemove(tile)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
              </button>
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

      <label v-if="canEdit && items.length < MAX_PHOTOS" class="person-photos__tile person-photos__add">
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
  svg { width: 14px; height: 14px; display: block; }
  &--danger { color: var(--umber); }
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
.person-photos__img--placeholder { background: var(--parchment-2); }
.person-photos__play {
  position: absolute; inset: 0; display: grid; place-items: center;
  font-size: 20px; color: #fff; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}
</style>
