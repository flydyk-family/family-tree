<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useSelectionStore } from '../stores/selectionStore';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatLifespan } from '../format/lifespan';
import type { LocalizedText } from '../types/family';
import VocationIcon from './VocationIcon.vue';

const { t, te } = useI18n({ useScope: 'global' });
const selection = useSelectionStore();
const localeStore = useLocaleStore();
const { detail, mode, loading, error } = storeToRefs(selection);

function loc(text: LocalizedText | null | undefined): string {
  return localize(text, localeStore.currentLocale);
}
const fullName = computed(() => detail.value ? `${loc(detail.value.givenName)} ${loc(detail.value.surname)}`.trim() : '');
const maidenName = computed(() => (detail.value?.maidenName ? loc(detail.value.maidenName) : ''));
const lifespan = computed(() => (detail.value ? formatLifespan(detail.value.birth, detail.value.death) : ''));
const summaryText = computed(() => loc(detail.value?.summary));
const initial = computed(() => fullName.value.charAt(0).toUpperCase());
const vocationLabel = computed(() => {
  const v = detail.value?.vocation;
  if (!v) return '';
  const key = `vocation.${v}`;
  return te(key) ? t(key) : v;
});
function socialLabel(type: string): string {
  const key = `social.${type}`;
  return te(key) ? t(key) : type;
}
function residenceYears(fromYear: number | null, toYear: number | null): string {
  const from = fromYear ?? '';
  const to = toYear ?? t('person.present');
  if (from === '' && toYear == null) return '';
  return `${from}–${to}`;
}
</script>

<template>
  <div class="detail" data-test="person-detail">
    <p v-if="loading" class="detail__status">{{ t('person.loading') }}</p>
    <p v-else-if="error" class="detail__status detail__status--error">{{ t('person.error') }}</p>

    <template v-else-if="detail">
      <header class="detail__head">
        <div class="detail__portrait">
          <span class="detail__initial" data-test="portrait-fallback">{{ initial }}</span>
        </div>
        <div class="detail__heading">
          <h2 class="detail__name">{{ fullName }}</h2>
          <p v-if="maidenName" class="detail__maiden">{{ t('person.nee') }} {{ maidenName }}</p>
          <p class="detail__life">{{ lifespan }}</p>
          <p v-if="vocationLabel" class="detail__vocation">
            <VocationIcon :vocation="detail.vocation" />{{ vocationLabel }}
          </p>
        </div>
      </header>

      <p v-if="summaryText" class="detail__summary">{{ summaryText }}</p>

      <section v-if="mode === 'expanded'" class="detail__expanded">
        <div v-if="loc(detail.biography)" class="detail__block">
          <h3 class="detail__block-title">{{ t('person.biography') }}</h3>
          <p class="detail__bio" data-test="biography">{{ loc(detail.biography) }}</p>
        </div>
        <div v-if="detail.residences.length" class="detail__block">
          <h3 class="detail__block-title">{{ t('person.residences') }}</h3>
          <ul class="detail__list" data-test="residences">
            <li v-for="(r, i) in detail.residences" :key="i" class="detail__residence">
              <span class="detail__place">{{ loc(r.place) }}</span>
              <span class="detail__years">{{ residenceYears(r.fromYear, r.toYear) }}</span>
              <a v-if="r.mapUrl" class="detail__map" :href="r.mapUrl" target="_blank" rel="noopener noreferrer" :aria-label="t('person.viewOnMap')">🗺</a>
            </li>
          </ul>
        </div>
        <div v-if="detail.links.length" class="detail__block">
          <h3 class="detail__block-title">{{ t('person.links') }}</h3>
          <ul class="detail__list detail__links" data-test="links">
            <li v-for="link in detail.links" :key="link.url">
              <a :href="link.url" target="_blank" rel="noopener noreferrer">{{ socialLabel(link.type) }}</a>
            </li>
          </ul>
        </div>
      </section>

      <footer class="detail__actions">
        <button v-if="mode === 'normal'" type="button" class="detail__more" data-test="expand" @click="selection.expand()">{{ t('person.expand') }}</button>
        <button v-else type="button" class="detail__more" data-test="collapse" @click="selection.collapse()">{{ t('person.collapse') }}</button>
      </footer>
    </template>
  </div>
</template>

<style scoped lang="scss">
.detail { font-family: var(--font-body); color: var(--ink); }
.detail__status { margin: 8px 0; font-style: italic; &--error { color: #8a3b32; } }
.detail__head { display: flex; gap: 14px; align-items: center; }
.detail__portrait { flex: 0 0 auto; width: 72px; height: 72px; border-radius: 50%; border: 1px solid var(--glass-border); background: var(--parchment-2); display: flex; align-items: center; justify-content: center; }
.detail__initial { font-size: 32px; color: var(--ink-soft); }
.detail__name { margin: 0; font-size: 26px; font-family: var(--font-display); }
.detail__maiden, .detail__life, .detail__vocation { margin: 3px 0 0; font-size: 18px; color: var(--ink-soft); }
.detail__vocation { display: inline-flex; align-items: center; gap: 6px; }
.detail__summary { margin: 12px 0 0; line-height: 1.5; font-size: 17px; }
.detail__expanded { margin-top: 14px; border-top: 1px solid var(--glass-border); padding-top: 12px; }
.detail__block { margin-top: 12px; }
.detail__block-title { margin: 0 0 6px; font-size: 16px; font-family: var(--font-display); letter-spacing: 0.4px; text-transform: uppercase; color: var(--ink-soft); }
.detail__bio { margin: 0; line-height: 1.55; font-size: 16px; white-space: pre-line; }
.detail__list { margin: 0; padding: 0; list-style: none; font-size: 16px; }
.detail__residence { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; }
.detail__years { color: var(--ink-soft); font-size: 15px; }
.detail__map { text-decoration: none; }
.detail__links a { color: var(--leaf-deep); }
.detail__actions { margin-top: 14px; display: flex; gap: 10px; }
.detail__more { padding: 6px 14px; background: var(--parchment-2); border: 1px solid var(--ink-soft); border-radius: 6px; color: var(--ink); font: inherit; cursor: pointer; &:hover { background: var(--parchment); } &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; } }
</style>
