<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { LOCALE_OPTIONS, type Locale } from '../constants/locales';
import type { PersonDetail } from '../types/family';
import { getProfile, putProfile, ProfileSaveError, type PersonProfile } from '../api/profileApi';
import { seedDraft, buildProfilePayload, isOverridden, type ProfileDraft, type ProfileField } from '../composables/profileDraft';
import VocationIcon from './VocationIcon.vue';

const props = defineProps<{ personId: string; detail: PersonDetail }>();
const emit = defineEmits<{ saved: [detail: PersonDetail]; cancel: [] }>();
const { t } = useI18n({ useScope: 'global' });

const NAME_TABS: Locale[] = ['ru', 'be', 'en'];
const SEX_OPTIONS = ['male', 'female', 'unknown'] as const;
const VOCATION_OPTIONS = ['teacher', 'church', 'writer', 'office', 'other', 'unknown'] as const;
function localeName(code: Locale): string {
  return LOCALE_OPTIONS.find(o => o.code === code)?.nativeName ?? code;
}

const draft = reactive<ProfileDraft>(seedDraft(props.detail));
const original: ProfileDraft = seedDraft(props.detail);
const activeTab = ref<Locale>('ru');

const reverted = reactive<Set<ProfileField>>(new Set());
const saving = ref(false);
const error = ref<string | null>(null);
const fieldErrors = reactive<Record<string, string>>({});
const pendingDiscard = ref(false);

// The current sparse override (payload base + drives which fields show a reset control).
const base = ref<PersonProfile>({
  givenName: null, surname: null, maidenName: null, sex: null, birthYear: null, birthMonth: null, birthDay: null, deathYear: null, deathMonth: null, deathDay: null, vocation: null
});
const baseLoaded = ref(false);
void getProfile(props.personId)
  .then(p => { base.value = p; baseLoaded.value = true; })
  .catch(() => { error.value = t('members.loadFailed'); });

function toggleRevert(field: ProfileField): void {
  if (reverted.has(field)) {
    reverted.delete(field);
  } else {
    reverted.add(field);
  }
}
function canReset(field: ProfileField): boolean {
  return isOverridden(base.value, field);
}
function nameDirty(field: 'givenName' | 'surname' | 'maidenName'): boolean {
  return NAME_TABS.some(l => draft[field][l] !== original[field][l]);
}
const dirty = computed(() =>
  reverted.size > 0
  || nameDirty('givenName') || nameDirty('surname') || nameDirty('maidenName')
  || draft.sex !== original.sex
  || draft.vocation !== original.vocation
  || draft.birthYear !== original.birthYear
  || draft.birthMonth !== original.birthMonth
  || draft.birthDay !== original.birthDay
  || draft.deathYear !== original.deathYear
  || draft.deathMonth !== original.deathMonth
  || draft.deathDay !== original.deathDay
);

// Numeric proxy: empty string ↔ null (never NaN). Clearing a unit cascades to the
// lower units so a submitted date is always coherent (day needs month needs year).
function numberModel(field: 'birthYear' | 'birthMonth' | 'birthDay' | 'deathYear' | 'deathMonth' | 'deathDay', lower: ProfileField[]) {
  return computed<string>({
    get: () => (draft[field] == null ? '' : String(draft[field])),
    set: (v: string) => {
      const n = parseInt(v, 10);
      draft[field] = Number.isFinite(n) ? n : null;
      if (draft[field] == null) {
        for (const f of lower) {
          (draft as Record<ProfileField, unknown>)[f] = null;
        }
      }
    }
  });
}
const birthYear = numberModel('birthYear', ['birthMonth', 'birthDay']);
const birthMonth = numberModel('birthMonth', ['birthDay']);
const birthDay = numberModel('birthDay', []);
const deathYear = numberModel('deathYear', ['deathMonth', 'deathDay']);
const deathMonth = numberModel('deathMonth', ['deathDay']);
const deathDay = numberModel('deathDay', []);

// Reset a whole event's date (year+month+day) to the seed together.
const DATE_FIELDS: Record<'birth' | 'death', ProfileField[]> = {
  birth: ['birthYear', 'birthMonth', 'birthDay'],
  death: ['deathYear', 'deathMonth', 'deathDay']
};
function canResetDate(event: 'birth' | 'death'): boolean {
  return DATE_FIELDS[event].some(f => isOverridden(base.value, f));
}
function resetDate(event: 'birth' | 'death'): void {
  const fields = DATE_FIELDS[event];
  const anyReverted = fields.some(f => reverted.has(f));
  for (const f of fields) {
    if (anyReverted) {
      reverted.delete(f);
    } else {
      reverted.add(f);
    }
  }
}

function errorFor(prop: string): string | undefined {
  return fieldErrors[prop];
}

async function save(): Promise<void> {
  if (!dirty.value || saving.value || !baseLoaded.value) {
    return;
  }
  saving.value = true;
  error.value = null;
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k]);
  try {
    const payload = buildProfilePayload(base.value, draft, original, reverted);
    const updated = await putProfile(props.personId, payload);
    emit('saved', updated);
  } catch (e) {
    if (e instanceof ProfileSaveError) {
      for (const fe of e.fieldErrors) {
        fieldErrors[fe.propertyName] = fe.errorMessage;
      }
    }
    error.value = t('editor.saveFailed');
  } finally {
    saving.value = false;
  }
}

function cancel(): void {
  if (dirty.value) {
    pendingDiscard.value = true;
    return;
  }
  emit('cancel');
}
function confirmDiscard(): void { emit('cancel'); }
function dismissDiscard(): void { pendingDiscard.value = false; }
</script>

<template>
  <div class="fields-editor" data-test="member-fields-editor">
    <!-- Localized name block: one locale tab row drives all three name inputs -->
    <div class="fields-editor__tabs" role="tablist">
      <button
        v-for="code in NAME_TABS"
        :key="code"
        type="button"
        role="tab"
        class="fields-editor__tab"
        :class="{ 'fields-editor__tab--active': activeTab === code }"
        :aria-selected="activeTab === code"
        :data-test="`name-tab-${code}`"
        @click="activeTab = code"
      >{{ localeName(code) }}</button>
    </div>

    <div class="fields-editor__grid">
      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.givenName') }}
          <button v-if="canReset('givenName')" type="button" class="fields-editor__revert" data-test="revert-givenName" :title="t('members.revertHint')" :aria-label="t('members.revert')" @click="toggleRevert('givenName')">↺</button>
        </span>
        <input v-model="draft.givenName[activeTab]" type="text" class="fields-editor__input" data-test="field-givenName" :disabled="reverted.has('givenName')" />
      </label>

      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.surname') }}
          <button v-if="canReset('surname')" type="button" class="fields-editor__revert" data-test="revert-surname" :title="t('members.revertHint')" :aria-label="t('members.revert')" @click="toggleRevert('surname')">↺</button>
        </span>
        <input v-model="draft.surname[activeTab]" type="text" class="fields-editor__input" data-test="field-surname" :disabled="reverted.has('surname')" />
      </label>

      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.maidenName') }}
          <button v-if="canReset('maidenName')" type="button" class="fields-editor__revert" data-test="revert-maidenName" :title="t('members.revertHint')" :aria-label="t('members.revert')" @click="toggleRevert('maidenName')">↺</button>
        </span>
        <input v-model="draft.maidenName[activeTab]" type="text" class="fields-editor__input" data-test="field-maidenName" :disabled="reverted.has('maidenName')" />
      </label>

      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.sex') }}
          <button v-if="canReset('sex')" type="button" class="fields-editor__revert" data-test="revert-sex" :title="t('members.revertHint')" :aria-label="t('members.revert')" @click="toggleRevert('sex')">↺</button>
        </span>
        <select v-model="draft.sex" class="fields-editor__input" data-test="field-sex" :disabled="reverted.has('sex')">
          <option v-for="s in SEX_OPTIONS" :key="s" :value="s">{{ t(`sex.${s}`) }}</option>
        </select>
      </label>

      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.vocation') }}
          <button v-if="canReset('vocation')" type="button" class="fields-editor__revert" data-test="revert-vocation" :title="t('members.revertHint')" :aria-label="t('members.revert')" @click="toggleRevert('vocation')">↺</button>
        </span>
        <div class="fields-editor__vocation-row">
          <VocationIcon :vocation="draft.vocation" class="fields-editor__vocation-icon" />
          <select v-model="draft.vocation" class="fields-editor__input" data-test="field-vocation" :disabled="reverted.has('vocation')">
            <option v-for="v in VOCATION_OPTIONS" :key="v" :value="v">{{ t(`vocation.${v}`) }}</option>
          </select>
        </div>
      </label>

      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.birth') }}
          <button v-if="canResetDate('birth')" type="button" class="fields-editor__revert" data-test="revert-birth" :title="t('members.revertHint')" :aria-label="t('members.revert')" @click="resetDate('birth')">↺</button>
        </span>
        <div class="fields-editor__date">
          <input v-model="birthYear" type="number" inputmode="numeric" class="fields-editor__input fields-editor__date-year" data-test="field-birthYear" :aria-label="t('members.field.year')" :disabled="reverted.has('birthYear')" :placeholder="t('members.field.year')" />
          <input v-model="birthMonth" type="number" inputmode="numeric" min="1" max="12" class="fields-editor__input fields-editor__date-part" data-test="field-birthMonth" :aria-label="t('members.field.month')" :disabled="reverted.has('birthYear') || draft.birthYear == null" :placeholder="t('members.field.month')" />
          <input v-model="birthDay" type="number" inputmode="numeric" min="1" max="31" class="fields-editor__input fields-editor__date-part" data-test="field-birthDay" :aria-label="t('members.field.day')" :disabled="reverted.has('birthYear') || draft.birthMonth == null" :placeholder="t('members.field.day')" />
        </div>
        <span v-if="errorFor('Profile.BirthDate') || errorFor('Profile.BirthYear')" class="fields-editor__field-error" data-test="error-birthDate">{{ errorFor('Profile.BirthDate') || errorFor('Profile.BirthYear') }}</span>
      </label>

      <label class="fields-editor__field">
        <span class="fields-editor__label">
          {{ t('members.field.death') }}
          <button v-if="canResetDate('death')" type="button" class="fields-editor__revert" data-test="revert-death" :title="t('members.revertHint')" :aria-label="t('members.revert')" @click="resetDate('death')">↺</button>
        </span>
        <div class="fields-editor__date">
          <input v-model="deathYear" type="number" inputmode="numeric" class="fields-editor__input fields-editor__date-year" data-test="field-deathYear" :aria-label="t('members.field.year')" :disabled="reverted.has('deathYear')" :placeholder="t('members.field.year')" />
          <input v-model="deathMonth" type="number" inputmode="numeric" min="1" max="12" class="fields-editor__input fields-editor__date-part" data-test="field-deathMonth" :aria-label="t('members.field.month')" :disabled="reverted.has('deathYear') || draft.deathYear == null" :placeholder="t('members.field.month')" />
          <input v-model="deathDay" type="number" inputmode="numeric" min="1" max="31" class="fields-editor__input fields-editor__date-part" data-test="field-deathDay" :aria-label="t('members.field.day')" :disabled="reverted.has('deathYear') || draft.deathMonth == null" :placeholder="t('members.field.day')" />
        </div>
        <span v-if="errorFor('Profile.DeathDate') || errorFor('Profile.DeathYear')" class="fields-editor__field-error" data-test="error-deathDate">{{ errorFor('Profile.DeathDate') || errorFor('Profile.DeathYear') }}</span>
      </label>
    </div>

    <p v-if="errorFor('Profile')" class="fields-editor__error" data-test="error-form">{{ errorFor('Profile') }}</p>

    <p v-if="error" class="fields-editor__error" data-test="fields-error">{{ error }}</p>

    <div v-if="pendingDiscard" class="fields-editor__confirm" data-test="fields-confirm">
      <p class="fields-editor__confirm-msg">{{ t('editor.confirmDiscard') }}</p>
      <div class="fields-editor__actions">
        <button type="button" class="fields-editor__btn fields-editor__btn--warn" data-test="fields-confirm-discard" @click="confirmDiscard">{{ t('editor.discard') }}</button>
        <button type="button" class="fields-editor__btn fields-editor__btn--ghost" data-test="fields-confirm-keep" @click="dismissDiscard">{{ t('editor.keepEditing') }}</button>
      </div>
    </div>

    <div v-else class="fields-editor__actions">
      <button type="button" class="fields-editor__btn fields-editor__btn--ghost" data-test="fields-cancel" @click="cancel">{{ t('members.cancelEdit') }}</button>
      <button type="button" class="fields-editor__btn fields-editor__btn--primary" data-test="fields-save" :disabled="!dirty || saving || !baseLoaded" @click="save">{{ saving ? t('editor.saving') : t('editor.save') }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.fields-editor { display: flex; flex-direction: column; gap: 12px; font-family: var(--font-body); }
.fields-editor__tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.fields-editor__tab {
  height: 30px; padding: 0 14px; border-radius: 15px; cursor: pointer;
  border: 1px solid var(--gilt); background: transparent; color: var(--ink-soft);
  font-family: var(--font-display); font-size: 15px;
  &--active { background: var(--panel); color: var(--gilt-deep); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.fields-editor__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.fields-editor__field { display: flex; flex-direction: column; gap: 4px; }
.fields-editor__label {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--gilt-deep);
}
.fields-editor__revert {
  border: 1px solid var(--gilt); background: transparent; color: var(--ink-soft);
  width: 20px; height: 20px; border-radius: 50%; cursor: pointer; line-height: 1;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 1px; }
}
.fields-editor__input {
  width: 100%; box-sizing: border-box; padding: 8px 10px;
  background: var(--field-bg); border: 1px solid var(--gilt); border-radius: 8px; color: var(--ink);
  font-family: var(--font-body); font-size: 16px;
  &:disabled { opacity: 0.5; }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 1px; }
}
.fields-editor__date { display: flex; gap: 8px; }
.fields-editor__date-year { flex: 1.4 1 0; }
.fields-editor__date-part { flex: 1 1 0; }
.fields-editor__vocation-row { display: flex; align-items: center; gap: 8px; }
.fields-editor__vocation-icon { flex: 0 0 auto; width: 18px; height: 18px; color: var(--gilt-deep); }
.fields-editor__field-error { font-size: 12px; color: var(--umber); }
.fields-editor__error { margin: 0; font-size: 14px; color: var(--umber); }
.fields-editor__confirm { border: 1px solid var(--gilt); background: var(--surface-card); border-radius: 8px; padding: 10px 12px; }
.fields-editor__confirm-msg { margin: 0 0 10px; font-size: 14px; color: var(--umber); }
.fields-editor__actions { display: flex; justify-content: flex-end; gap: 10px; }
.fields-editor__btn {
  height: 32px; padding: 0 16px; border-radius: 8px; cursor: pointer;
  font-family: var(--font-display); font-size: 14px;
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  &--ghost { border: none; background: transparent; color: var(--ink-soft); font-family: var(--font-body); &:hover { background: var(--btn-hover); } }
  &--primary { border: 1px solid var(--leaf-deep); background: var(--leaf-deep); color: var(--on-accent); &:disabled { opacity: 0.45; cursor: default; } }
  &--warn { border: 1px solid var(--umber); background: var(--umber); color: var(--on-accent); }
}
</style>
