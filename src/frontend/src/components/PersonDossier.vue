<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import type { LocalizedText, PersonDetail } from '../types/family';
import ChroniclePager from './ChroniclePager.vue';

const props = defineProps<{ detail: PersonDetail }>();
const { t, te } = useI18n({ useScope: 'global' });
const localeStore = useLocaleStore();

function loc(text: LocalizedText | null | undefined): string {
  return localize(text, localeStore.currentLocale);
}
const summaryText = computed(() => loc(props.detail.summary));
const biographyText = computed(() => loc(props.detail.biography));

function socialLabel(type: string): string {
  const key = `social.${type}`;
  return te(key) ? t(key) : type;
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

    <section v-if="biographyText" class="dossier__block" data-cascade data-test="biography">
      <h3 class="dossier__title">{{ t('person.biography') }}</h3>
      <ChroniclePager :text="biographyText" />
    </section>

    <section v-if="detail.residences.length" class="dossier__block" data-cascade>
      <h3 class="dossier__title">{{ t('person.residences') }}</h3>
      <ul class="dossier__list" data-test="residences">
        <li v-for="(r, i) in detail.residences" :key="i" class="dossier__residence">
          <span class="dossier__place">{{ loc(r.place) }}</span>
          <span class="dossier__years">{{ residenceYears(r.fromYear, r.toYear) }}</span>
          <a v-if="r.mapUrl" class="dossier__map" :href="r.mapUrl" target="_blank" rel="noopener noreferrer" :aria-label="t('person.viewOnMap')">
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
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
</style>
