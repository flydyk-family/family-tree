<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatPersonName } from '../format/personName';
import type { LocalizedText, PersonDetail, Residence } from '../types/family';
import { residenceMapHref } from '../maps/mapLink';
import ChroniclePager from './ChroniclePager.vue';
import BiographyEditor from './BiographyEditor.vue';
import PersonPhotos from './PersonPhotos.vue';
import MapPinIcon from './MapPinIcon.vue';
import { useAuthStore } from '../stores/authStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useFamilyStore } from '../stores/familyStore';

const props = defineProps<{ detail: PersonDetail; editable?: boolean }>();
const { t, te } = useI18n({ useScope: 'global' });
const localeStore = useLocaleStore();
const auth = useAuthStore();
const selection = useSelectionStore();
const family = useFamilyStore();

const editing = ref(false);
const canEdit = computed(() => props.editable === true && auth.canEdit);
const displayName = computed(() =>
  formatPersonName(props.detail.givenName, props.detail.middleName, props.detail.surname, localeStore.currentLocale));

// Close the editor if the panel is reused for a different person, so a stale
// editor for the previous person can't linger over the new one.
watch(() => props.detail.id, () => { editing.value = false; });

function onSaved(updated: PersonDetail): void {
  selection.applyDetail(updated);
  editing.value = false;
}

function onDetailUpdated(updated: PersonDetail): void {
  selection.applyDetail(updated);
  family.applyPersonMedia(updated.id, updated.portrait ?? null, updated.portraitThumb ?? null);
}

function loc(text: LocalizedText | null | undefined): string {
  return localize(text, localeStore.currentLocale);
}
const summaryText = computed(() => loc(props.detail.summary));
const biographyText = computed(() => loc(props.detail.biography));

function socialLabel(type: string): string {
  const key = `social.${type}`;
  return te(key) ? t(key) : type;
}
function mapHref(r: Residence): string | null {
  return residenceMapHref(loc(r.place), r.lat, r.lng, r.mapUrl);
}
function residenceYears(fromYear: number | null, toYear: number | null): string {
  const from = fromYear ?? '';
  const to = toYear ?? t('person.present');
  if (from === '' && toYear == null) {
    return '';
  }
  return `${from}–${to}`;
}
</script>

<template>
  <div class="dossier" data-test="person-dossier">
    <p v-if="summaryText" class="dossier__summary" data-cascade>{{ summaryText }}</p>

    <PersonPhotos :detail="detail" :can-edit="canEdit" :name="displayName" @updated="onDetailUpdated" />

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

    <section v-if="detail.residences.length" class="dossier__block" data-cascade>
      <h3 class="dossier__title">{{ t('person.residences') }}</h3>
      <ul class="dossier__list" data-test="residences">
        <li v-for="(r, i) in detail.residences" :key="i" class="dossier__residence">
          <span class="dossier__place">{{ loc(r.place) }}</span>
          <span class="dossier__years">{{ residenceYears(r.fromYear, r.toYear) }}</span>
          <a v-if="mapHref(r)" class="dossier__map" :href="mapHref(r) ?? undefined" target="_blank" rel="noopener noreferrer" :aria-label="t('person.viewOnMap')">
            <MapPinIcon />
          </a>
        </li>
      </ul>
    </section>

    <section v-if="detail.links.length" class="dossier__block" data-cascade>
      <h3 class="dossier__title">{{ t('person.links') }}</h3>
      <ul class="dossier__list dossier__links" data-test="links">
        <li v-for="link in detail.links" :key="link.url">
          <a :href="link.url" target="_blank" rel="noopener noreferrer">{{ socialLabel(link.type) }}</a>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped lang="scss">
.dossier { font-family: var(--font-body); color: var(--ink); }
.dossier__summary { margin: 0 0 4px; line-height: 1.5; font-size: 19px; }
.dossier__block { margin-top: 14px; }
.dossier__title { margin: 0 0 6px; font-size: 18px; font-family: var(--font-display); letter-spacing: 0.4px; text-transform: uppercase; color: var(--ink-soft); }
.dossier__list { margin: 0; padding: 0; list-style: none; font-size: 19px; }
.dossier__residence { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; }
.dossier__years { color: var(--ink-soft); font-size: 18px; }
.dossier__map { text-decoration: none; display: inline-flex; align-items: center; color: var(--ink-soft); }
.dossier__map:hover { color: var(--leaf-deep); }
.dossier__links a { color: var(--leaf-deep); }
// padding-right keeps the edit button off the popup's scroll gutter (matches the
// inset the inline editor uses below).
.dossier__bio-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; padding-right: 6px; }
.dossier__bio-head .dossier__title { margin: 0; }
.dossier__edit {
  flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
  border: 1px solid var(--gilt); background: linear-gradient(var(--control-grad-top), var(--control-grad-bottom));
  color: var(--gilt-deep); display: grid; place-items: center;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
.dossier__empty { margin: 0; font-style: italic; color: var(--ink-faint); }
</style>
