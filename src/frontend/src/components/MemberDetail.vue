<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatPersonName } from '../format/personName';
import { formatLifespan, formatEventDate } from '../format/lifespan';
import { fetchPerson } from '../api/familyApi';
import { personSlug } from '../utils/personSlug';
import { resolveMediaUrl } from '../media/mediaUrl';
import type { LocalizedText, PersonDetail } from '../types/family';
import PersonPhotos from './PersonPhotos.vue';

const props = defineProps<{ personId: string }>();
const { t, te } = useI18n({ useScope: 'global' });
const localeStore = useLocaleStore();
const store = useFamilyStore();
const router = useRouter();

const detail = ref<PersonDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function load(id: string): Promise<void> {
  loading.value = true;
  error.value = null;
  detail.value = null;
  try {
    detail.value = await fetchPerson(id);
  } catch (e) {
    console.warn('Failed to load member detail', e);
    error.value = t('status.error');
  } finally {
    loading.value = false;
  }
}

watch(() => props.personId, id => { void load(id); }, { immediate: true });

function loc(text: LocalizedText | null): string {
  return text ? localize(text, localeStore.currentLocale) : '';
}

const fullName = computed(() =>
  detail.value ? formatPersonName(detail.value.givenName, detail.value.surname, localeStore.currentLocale) : '');
const givenName = computed(() => loc(detail.value?.givenName ?? null));
const surname = computed(() => loc(detail.value?.surname ?? null));
const maidenName = computed(() => loc(detail.value?.maidenName ?? null));
const lifespan = computed(() => (detail.value ? formatLifespan(detail.value.birth, detail.value.death) : ''));
const portraitUrl = computed(() => {
  const source = detail.value?.portraitThumb ?? detail.value?.portrait;
  return source ? resolveMediaUrl(source) : null;
});

function labelFor(prefix: string, value: string): string {
  if (!value) {
    return '';
  }
  const key = `${prefix}.${value}`;
  return te(key) ? t(key) : value;
}
const sexLabel = computed(() => (detail.value ? labelFor('sex', detail.value.sex) : ''));
const vocationLabel = computed(() => (detail.value ? labelFor('vocation', detail.value.vocation) : ''));

const birthDate = computed(() => (detail.value ? formatEventDate(detail.value.birth) : ''));
const birthPlace = computed(() => loc(detail.value?.birth?.place ?? null));
const deathDate = computed(() => (detail.value?.death ? formatEventDate(detail.value.death) : ''));
const deathPlace = computed(() => loc(detail.value?.death?.place ?? null));

const hasBiography = computed(() => {
  const b = detail.value?.biography;
  return !!b && !!(b.ru || b.be || b.en);
});
const biographyText = computed(() => (detail.value?.biography ? localize(detail.value.biography, localeStore.currentLocale) : ''));

function residenceYears(fromYear: number | null, toYear: number | null): string {
  const from = fromYear ?? '';
  const to = toYear ?? t('person.present');
  if (from === '' && toYear == null) {
    return '';
  }
  return `${from}–${to}`;
}

function findOnTree(): void {
  const person = detail.value ? store.personById(detail.value.id) : null;
  if (person) {
    void router.push({ name: 'person', params: { slug: personSlug(person) } });
  }
}
</script>

<template>
  <article class="member-detail" data-test="member-detail">
    <p v-if="loading" class="member-detail__status">{{ t('status.loading') }}</p>
    <p v-else-if="error" class="member-detail__status member-detail__status--error">{{ error }}</p>
    <template v-else-if="detail">
      <!-- Header: portrait medallion + name + lifespan + Find on tree -->
      <header class="member-detail__header">
        <div class="member-detail__portrait-frame">
          <img v-if="portraitUrl" class="member-detail__portrait" :src="portraitUrl" :alt="fullName" />
          <div v-else class="member-detail__portrait member-detail__portrait--fallback" aria-hidden="true">
            {{ fullName.charAt(0).toUpperCase() }}
          </div>
        </div>
        <div class="member-detail__heading">
          <h2 class="member-detail__name">{{ fullName }}</h2>
          <p v-if="maidenName" class="member-detail__maiden">{{ t('person.nee') }} {{ maidenName }}</p>
          <p class="member-detail__life">{{ lifespan }}</p>
          <button type="button" class="member-detail__find" data-test="find-on-tree" @click="findOnTree">
            <span class="member-detail__find-icon" aria-hidden="true">⌖</span>
            {{ t('members.findOnTree') }}
          </button>
        </div>
      </header>

      <!-- Field tablets -->
      <div class="member-detail__tablets" data-test="member-fields">
        <div class="member-detail__tablet">
          <span class="member-detail__label">{{ t('members.field.givenName') }}</span>
          <span class="member-detail__value">{{ givenName || '—' }}</span>
        </div>
        <div class="member-detail__tablet">
          <span class="member-detail__label">{{ t('members.field.surname') }}</span>
          <span class="member-detail__value">{{ surname || '—' }}</span>
        </div>
        <div class="member-detail__tablet">
          <span class="member-detail__label">{{ t('members.field.maidenName') }}</span>
          <span class="member-detail__value">{{ maidenName || '—' }}</span>
        </div>
        <div class="member-detail__tablet">
          <span class="member-detail__label">{{ t('members.field.sex') }}</span>
          <span class="member-detail__value">{{ sexLabel || '—' }}</span>
        </div>
        <div class="member-detail__tablet">
          <span class="member-detail__label">{{ t('members.field.vocation') }}</span>
          <span class="member-detail__value">{{ vocationLabel || '—' }}</span>
        </div>
        <div class="member-detail__tablet">
          <span class="member-detail__label">{{ t('members.field.birth') }}</span>
          <span class="member-detail__value">{{ birthDate || '—' }}</span>
          <span v-if="birthPlace" class="member-detail__value-sub">{{ birthPlace }}</span>
        </div>
        <div v-if="deathDate || deathPlace" class="member-detail__tablet">
          <span class="member-detail__label">{{ t('members.field.death') }}</span>
          <span class="member-detail__value">{{ deathDate || '—' }}</span>
          <span v-if="deathPlace" class="member-detail__value-sub">{{ deathPlace }}</span>
        </div>
      </div>

      <!-- Biography + Residences side by side -->
      <div class="member-detail__columns">
        <section v-if="hasBiography" class="member-detail__panel member-detail__bio">
          <h3 class="member-detail__panel-title">{{ t('members.biography') }}</h3>
          <p class="member-detail__bio-text">{{ biographyText }}</p>
        </section>

        <section v-if="detail.residences.length > 0" class="member-detail__panel member-detail__residences">
          <h3 class="member-detail__panel-title">{{ t('members.residences') }}</h3>
          <ul class="member-detail__residence-list">
            <li v-for="(r, i) in detail.residences" :key="i" class="member-detail__residence">
              <span class="member-detail__residence-place">{{ localize(r.place, localeStore.currentLocale) }}</span>
              <span v-if="r.fromYear || r.toYear" class="member-detail__residence-years">{{ residenceYears(r.fromYear, r.toYear) }}</span>
            </li>
          </ul>
        </section>
      </div>

      <PersonPhotos :detail="detail" :can-edit="false" :name="fullName" />
    </template>
  </article>
</template>

<style scoped lang="scss">
.member-detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
  // Bottom padding clears the collapsed family sheet handle that overlays the
  // dossier, so the last section (gallery) isn't hidden behind it.
  padding: 6px 12px 72px;
}
.member-detail__status { padding: 24px; font-style: italic; color: var(--ink-soft); &--error { color: var(--umber, #8a3b32); } }

/* Header — a large portrait medallion beside a prominent, centered name block,
   sitting on the open background (no frame; the framed areas are below). */
.member-detail__header {
  display: flex; gap: 30px; align-items: center;
  padding: 8px 8px 4px;
}
.member-detail__portrait-frame {
  flex: 0 0 auto;
  padding: 6px;
  border: 2px solid var(--gilt);
  border-radius: 50%;
  background: var(--surface-card);
  box-shadow: 0 4px 14px var(--shadow, rgba(0, 0, 0, 0.2));
}
.member-detail__portrait { width: 140px; height: 140px; border-radius: 50%; object-fit: cover; display: block; }
.member-detail__portrait--fallback {
  display: flex; align-items: center; justify-content: center;
  font-size: 56px; font-family: var(--font-display); color: var(--ink-soft);
  background: var(--stat-card-bg);
}
.member-detail__heading {
  flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center;
}
.member-detail__name { margin: 0; font-family: var(--font-display); font-size: 40px; line-height: 1.08; letter-spacing: 1.5px; color: var(--ink); }
.member-detail__maiden { margin: 6px 0 0; font-style: italic; color: var(--ink-soft); }
.member-detail__life { margin: 8px 0 16px; font-family: var(--font-display); font-style: italic; font-size: 24px; color: var(--ink-soft); }
.member-detail__find {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 20px; font-family: var(--font-display); font-size: 16px; letter-spacing: 0.5px;
  color: var(--on-accent); background: var(--bark); border: 1px solid var(--bark-dark); border-radius: 999px; cursor: pointer;
  &:hover { background: var(--bark-dark); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.member-detail__find-icon { font-size: 18px; }

/* Field tablets */
.member-detail__tablets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
}
.member-detail__tablet {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 14px;
  background: var(--stat-card-bg);
  border: 1px solid var(--gilt);
  border-radius: 9px;
}
.member-detail__label {
  font-family: var(--font-body); font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--gilt-deep);
}
.member-detail__value { font-family: var(--font-display); font-size: 18px; color: var(--ink); }
.member-detail__value-sub { font-family: var(--font-body); font-size: 13px; font-style: italic; color: var(--ink-soft); }

/* Biography + Residences columns, each a framed panel */
.member-detail__columns {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
  align-items: start;
}
.member-detail__panel {
  position: relative;
  padding: 18px 20px;
  background: var(--surface-card);
  border: 1px solid var(--gilt);
  border-radius: 12px;
  box-shadow: 0 6px 18px var(--shadow, rgba(0, 0, 0, 0.12));

  &::before {
    content: '';
    position: absolute;
    inset: 5px;
    border: 1px solid rgba(183, 145, 63, 0.55);
    border-radius: 8px;
    pointer-events: none;
  }
}
.member-detail__panel-title {
  margin: 0 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--panel-edge);
  font-family: var(--font-display); font-size: 20px; letter-spacing: 1px; color: var(--gilt-deep);
}
.member-detail__bio-text { margin: 0; line-height: 1.65; color: var(--ink-soft); white-space: pre-wrap; }
.member-detail__residence-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.member-detail__residence {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  padding-bottom: 6px; border-bottom: 1px solid var(--panel-edge);
  &:last-child { border-bottom: none; padding-bottom: 0; }
}
.member-detail__residence-place { color: var(--ink); }
.member-detail__residence-years { font-style: italic; font-size: 13px; color: var(--ink-soft); white-space: nowrap; }

@media (max-width: 860px) {
  .member-detail__columns { grid-template-columns: 1fr; }
}
</style>
