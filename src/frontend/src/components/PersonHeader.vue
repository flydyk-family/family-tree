<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatLifespan } from '../format/lifespan';
import { formatPersonName } from '../format/personName';
import type { LocalizedText, PersonDetail } from '../types/family';
import VocationIcon from './VocationIcon.vue';
import { resolveMediaUrl } from '../media/mediaUrl';
import type { MediaItem } from '../media/types';
import MediaLightbox from './MediaLightbox.vue';

const props = defineProps<{ detail: PersonDetail }>();
const { t, te } = useI18n({ useScope: 'global' });
const localeStore = useLocaleStore();

function loc(text: LocalizedText | null | undefined): string {
  return localize(text, localeStore.currentLocale);
}
const fullName = computed(() =>
  formatPersonName(props.detail.givenName, props.detail.middleName, props.detail.surname, localeStore.currentLocale));
// Maiden name is only meaningful for women — never shown for male persons.
const maidenName = computed(() =>
  props.detail.maidenName && props.detail.sex !== 'male' ? loc(props.detail.maidenName) : '');
const lifespan = computed(() => formatLifespan(props.detail.birth, props.detail.death));
const initial = computed(() => fullName.value.charAt(0).toUpperCase());

const videoFailed = ref(false);
const imageFailed = ref(false);
const lightboxOpen = ref(false);
watch(() => props.detail.id, () => {
  videoFailed.value = false;
  imageFailed.value = false;
  lightboxOpen.value = false;
});

const stillUrl = computed(() =>
  props.detail.portrait && !imageFailed.value ? resolveMediaUrl(props.detail.portrait) : null);
const videoUrl = computed(() =>
  props.detail.portraitVideo && !videoFailed.value ? resolveMediaUrl(props.detail.portraitVideo) : null);
const hasMedia = computed(() => videoUrl.value !== null || stillUrl.value !== null);

const portraitTriggerRef = ref<HTMLButtonElement | null>(null);
const lightboxItems = computed<MediaItem[]>(() => {
  const items: MediaItem[] = [];
  if (videoUrl.value) {
    items.push({ kind: 'video', src: videoUrl.value, poster: stillUrl.value ?? undefined });
  }
  if (stillUrl.value) {
    items.push({ kind: 'image', src: stillUrl.value });
  }
  return items;
});
function closeLightbox(): void {
  lightboxOpen.value = false;
  portraitTriggerRef.value?.focus();
}

const vocationLabel = computed(() => {
  const v = props.detail.vocation;
  if (!v) {
    return '';
  }
  const key = `vocation.${v}`;
  return te(key) ? t(key) : v;
});
</script>

<template>
  <header class="header" data-test="person-header">
    <button
      v-if="hasMedia"
      ref="portraitTriggerRef"
      type="button"
      class="header__portrait header__portrait--media"
      data-cascade
      data-test="portrait-trigger"
      :aria-label="t('media.view', { name: fullName })"
      @click="lightboxOpen = true"
    >
      <video
        v-if="videoUrl"
        class="header__media"
        data-test="portrait-video"
        :src="videoUrl"
        :poster="stillUrl ?? undefined"
        autoplay
        muted
        loop
        playsinline
        @error="videoFailed = true"
      />
      <img v-else class="header__media" data-test="portrait-image" :src="stillUrl!" alt="" @error="imageFailed = true" />
    </button>
    <div v-else class="header__portrait" data-cascade>
      <span class="header__initial" data-test="portrait-fallback">{{ initial }}</span>
    </div>
    <div class="header__heading" data-cascade>
      <h2 class="header__name">{{ fullName }}</h2>
      <p v-if="maidenName" class="header__maiden">{{ t('person.nee') }} {{ maidenName }}</p>
      <p class="header__life">{{ lifespan }}</p>
      <p v-if="vocationLabel" class="header__vocation">
        <VocationIcon :vocation="detail.vocation" />{{ vocationLabel }}
      </p>
    </div>

    <Teleport to="body">
      <MediaLightbox v-if="lightboxOpen" :items="lightboxItems" :name="fullName" @close="closeLightbox" />
    </Teleport>
  </header>
</template>

<style scoped lang="scss">
.header { display: flex; gap: 14px; align-items: center; font-family: var(--font-body); color: var(--ink); }
.header__portrait { flex: 0 0 auto; width: 84px; height: 84px; border-radius: 50%; border: 1px solid var(--glass-border); background: var(--parchment-2); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.header__media { width: 100%; height: 100%; object-fit: cover; display: block; }
.header__portrait--media { padding: 0; cursor: zoom-in; font: inherit; &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; } }
.header__initial { font-size: 36px; color: var(--ink-soft); }
.header__name { margin: 0; font-size: 29px; font-family: var(--font-display); }
.header__maiden, .header__life, .header__vocation { margin: 3px 0 0; font-size: 20px; color: var(--ink-soft); }
.header__vocation { display: inline-flex; align-items: center; gap: 6px; }
</style>
