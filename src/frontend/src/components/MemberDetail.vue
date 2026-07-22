<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useLocaleStore } from '../stores/localeStore';
import { useAuthStore } from '../stores/authStore';
import { localize } from '../i18n/localize';
import { formatPersonName } from '../format/personName';
import { formatLifespan, formatEventDate } from '../format/lifespan';
import { fetchPerson } from '../api/familyApi';
import { personSlug } from '../utils/personSlug';
import { resolveMediaUrl } from '../media/mediaUrl';
import type { LocalizedText, PersonDetail } from '../types/family';
import PersonPhotos from './PersonPhotos.vue';
import MemberFieldsEditor from './MemberFieldsEditor.vue';
import BiographyEditor from './BiographyEditor.vue';
import ResidencesEditor from './ResidencesEditor.vue';
import MapPinIcon from './MapPinIcon.vue';

const props = defineProps<{ personId: string }>();
const { t, te } = useI18n({ useScope: 'global' });
const localeStore = useLocaleStore();
const store = useFamilyStore();
const selection = useSelectionStore();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

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
  detail.value ? formatPersonName(detail.value.givenName, detail.value.middleName, detail.value.surname, localeStore.currentLocale) : '');
const givenName = computed(() => loc(detail.value?.givenName ?? null));
const surname = computed(() => loc(detail.value?.surname ?? null));
const maidenName = computed(() => loc(detail.value?.maidenName ?? null));
const middleName = computed(() => loc(detail.value?.middleName ?? null));
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
// A maiden name is only meaningful for women — never shown for male persons.
const showMaidenName = computed(() => detail.value != null && detail.value.sex !== 'male');

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

const editing = ref(false);
const canEdit = computed(() => auth.canEdit);

// Close the editor if the panel switches to a different person.
watch(() => props.personId, () => { editing.value = false; });

// The fields and residences editors both snapshot their PUT-profile payload base
// (getProfile) once at mount; if both were open, saving one would carry the
// other's now-stale base and silently wipe its just-saved change. Keep them
// mutually exclusive — opening one closes the other. Biography uses a separate
// endpoint (PUT /api/people/{id}/biography), so it isn't part of this hazard.
function openFieldsEditor(): void {
  editingResidences.value = false;
  editing.value = true;
}
function openResidencesEditor(): void {
  editing.value = false;
  editingResidences.value = true;
}

const editingBio = ref(false);
watch(() => props.personId, () => { editingBio.value = false; });
function onBioSaved(updated: PersonDetail): void {
  detail.value = updated;
  // The tree popup/rail render from the selection store's per-id cache; refresh it
  // so an edit made here isn't stale on the tree until a full page reload.
  selection.applyDetail(updated);
  editingBio.value = false;
}

const editingResidences = ref(false);
watch(() => props.personId, () => { editingResidences.value = false; });
function onResidencesSaved(updated: PersonDetail): void {
  // Residences affect neither the oak layout, the era frame, nor the URL slug —
  // just keep the detail and the tree's selection cache in step, no store.load().
  detail.value = updated;
  selection.applyDetail(updated);
  editingResidences.value = false;
}

async function onSaved(updated: PersonDetail): Promise<void> {
  const previousBirthYear = detail.value?.birth?.year ?? null;
  detail.value = updated;
  editing.value = false;

  // Keep the tree's selection cache in step with the edit (name/dates/biography),
  // so the popup and rail don't render a stale copy until the page is reloaded.
  selection.applyDetail(updated);

  store.applyPersonProfile(updated.id, {
    givenName: updated.givenName,
    surname: updated.surname,
    maidenName: updated.maidenName,
    middleName: updated.middleName,
    sex: updated.sex,
    vocation: updated.vocation,
    birthYear: updated.birth?.year ?? null,
    deathYear: updated.death?.year ?? null
  });

  // A birth-year change moves the person in the oak layout and its era frame — refetch.
  if ((updated.birth?.year ?? null) !== previousBirthYear) {
    await store.load();
  }

  const summary = store.personById(updated.id);
  if (summary) {
    const nextSlug = personSlug(summary);
    if (route.params.slug !== nextSlug) {
      void router.replace({ name: 'members', params: { slug: nextSlug } });
    }
  }
}
</script>

<template>
  <article class="member-detail" data-test="member-detail">
    <p v-if="loading" class="member-detail__status">{{ t('status.loading') }}</p>
    <p v-else-if="error" class="member-detail__status member-detail__status--error">{{ error }}</p>
    <template v-else-if="detail">
      <!-- Header: an editor-only action row (kept clear of the name) above the
           centered portrait medallion + name + lifespan + Find on tree group. -->
      <header class="member-detail__header">
        <div v-if="canEdit && !editing" class="member-detail__header-actions">
          <button
            type="button"
            class="member-detail__edit"
            data-test="fields-edit"
            @click="openFieldsEditor"
          >
            <span class="member-detail__edit-icon" aria-hidden="true">✎</span>
            {{ t('members.editProfile') }}
          </button>
        </div>
        <div class="member-detail__header-main">
          <div class="member-detail__portrait-frame">
            <img v-if="portraitUrl" class="member-detail__portrait" :src="portraitUrl" :alt="fullName" />
            <div v-else class="member-detail__portrait member-detail__portrait--fallback" aria-hidden="true">
              {{ fullName.charAt(0).toUpperCase() }}
            </div>
          </div>
          <div class="member-detail__heading">
            <h2 class="member-detail__name">{{ fullName }}</h2>
            <p v-if="maidenName && showMaidenName" class="member-detail__maiden">{{ t('person.nee') }} {{ maidenName }}</p>
            <p class="member-detail__life">{{ lifespan }}</p>
            <button type="button" class="member-detail__find" data-test="find-on-tree" @click="findOnTree">
              <span class="member-detail__find-icon" aria-hidden="true">⌖</span>
              {{ t('members.findOnTree') }}
            </button>
          </div>
        </div>
      </header>

      <!-- Field tablets (read-only) OR the inline editor -->
      <MemberFieldsEditor
        v-if="editing"
        :person-id="detail.id"
        :detail="detail"
        @saved="onSaved"
        @cancel="editing = false"
      />
      <div v-else class="member-detail__fields" data-test="member-fields">
        <!-- Names -->
        <div class="member-detail__tablets">
          <div class="member-detail__tablet">
            <span class="member-detail__label">{{ t('members.field.givenName') }}</span>
            <span class="member-detail__value">{{ givenName || '—' }}</span>
          </div>
          <div class="member-detail__tablet">
            <span class="member-detail__label">{{ t('members.field.middleName') }}</span>
            <span class="member-detail__value">{{ middleName || '—' }}</span>
          </div>
          <div class="member-detail__tablet">
            <span class="member-detail__label">{{ t('members.field.surname') }}</span>
            <span class="member-detail__value">{{ surname || '—' }}</span>
          </div>
          <div v-if="showMaidenName" class="member-detail__tablet">
            <span class="member-detail__label">{{ t('members.field.maidenName') }}</span>
            <span class="member-detail__value">{{ maidenName || '—' }}</span>
          </div>
        </div>
        <!-- Born / Died on their own line -->
        <div class="member-detail__tablets">
          <div class="member-detail__tablet">
            <span class="member-detail__label">{{ t('members.field.birth') }}</span>
            <span class="member-detail__value">{{ birthDate || '—' }}<span v-if="birthPlace" class="member-detail__value-place"> ({{ birthPlace }})</span></span>
          </div>
          <div v-if="deathDate || deathPlace" class="member-detail__tablet">
            <span class="member-detail__label">{{ t('members.field.death') }}</span>
            <span class="member-detail__value">{{ deathDate || '—' }}<span v-if="deathPlace" class="member-detail__value-place"> ({{ deathPlace }})</span></span>
          </div>
        </div>
        <!-- Sex + Vocation on a separate line, below the dates -->
        <div class="member-detail__tablets">
          <div class="member-detail__tablet">
            <span class="member-detail__label">{{ t('members.field.sex') }}</span>
            <span class="member-detail__value">{{ sexLabel || '—' }}</span>
          </div>
          <div class="member-detail__tablet">
            <span class="member-detail__label">{{ t('members.field.vocation') }}</span>
            <span class="member-detail__value">{{ vocationLabel || '—' }}</span>
          </div>
        </div>
      </div>

      <!-- Biography + Residences side by side -->
      <div class="member-detail__columns">
        <section v-if="hasBiography || canEdit" class="member-detail__panel member-detail__bio">
          <div class="member-detail__panel-head">
            <h3 class="member-detail__panel-title">{{ t('members.biography') }}</h3>
            <button
              v-if="canEdit && !editingBio"
              type="button"
              class="member-detail__bio-edit"
              data-test="bio-edit"
              :aria-label="hasBiography ? t('editor.edit') : t('editor.add')"
              @click="editingBio = true"
            >✎</button>
          </div>
          <BiographyEditor
            v-if="editingBio"
            :person-id="detail.id"
            :biography="detail.biography"
            @saved="onBioSaved"
            @cancel="editingBio = false"
          />
          <p v-else-if="hasBiography" class="member-detail__bio-text">{{ biographyText }}</p>
          <p v-else class="member-detail__bio-empty">{{ t('editor.empty') }}</p>
        </section>

        <section v-if="detail.residences.length > 0 || canEdit" class="member-detail__panel member-detail__residences">
          <div class="member-detail__panel-head">
            <h3 class="member-detail__panel-title">{{ t('members.residences') }}</h3>
            <button
              v-if="canEdit && !editingResidences"
              type="button"
              class="member-detail__bio-edit"
              data-test="residences-edit"
              :aria-label="t('members.editResidences')"
              @click="openResidencesEditor"
            >✎</button>
          </div>
          <ResidencesEditor
            v-if="editingResidences"
            :person-id="detail.id"
            :detail="detail"
            @saved="onResidencesSaved"
            @cancel="editingResidences = false"
          />
          <ul v-else-if="detail.residences.length > 0" class="member-detail__residence-list">
            <li v-for="(r, i) in detail.residences" :key="i" class="member-detail__residence">
              <span class="member-detail__residence-place">{{ localize(r.place, localeStore.currentLocale) }}</span>
              <span class="member-detail__residence-meta">
                <span v-if="r.fromYear || r.toYear" class="member-detail__residence-years">{{ residenceYears(r.fromYear, r.toYear) }}</span>
                <a
                  v-if="r.mapUrl"
                  class="member-detail__residence-map"
                  data-test="residence-map-link"
                  :href="r.mapUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="t('person.viewOnMap')"
                >
                  <MapPinIcon />
                </a>
              </span>
            </li>
          </ul>
          <p v-else class="member-detail__bio-empty">{{ t('editor.empty') }}</p>
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
  // dossier, so the last section (gallery) isn't hidden behind it. The
  // horizontal padding gives the panels'/portrait's box-shadow room to render —
  // this element scrolls (overflow-y: auto), which per spec forces overflow-x
  // to auto too, clipping any shadow that would otherwise bleed past the edge.
  padding: 6px 20px 72px;
}
.member-detail__status { padding: 24px; font-style: italic; color: var(--ink-soft); &--error { color: var(--umber, #8a3b32); } }

/* Header — a large portrait medallion beside a prominent name block, kept
   together as a centered group, and carved off from the content by a rule. */
.member-detail__header {
  display: flex; flex-direction: column; gap: 10px;
  padding: 8px 8px 20px;
  border-bottom: 1px solid var(--gilt);
}
// Editor action row: right-aligned above the centered portrait/name group, so
// the Edit button never overlaps the name at any width.
.member-detail__header-actions { display: flex; justify-content: flex-end; }
.member-detail__header-main {
  display: flex; gap: 22px; align-items: center; justify-content: center;
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
  flex: 0 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center;
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
.member-detail__edit {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; font-family: var(--font-display); font-size: 14px;
  color: var(--ink); background: var(--surface-card);
  border: 1px solid var(--gilt); border-radius: 999px; cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.member-detail__edit-icon { font-size: 15px; }

/* Field tablets */
// Stacks the read-only field rows: names, then Born/Died on their own line, then
// Sex + Vocation below — each row is its own auto-fit tablet grid.
.member-detail__fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.member-detail__tablets {
  display: grid;
  // Cap each tablet at a readable width (no 1fr) so fields don't stretch to fill
  // the whole dossier — they sit left-aligned with empty space to the right.
  grid-template-columns: repeat(auto-fit, minmax(180px, 240px));
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
// Birth/death place rendered inline in parentheses to the right of the date, so
// the date tablet stays a single line rather than growing a second row.
.member-detail__value-place { font-family: var(--font-body); font-size: 13px; font-style: italic; color: var(--ink-soft); }

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
    // Theme-aware inner frame line (golden in Classic, muted grey in Film) — the
    // gilt tokens are remapped per theme, so never hardcode the gold here.
    border: 1px solid var(--gilt-light);
    border-radius: 8px;
    pointer-events: none;
  }
}
.member-detail__panel-title {
  margin: 0 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--panel-edge);
  font-family: var(--font-display); font-size: 20px; letter-spacing: 1px; color: var(--gilt-deep);
}
.member-detail__panel-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--panel-edge);
}
.member-detail__panel-head .member-detail__panel-title { margin: 0; padding-bottom: 0; border-bottom: none; }
.member-detail__bio-edit {
  flex: 0 0 auto; width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
  border: 1px solid var(--gilt); background: var(--surface-card); color: var(--gilt-deep);
  display: grid; place-items: center;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.member-detail__bio-text { margin: 0; font-size: 18px; line-height: 1.65; color: var(--ink-soft); white-space: pre-wrap; }
.member-detail__bio-empty { margin: 0; font-style: italic; color: var(--ink-soft); }
.member-detail__residence-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.member-detail__residence {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  padding-bottom: 6px; border-bottom: 1px solid var(--panel-edge);
  &:last-child { border-bottom: none; padding-bottom: 0; }
}
.member-detail__residence-place { font-size: 18px; color: var(--ink); }
.member-detail__residence-years { font-style: italic; font-size: 16px; color: var(--ink-soft); white-space: nowrap; }
.member-detail__residence-meta { display: inline-flex; align-items: center; gap: 10px; }
// Matches the tree popup's residence map link (PersonDossier `.dossier__map`)
// so the same affordance reads identically in both surfaces.
.member-detail__residence-map {
  text-decoration: none; display: inline-flex; align-items: center; color: var(--ink-soft);
  &:hover { color: var(--leaf-deep); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}

@media (max-width: 860px) {
  .member-detail__columns { grid-template-columns: 1fr; }
}
</style>
