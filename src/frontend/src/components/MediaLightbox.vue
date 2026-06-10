<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaItem } from '../media/types';

const props = defineProps<{ items: MediaItem[]; name: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const { t } = useI18n({ useScope: 'global' });

const index = ref(0);
const current = computed(() => props.items[index.value]);
const closeRef = ref<HTMLButtonElement | null>(null);

function step(delta: number): void {
  if (props.items.length < 2) return;
  index.value = (index.value + delta + props.items.length) % props.items.length;
}

// A broken video falls back to the still (if there is one); a broken still —
// or a broken only-item — closes the lightbox rather than showing a dead frame.
function onMediaError(): void {
  if (current.value.kind === 'video') {
    const stillIndex = props.items.findIndex((item) => item.kind === 'image');
    if (stillIndex !== -1 && stillIndex !== index.value) {
      index.value = stillIndex;
      return;
    }
  }
  emit('close');
}

onMounted(() => closeRef.value?.focus());
</script>

<template>
  <div
    class="lightbox"
    data-test="media-lightbox"
    role="dialog"
    aria-modal="true"
    :aria-label="t('media.dialog', { name })"
    @keydown.esc.prevent="emit('close')"
    @keydown.left.prevent="step(-1)"
    @keydown.right.prevent="step(1)"
  >
    <div class="lightbox__scrim" data-test="lightbox-scrim" @click="emit('close')" />
    <figure class="lightbox__stage">
      <video
        v-if="current.kind === 'video'"
        class="lightbox__media"
        data-test="lightbox-video"
        :src="current.src"
        :poster="current.poster"
        autoplay
        muted
        loop
        playsinline
        @error="onMediaError"
      />
      <img
        v-else
        class="lightbox__media"
        data-test="lightbox-image"
        :src="current.src"
        alt=""
        @error="onMediaError"
      />
    </figure>
    <button
      ref="closeRef"
      type="button"
      class="lightbox__btn lightbox__close"
      data-test="lightbox-close"
      :aria-label="t('person.close')"
      @click="emit('close')"
    >✕</button>
    <template v-if="items.length > 1">
      <button
        type="button"
        class="lightbox__btn lightbox__nav lightbox__nav--prev"
        data-test="lightbox-prev"
        :aria-label="t('media.prev')"
        @click="step(-1)"
      >‹</button>
      <button
        type="button"
        class="lightbox__btn lightbox__nav lightbox__nav--next"
        data-test="lightbox-next"
        :aria-label="t('media.next')"
        @click="step(1)"
      >›</button>
      <div class="lightbox__dots" data-test="lightbox-dots" aria-hidden="true">
        <span v-for="(_, i) in items" :key="i" class="lightbox__dot" :class="{ 'lightbox__dot--active': i === index }" />
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
/* Above the person popup overlay (z-index: 60 in PersonPopup.vue). */
.lightbox { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; }
.lightbox__scrim { position: absolute; inset: 0; background: rgba(20, 16, 10, 0.72); }
.lightbox__stage { position: relative; z-index: 1; margin: 0; max-width: min(90vw, 960px); max-height: 85vh; display: flex; align-items: center; justify-content: center; }
.lightbox__media { max-width: 100%; max-height: 85vh; width: auto; height: auto; display: block; border-radius: 8px; box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5); }
.lightbox__btn { position: absolute; z-index: 2; width: 40px; height: 40px; border: none; border-radius: 50%; background: rgba(20, 16, 10, 0.55); color: var(--parchment, #f3ead8); font-size: 22px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; &:hover { background: rgba(20, 16, 10, 0.8); } &:focus-visible { outline: 2px solid var(--parchment, #f3ead8); outline-offset: 2px; } }
.lightbox__close { top: 16px; right: 16px; }
.lightbox__nav { top: 50%; transform: translateY(-50%); font-size: 30px; &--prev { left: 16px; } &--next { right: 16px; } }
.lightbox__dots { position: absolute; z-index: 2; bottom: 18px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; }
.lightbox__dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(243, 234, 216, 0.45); &--active { background: rgba(243, 234, 216, 0.95); } }
</style>
