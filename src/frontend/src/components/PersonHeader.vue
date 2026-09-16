<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRoute } from 'vue-router';
import { useLocaleStore } from '../stores/localeStore';
import { useFamilyStore } from '../stores/familyStore';
import { localize } from '../i18n/localize';
import { formatLifespan } from '../format/lifespan';
import { formatPersonName } from '../format/personName';
import { personSlug } from '../utils/personSlug';
import { activeFamilyId, familyLocation } from '../router/familyRoutes';
import type { LocalizedText, PersonDetail } from '../types/family';
import { useFamilyLinks } from '../composables/useFamilyLinks';
import VocationIcon from './VocationIcon.vue';
import { resolveMediaUrl } from '../media/mediaUrl';
import type { MediaItem } from '../media/types';
import MediaLightbox from './MediaLightbox.vue';

const props = defineProps<{ detail: PersonDetail }>();
const { t, te } = useI18n({ useScope: 'global' });
const localeStore = useLocaleStore();
const familyStore = useFamilyStore();
const route = useRoute();

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

// Reverse of MemberDetail's "Find on tree": this person's full dossier on the members page. A link (not a
// button) so it can open in a new tab; the bare id is a valid slug until the family graph has resolved.
const membersTarget = computed(() => {
  const person = familyStore.personById(props.detail.id);
  return familyLocation('members', activeFamilyId(route), { slug: person ? personSlug(person) : props.detail.id });
});

const { links: familyLinks, label: familyLinkLabel, target: familyLinkTarget } = useFamilyLinks(() => props.detail);
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
        <div class="header__actions">
          <RouterLink :to="membersTarget" class="header__action" data-test="open-in-members">
            {{ t('members.openInMembers') }}
          </RouterLink>
          <RouterLink
            v-for="link in familyLinks"
            :key="`${link.family}-${link.relation}-${link.personId ?? ''}`"
            :to="familyLinkTarget(link)"
            class="header__action"
            data-test="open-family-link"
          >{{ familyLinkLabel(link) }}</RouterLink>
        </div>
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
// The "open in members" button and any family-link buttons are grouped in one wrapper so a single
// auto margin pushes the whole group to the row's right edge, instead of each button carrying its
// own auto margin and drifting apart from the others.
.header__actions { margin-left: auto; display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.header__action {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 16px; font-family: var(--font-body); font-size: 15px; letter-spacing: 0.3px;
  color: var(--on-accent); background: var(--bark); border: 1px solid var(--bark-dark); border-radius: 999px; cursor: pointer;
  text-decoration: none;
  &:hover { background: var(--bark-dark); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
</style>
