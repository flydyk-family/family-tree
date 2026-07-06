<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatPersonName } from '../format/personName';
import { formatLifespan } from '../format/lifespan';
import { fetchPerson } from '../api/familyApi';
import { personSlug } from '../utils/personSlug';
import { resolveMediaUrl } from '../media/mediaUrl';
import type { PersonDetail } from '../types/family';
import PersonPhotos from './PersonPhotos.vue';
import MemberFamilySheet from './MemberFamilySheet.vue';

const props = defineProps<{ personId: string }>();
const { t, te } = useI18n({ useScope: 'global' });
const localeStore = useLocaleStore();
const store = useFamilyStore();
const { people, unions } = storeToRefs(store);
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

function loc(text: PersonDetail['maidenName']): string {
  return localize(text, localeStore.currentLocale);
}

const fullName = computed(() =>
  detail.value ? formatPersonName(detail.value.givenName, detail.value.surname, localeStore.currentLocale) : '');
const maidenName = computed(() => (detail.value?.maidenName ? loc(detail.value.maidenName) : ''));
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

function residenceYears(fromYear: number | null, toYear: number | null): string {
  const from = fromYear ?? '';
  const to = toYear ?? t('person.present');
  if (from === '' && toYear == null) {
    return '';
  }
  return `${from}–${to}`;
}

function selectRelative(id: string): void {
  const person = store.personById(id);
  void router.push({ name: 'members', params: { slug: person ? personSlug(person) : id } });
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
      <header class="member-detail__header">
        <img v-if="portraitUrl" class="member-detail__portrait" :src="portraitUrl" :alt="fullName" />
        <div v-else class="member-detail__portrait member-detail__portrait--fallback" aria-hidden="true">
          {{ fullName.charAt(0).toUpperCase() }}
        </div>
        <div class="member-detail__heading">
          <h2 class="member-detail__name">{{ fullName }}</h2>
          <p v-if="maidenName" class="member-detail__maiden">{{ t('person.nee') }} {{ maidenName }}</p>
          <p class="member-detail__life">{{ lifespan }}</p>
          <button type="button" class="member-detail__find" data-test="find-on-tree" @click="findOnTree">
            {{ t('members.findOnTree') }} &rarr;
          </button>
        </div>
      </header>

      <dl class="member-detail__fields">
        <div v-if="sexLabel"><dt>{{ t('members.field.sex') }}</dt><dd>{{ sexLabel }}</dd></div>
        <div v-if="vocationLabel"><dt>{{ t('members.field.vocation') }}</dt><dd>{{ vocationLabel }}</dd></div>
      </dl>

      <section v-if="detail.biography && (detail.biography.ru || detail.biography.be || detail.biography.en)" class="member-detail__bio">
        <h3>{{ t('members.biography') }}</h3>
        <p>{{ localize(detail.biography, localeStore.currentLocale) }}</p>
      </section>

      <section v-if="detail.residences.length > 0" class="member-detail__residences">
        <h3>{{ t('members.residences') }}</h3>
        <ul>
          <li v-for="(r, i) in detail.residences" :key="i">
            {{ localize(r.place, localeStore.currentLocale) }}
            <span v-if="r.fromYear || r.toYear">({{ residenceYears(r.fromYear, r.toYear) }})</span>
          </li>
        </ul>
      </section>

      <PersonPhotos :detail="detail" :can-edit="false" :name="fullName" />

      <MemberFamilySheet :person-id="props.personId" :people="people" :unions="unions" @select="selectRelative" />
    </template>
  </article>
</template>

<style scoped lang="scss">
.member-detail { display: flex; flex-direction: column; gap: 20px; padding: 4px 8px 40px; }
.member-detail__status { padding: 24px; font-style: italic; color: var(--ink-soft); &--error { color: #8a3b32; } }
.member-detail__header { display: flex; gap: 16px; align-items: center; }
.member-detail__portrait { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; border: 1px solid var(--gilt); flex: 0 0 auto; }
.member-detail__portrait--fallback {
  display: flex; align-items: center; justify-content: center;
  font-size: 36px; font-family: var(--font-display); color: var(--ink-soft);
  background: var(--parchment-2);
}
.member-detail__name { margin: 0; font-family: var(--font-display); color: var(--ink); }
.member-detail__maiden { margin: 2px 0 0; font-style: italic; color: var(--ink-soft); }
.member-detail__life { margin: 2px 0 8px; font-style: italic; color: var(--ink-soft); }
.member-detail__find {
  padding: 6px 14px; font-family: var(--font-display); color: var(--on-accent);
  background: var(--bark); border: 1px solid var(--bark-dark); border-radius: 8px; cursor: pointer;
  &:hover { background: var(--bark-dark); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.member-detail__fields {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 0;
  dt { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-soft); }
  dd { margin: 2px 0 0; font-family: var(--font-body); color: var(--ink); }
}
.member-detail__bio h3, .member-detail__residences h3 { font-family: var(--font-display); color: var(--ink); }
.member-detail__bio p { line-height: 1.6; color: var(--ink-soft); white-space: pre-wrap; }
.member-detail__residences ul { margin: 0; padding: 0; list-style: none; }
.member-detail__residences li { padding: 3px 0; color: var(--ink); }
</style>
