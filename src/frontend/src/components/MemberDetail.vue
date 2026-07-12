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
import CoatOfArms from './heraldry/CoatOfArms.vue';
import OrnamentDivider from './heraldry/OrnamentDivider.vue';

// `editable` gates the future edit seams (tablet pencils, residence add/edit/delete).
// Default false ships today with no inert controls rendered.
const props = withDefaults(defineProps<{ personId: string; editable?: boolean }>(), { editable: false });
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

// aria-label for a reserved tablet edit seam, e.g. "Edit Surname".
function editFieldLabel(fieldLabel: string): string {
  return t('members.editField', { field: fieldLabel });
}
</script>

<template>
  <article class="member-detail" data-test="member-detail">
    <p v-if="loading" class="member-detail__status">{{ t('status.loading') }}</p>
    <p v-else-if="error" class="member-detail__status member-detail__status--error">{{ error }}</p>
    <template v-else-if="detail">
      <!-- Header: oval gilt portrait frame + coronet finial + name + lifespan + Find on tree -->
      <header class="member-detail__header">
        <div class="member-detail__portrait-frame">
          <svg class="member-detail__coronet" viewBox="0 0 100 24" aria-hidden="true">
            <path
              d="M40 20 L42 8 L47 15 L50 3 L53 15 L58 8 L60 20 Z"
              fill="var(--gilt-light)"
              stroke="var(--gilt-deep)"
              stroke-width="1"
              stroke-linejoin="round"
            />
            <circle cx="42" cy="8" r="1.6" fill="var(--gilt-deep)" />
            <circle cx="50" cy="3" r="1.8" fill="var(--gilt-deep)" />
            <circle cx="58" cy="8" r="1.6" fill="var(--gilt-deep)" />
            <path d="M39 20 L61 20" stroke="var(--gilt-deep)" stroke-width="1.2" stroke-linecap="round" />
          </svg>
          <img v-if="portraitUrl" class="member-detail__portrait" :src="portraitUrl" :alt="fullName" />
          <div v-else class="member-detail__portrait member-detail__portrait--fallback" aria-hidden="true">
            {{ fullName.charAt(0).toUpperCase() }}
          </div>
        </div>
        <div class="member-detail__heading">
          <h2 class="member-detail__name">{{ fullName }}</h2>
          <p v-if="maidenName" class="member-detail__maiden">{{ t('person.nee') }} {{ maidenName }}</p>
          <div class="member-detail__divider">
            <OrnamentDivider />
          </div>
          <p class="member-detail__life">{{ lifespan }}</p>
          <button type="button" class="member-detail__find" data-test="find-on-tree" @click="findOnTree">
            <span class="member-detail__find-icon" aria-hidden="true">⌖</span>
            {{ t('members.findOnTree') }}
          </button>
        </div>
      </header>

      <!-- Field tablets: Given/Sex/Vocation, then Surname/Birth/Death, Maiden under Surname -->
      <section class="member-detail__fields">
        <div class="member-detail__crest-row">
          <CoatOfArms class="member-detail__crest" :size="60" />
        </div>
        <div class="member-detail__tablets" data-test="member-fields">
          <div class="member-detail__tablet member-detail__tablet--given">
            <button
              v-if="editable"
              type="button"
              class="member-detail__edit"
              data-test="field-edit"
              :aria-label="editFieldLabel(t('members.field.givenName'))"
            >✎</button>
            <span class="member-detail__label">{{ t('members.field.givenName') }}</span>
            <span class="member-detail__value">{{ givenName || '—' }}</span>
          </div>
          <div class="member-detail__tablet member-detail__tablet--sex">
            <button
              v-if="editable"
              type="button"
              class="member-detail__edit"
              data-test="field-edit"
              :aria-label="editFieldLabel(t('members.field.sex'))"
            >✎</button>
            <span class="member-detail__label">{{ t('members.field.sex') }}</span>
            <span class="member-detail__value">{{ sexLabel || '—' }}</span>
          </div>
          <div class="member-detail__tablet member-detail__tablet--vocation">
            <button
              v-if="editable"
              type="button"
              class="member-detail__edit"
              data-test="field-edit"
              :aria-label="editFieldLabel(t('members.field.vocation'))"
            >✎</button>
            <span class="member-detail__label">{{ t('members.field.vocation') }}</span>
            <span class="member-detail__value">{{ vocationLabel || '—' }}</span>
          </div>
          <div class="member-detail__tablet member-detail__tablet--surname">
            <button
              v-if="editable"
              type="button"
              class="member-detail__edit"
              data-test="field-edit"
              :aria-label="editFieldLabel(t('members.field.surname'))"
            >✎</button>
            <span class="member-detail__label">{{ t('members.field.surname') }}</span>
            <span class="member-detail__value">{{ surname || '—' }}</span>
          </div>
          <div class="member-detail__tablet member-detail__tablet--maiden">
            <button
              v-if="editable"
              type="button"
              class="member-detail__edit"
              data-test="field-edit"
              :aria-label="editFieldLabel(t('members.field.maidenName'))"
            >✎</button>
            <span class="member-detail__label">{{ t('members.field.maidenName') }}</span>
            <span class="member-detail__value">{{ maidenName || '—' }}</span>
          </div>
          <div class="member-detail__tablet member-detail__tablet--birth">
            <button
              v-if="editable"
              type="button"
              class="member-detail__edit"
              data-test="field-edit"
              :aria-label="editFieldLabel(t('members.field.birth'))"
            >✎</button>
            <span class="member-detail__label">{{ t('members.field.birth') }}</span>
            <span class="member-detail__value">{{ birthDate || '—' }}</span>
            <span v-if="birthPlace" class="member-detail__value-sub">{{ birthPlace }}</span>
          </div>
          <div v-if="deathDate || deathPlace" class="member-detail__tablet member-detail__tablet--death">
            <button
              v-if="editable"
              type="button"
              class="member-detail__edit"
              data-test="field-edit"
              :aria-label="editFieldLabel(t('members.field.death'))"
            >✎</button>
            <span class="member-detail__label">{{ t('members.field.death') }}</span>
            <span class="member-detail__value">{{ deathDate || '—' }}</span>
            <span v-if="deathPlace" class="member-detail__value-sub">{{ deathPlace }}</span>
          </div>
        </div>
      </section>

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
              <svg class="member-detail__residence-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M8 1.2 L14.5 6.8 V14.8 H1.5 V6.8 Z"
                  fill="none"
                  stroke="var(--gilt-deep)"
                  stroke-width="1.2"
                  stroke-linejoin="round"
                />
                <rect x="6.3" y="9.6" width="3.4" height="5.2" fill="var(--gilt-deep)" />
              </svg>
              <span class="member-detail__residence-place">{{ localize(r.place, localeStore.currentLocale) }}</span>
              <span v-if="r.fromYear || r.toYear" class="member-detail__residence-years">{{ residenceYears(r.fromYear, r.toYear) }}</span>
              <span v-if="editable" class="member-detail__residence-actions">
                <button type="button" class="member-detail__edit" data-test="residence-edit" :aria-label="t('members.editResidence')">✎</button>
                <button type="button" class="member-detail__edit" data-test="residence-delete" :aria-label="t('members.deleteResidence')">✕</button>
              </span>
            </li>
          </ul>
          <button v-if="editable" type="button" class="member-detail__add-residence" data-test="add-residence">
            <span aria-hidden="true">+</span> {{ t('members.addResidence') }}
          </button>
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

/* Header — an oval gilt-framed portrait (coronet finial) beside a prominent
   name block, kept together as a centered group, carved off by a rule. */
.member-detail__header {
  display: flex; gap: 22px; align-items: center; justify-content: center;
  padding: 26px 8px 20px;
  border-bottom: 1px solid var(--gilt);
}
.member-detail__portrait-frame {
  position: relative;
  flex: 0 0 auto;
  width: 148px;
  height: 172px;
  padding: 8px;
  border-radius: 50% / 42%;
  background: var(--surface-card);
  border: 3px solid var(--gilt);
  // Layered gilt rings via inset box-shadows (token-only, no hardcoded gold).
  box-shadow:
    inset 0 0 0 2px var(--gilt-light),
    inset 0 0 0 7px var(--gilt-deep),
    0 4px 14px var(--shadow, rgba(0, 0, 0, 0.2));
}
.member-detail__coronet {
  position: absolute;
  top: -20px; left: 50%;
  width: 46px; height: 22px;
  transform: translateX(-50%);
  pointer-events: none;
}
.member-detail__portrait { width: 100%; height: 100%; border-radius: 50% / 42%; object-fit: cover; display: block; }
.member-detail__portrait--fallback {
  display: flex; align-items: center; justify-content: center;
  font-size: 52px; font-family: var(--font-display); color: var(--ink-soft);
  background: var(--stat-card-bg);
}
.member-detail__heading {
  flex: 0 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center;
}
.member-detail__name { margin: 0; font-family: var(--font-display); font-size: 40px; line-height: 1.08; letter-spacing: 1.5px; color: var(--ink); }
.member-detail__maiden { margin: 6px 0 0; font-style: italic; color: var(--ink-soft); }
.member-detail__divider { width: 150px; max-width: 60%; height: 14px; margin: 8px 0; }
.member-detail__life { margin: 0 0 16px; font-family: var(--font-display); font-style: italic; font-size: 24px; color: var(--ink-soft); }
.member-detail__find {
  display: inline-flex; align-items: center; gap: 8px; min-height: 44px;
  padding: 9px 22px; font-family: var(--font-display); font-size: 16px; letter-spacing: 0.5px;
  color: var(--bark-dark);
  background: linear-gradient(180deg, var(--gilt-light), var(--gilt));
  border: 1px solid var(--gilt-deep); border-radius: 999px; cursor: pointer;
  box-shadow: 0 3px 10px var(--shadow, rgba(0, 0, 0, 0.18));
  &:hover { background: linear-gradient(180deg, var(--gilt), var(--gilt-deep)); }
  &:focus-visible { outline: 2px solid var(--gilt-deep); outline-offset: 2px; }
}
.member-detail__find-icon { font-size: 18px; }

/* Field tablets: a decorative coat-of-arms watermark sits top-right, behind
   the grid, so it never competes with the tablet text. */
.member-detail__fields {
  position: relative;
}
.member-detail__crest-row {
  position: absolute;
  top: -10px; right: 0;
  z-index: 0;
  opacity: 0.5;
  pointer-events: none;
}
.member-detail__tablets {
  position: relative;
  z-index: 1;
  display: grid;
  // minmax(0, 1fr) — NOT a fixed pixel minimum: the detail pane can be much
  // narrower than the viewport (it shares desktop width with the roster
  // rail), so a hard per-column minimum reintroduces horizontal overflow.
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-areas:
    "given   sex     vocation"
    "surname birth   death"
    "maiden  birth   death";
  gap: 12px;
}
.member-detail__tablet {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0; // let the grid item shrink below its text's min-content size
  padding: 12px 14px;
  background: var(--stat-card-bg);
  border: 1px solid var(--gilt);
  border-radius: 9px;

  &--given { grid-area: given; }
  &--sex { grid-area: sex; }
  &--vocation { grid-area: vocation; }
  &--surname { grid-area: surname; }
  &--maiden { grid-area: maiden; }
  &--birth { grid-area: birth; justify-content: center; }
  &--death { grid-area: death; justify-content: center; }

  // Direct child only — residence-row edit/delete buttons reuse .member-detail__edit
  // but sit inline in a flex row, not absolutely positioned like the tablet seam.
  > .member-detail__edit {
    position: absolute;
    top: 6px; right: 6px;
  }
}
.member-detail__edit {
  width: 24px; height: 24px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; line-height: 1;
  color: var(--gilt-deep);
  background: transparent;
  border: 1px solid var(--gilt);
  border-radius: 6px;
  cursor: pointer;
  &:hover { background: var(--stat-card-bg); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.member-detail__label {
  font-family: var(--font-body); font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--gilt-deep);
  overflow-wrap: anywhere;
}
.member-detail__value { font-family: var(--font-display); font-size: 18px; color: var(--ink); overflow-wrap: anywhere; }
.member-detail__value-sub { font-family: var(--font-body); font-size: 13px; font-style: italic; color: var(--ink-soft); overflow-wrap: anywhere; }

// The detail pane shares desktop width with the roster rail (see MembersView's
// two-column layout), so it can be well under 900px wide even on a wide
// viewport — this reflow is driven by the same threshold, not just <=640px.
@media (max-width: 900px) {
  .member-detail__crest-row { display: none; }
  .member-detail__tablets {
    grid-template-columns: 1fr;
    grid-template-areas: none;
  }
  .member-detail__tablet { grid-area: auto; }
}

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
.member-detail__bio-text { margin: 0; line-height: 1.65; color: var(--ink-soft); white-space: pre-wrap; }
.member-detail__residence-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.member-detail__residence {
  display: flex; align-items: center; gap: 8px;
  padding-bottom: 6px; border-bottom: 1px solid var(--panel-edge);
  &:last-child { border-bottom: none; padding-bottom: 0; }
}
.member-detail__residence-icon { flex: 0 0 auto; width: 14px; height: 14px; }
.member-detail__residence-place { flex: 1 1 auto; min-width: 0; color: var(--ink); }
.member-detail__residence-years { flex: 0 0 auto; font-style: italic; font-size: 13px; color: var(--ink-soft); white-space: nowrap; }
.member-detail__residence-actions { flex: 0 0 auto; display: flex; gap: 4px; }
.member-detail__add-residence {
  display: inline-flex; align-items: center; gap: 6px; min-height: 44px; align-self: flex-start;
  margin-top: 10px;
  padding: 8px 16px;
  font-family: var(--font-body); font-size: 13px; color: var(--ink-soft);
  background: transparent;
  border: 1px dashed var(--gilt);
  border-radius: 8px;
  cursor: pointer;
  &:hover { background: var(--stat-card-bg); color: var(--ink); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}

@media (max-width: 860px) {
  .member-detail__columns { grid-template-columns: 1fr; }
}
</style>
