<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PersonDetail, Photo } from '../types/family';
import { resolveMediaUrl } from '../media/mediaUrl';
import {
  uploadPhoto,
  deletePortrait,
  deleteGalleryPhoto,
  promoteGalleryPhoto
} from '../api/photosApi';

const props = defineProps<{ detail: PersonDetail }>();
const emit = defineEmits<{ updated: [detail: PersonDetail] }>();
const { t } = useI18n({ useScope: 'global' });

const busy = ref(false);
const error = ref<string | null>(null);
/** Tracks which gallery item is pending inline delete confirmation. */
const confirmDeleteId = ref<string | null>(null);

async function run(action: () => Promise<PersonDetail>): Promise<void> {
  if (busy.value) {
    return;
  }
  busy.value = true;
  error.value = null;
  confirmDeleteId.value = null;
  try {
    const updated = await action();
    emit('updated', updated);
  } catch {
    error.value = t('photos.saveFailed');
  } finally {
    busy.value = false;
  }
}

function onPortraitChange(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) {
    return;
  }
  void run(() => uploadPhoto(props.detail.id, file, 'portrait'));
}

function onGalleryChange(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) {
    return;
  }
  void run(() => uploadPhoto(props.detail.id, file, 'gallery'));
}

function onDeletePortrait(): void {
  void run(() => deletePortrait(props.detail.id));
}

function onPromote(photo: Photo): void {
  void run(() => promoteGalleryPhoto(props.detail.id, photo.id));
}

function requestDeleteGallery(id: string): void {
  confirmDeleteId.value = id;
}

function cancelDelete(): void {
  confirmDeleteId.value = null;
}

function onDeleteGallery(photo: Photo): void {
  void run(() => deleteGalleryPhoto(props.detail.id, photo.id));
}
</script>

<template>
  <div class="photo-manager" data-test="photo-manager">
    <!-- Portrait section -->
    <div class="photo-manager__section">
      <h4 class="photo-manager__title">{{ t('photos.portrait') }}</h4>
      <div class="photo-manager__portrait-row">
        <div v-if="detail.portraitThumb ?? detail.portrait" class="photo-manager__preview-wrap">
          <img
            :src="resolveMediaUrl((detail.portraitThumb ?? detail.portrait)!)"
            class="photo-manager__preview"
            data-test="portrait-preview"
            alt=""
          />
          <button
            type="button"
            class="photo-manager__btn photo-manager__btn--ghost"
            data-test="portrait-delete"
            :disabled="busy"
            :aria-label="t('photos.deletePortrait')"
            @click="onDeletePortrait"
          >
            {{ t('photos.delete') }}
          </button>
        </div>

        <label class="photo-manager__upload-label">
          <input
            type="file"
            accept="image/*"
            class="photo-manager__file-input"
            data-test="portrait-input"
            :disabled="busy"
            @change="onPortraitChange"
          />
          <span class="photo-manager__btn photo-manager__btn--secondary">
            {{ detail.portraitThumb ?? detail.portrait ? t('photos.replacePortrait') : t('photos.addPortrait') }}
          </span>
        </label>
      </div>
    </div>

    <!-- Gallery section -->
    <div class="photo-manager__section">
      <h4 class="photo-manager__title">{{ t('photos.gallery') }}</h4>
      <div v-if="detail.gallery.length" class="photo-manager__gallery">
        <div
          v-for="photo in detail.gallery"
          :key="photo.id"
          class="photo-manager__gallery-item"
          data-test="gallery-item"
        >
          <img
            :src="resolveMediaUrl(photo.thumb)"
            class="photo-manager__gallery-thumb"
            alt=""
          />
          <div class="photo-manager__gallery-actions">
            <button
              type="button"
              class="photo-manager__btn photo-manager__btn--ghost"
              :data-test="`gallery-promote-${photo.id}`"
              :disabled="busy"
              :aria-label="t('photos.makePortrait')"
              @click="onPromote(photo)"
            >
              {{ t('photos.makePortrait') }}
            </button>
            <template v-if="confirmDeleteId === photo.id">
              <button
                type="button"
                class="photo-manager__btn photo-manager__btn--warn"
                :data-test="`gallery-delete-confirm-${photo.id}`"
                :disabled="busy"
                @click="onDeleteGallery(photo)"
              >
                {{ t('photos.confirmDelete') }}
              </button>
              <button
                type="button"
                class="photo-manager__btn photo-manager__btn--ghost"
                :data-test="`gallery-delete-cancel-${photo.id}`"
                @click="cancelDelete"
              >
                {{ t('editor.cancel') }}
              </button>
            </template>
            <button
              v-else
              type="button"
              class="photo-manager__btn photo-manager__btn--ghost"
              :data-test="`gallery-delete-${photo.id}`"
              :disabled="busy"
              :aria-label="t('photos.deletePhoto')"
              @click="requestDeleteGallery(photo.id)"
            >
              {{ t('photos.delete') }}
            </button>
          </div>
        </div>
      </div>

      <label class="photo-manager__upload-label">
        <input
          type="file"
          accept="image/*"
          class="photo-manager__file-input"
          data-test="gallery-input"
          :disabled="busy"
          @change="onGalleryChange"
        />
        <span class="photo-manager__btn photo-manager__btn--secondary">
          {{ t('photos.addToGallery') }}
        </span>
      </label>
    </div>

    <!-- Error banner -->
    <p v-if="error" class="photo-manager__error" data-test="photo-error">{{ error }}</p>
  </div>
</template>

<style scoped lang="scss">
.photo-manager {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 6px;
  font-family: var(--font-body);
}

.photo-manager__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.photo-manager__title {
  margin: 0;
  font-size: 15px;
  font-family: var(--font-display);
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.photo-manager__portrait-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.photo-manager__preview-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.photo-manager__preview {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1px solid var(--glass-border);
  object-fit: cover;
  display: block;
}

.photo-manager__gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.photo-manager__gallery-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.photo-manager__gallery-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--glass-border);
  display: block;
}

.photo-manager__gallery-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.photo-manager__upload-label {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.photo-manager__file-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.photo-manager__btn {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.3px;
  white-space: nowrap;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--leaf-deep);
    outline-offset: 2px;
  }

  &--ghost {
    border: none;
    background: transparent;
    color: var(--ink-soft);
    font-family: var(--font-body);

    &:not(:disabled):hover {
      background: var(--btn-hover);
    }
  }

  &--secondary {
    border: 1px solid var(--glass-border);
    background: linear-gradient(var(--control-grad-top), var(--control-grad-bottom));
    color: var(--gilt-deep);

    &:not(:disabled):hover {
      background: var(--control-hover);
    }
  }

  &--warn {
    border: 1px solid var(--umber);
    background: var(--umber);
    color: var(--on-accent);
  }
}

.photo-manager__error {
  margin: 0;
  font-size: 14px;
  color: var(--umber);
}
</style>
