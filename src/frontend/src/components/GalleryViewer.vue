<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Photo } from '../types/family';
import type { MediaItem } from '../media/types';
import { resolveMediaUrl } from '../media/mediaUrl';
import MediaLightbox from './MediaLightbox.vue';

const props = defineProps<{ photos: Photo[]; name: string }>();
const { t } = useI18n({ useScope: 'global' });

const lightboxOpen = ref(false);
const lightboxIndex = ref(0);
const triggerRefs = ref<HTMLButtonElement[]>([]);

watch(() => props.photos, () => { lightboxOpen.value = false; });

const lightboxItems = computed<MediaItem[]>(() =>
  props.photos.map(p => ({ kind: 'image' as const, src: resolveMediaUrl(p.full) }))
);

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
  <div v-if="photos.length" class="gallery-viewer" data-test="gallery-viewer">
    <button
      v-for="(photo, index) in photos"
      :key="photo.id"
      :ref="el => setTriggerRef(el as Element | null, index)"
      type="button"
      class="gallery-viewer__thumb-btn"
      :aria-label="t('gallery.open', { name })"
      @click="openAt(index)"
    >
      <img
        :src="resolveMediaUrl(photo.thumb)"
        class="gallery-viewer__thumb"
        data-test="gallery-thumb"
        alt=""
      />
    </button>

    <Teleport to="body">
      <MediaLightbox
        v-if="lightboxOpen"
        :items="lightboxItems"
        :name="name"
        @close="closeLightbox"
      />
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.gallery-viewer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.gallery-viewer__thumb-btn {
  padding: 0;
  border: 1px solid var(--glass-border);
  border-radius: 4px;
  cursor: zoom-in;
  background: var(--parchment-2);
  overflow: hidden;
  width: 72px;
  height: 72px;
  flex: 0 0 auto;

  &:focus-visible {
    outline: 2px solid var(--leaf-deep);
    outline-offset: 2px;
  }

  &:hover {
    border-color: var(--gilt);
  }
}

.gallery-viewer__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
