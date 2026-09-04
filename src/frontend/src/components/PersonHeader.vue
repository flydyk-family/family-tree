<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useLocaleStore } from '../stores/localeStore';
import { useFamilyStore } from '../stores/familyStore';
import { localize } from '../i18n/localize';
import { formatLifespan } from '../format/lifespan';
import { formatPersonName } from '../format/personName';
import { personSlug } from '../utils/personSlug';
import type { LocalizedText, PersonDetail } from '../types/family';
import VocationIcon from './VocationIcon.vue';
import { resolveMediaUrl } from '../media/mediaUrl';
import type { MediaItem } from '../media/types';
import MediaLightbox from './MediaLightbox.vue';

const props = defineProps<{ detail: PersonDetail }>();
const { t, te } = useI18n({ useScope: 'global' });
const localeStore = useLocaleStore();
const familyStore = useFamilyStore();
const router = useRouter();

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

// Reverse of MemberDetail's "Find on tree": jump from this person (tree popup or
// docked panel) to their full dossier on the members page.
function openInMembers(): void {
  const person = familyStore.personById(props.detail.id);
  if (person) {
    void router.push({ name: 'members', params: { slug: personSlug(person) } });
  }
}
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
      <div class="header__vocrow">
        <p v-if="vocationLabel" class="header__vocation">
          <VocationIcon :vocation="detail.vocation" />{{ vocationLabel }}
        </p>
        <button type="button" class="header__members" data-test="open-in-members" @click="openInMembers">
          {{ t('members.openInMembers') }}
        </button>
      </div>
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
// Fills the remaining width of the .header row (not just its content's width) so
// the "open in members" button's margin-left: auto reaches the popup's true right
// edge instead of stopping at the name/lifespan text's own width.
.header__heading { flex: 1 1 auto; min-width: 0; }
.header__name { margin: 0; font-size: 29px; font-family: var(--font-display); }
.header__maiden, .header__life { margin: 3px 0 0; font-size: 20px; color: var(--ink-soft); }
// Vocation + the "open in members" button share a row: vocation on the left, the
// button pushed to the right edge (margin-left: auto). When the row is too narrow
// (the docked panel) it wraps, and the auto margin re-right-aligns the button on
// its own line rather than leaving it stuck to vocation's trailing edge.
.header__vocrow { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 3px; }
.header__vocation { margin: 0; font-size: 20px; color: var(--ink-soft); display: inline-flex; align-items: center; gap: 6px; }
.header__members {
  margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 16px; font-family: var(--font-body); font-size: 15px; letter-spacing: 0.3px;
  color: var(--on-accent); background: var(--bark); border: 1px solid var(--bark-dark); border-radius: 999px; cursor: pointer;
  &:hover { background: var(--bark-dark); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
</style>
