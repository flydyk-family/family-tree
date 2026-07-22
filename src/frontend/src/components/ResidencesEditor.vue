<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PersonDetail } from '../types/family';
import { getProfile, putProfile, ProfileSaveError, type PersonProfile } from '../api/profileApi';
import { seedRows, emptyRow, toResidences, type ResidenceRow } from '../composables/residenceDraft';
import { parseIntInput } from '../utils/numberInput';
import MapPicker, { type PickedPlace } from './MapPicker.vue';
import MapPinIcon from './MapPinIcon.vue';

const props = defineProps<{ personId: string; detail: PersonDetail }>();
const emit = defineEmits<{ saved: [detail: PersonDetail]; cancel: [] }>();
const { t } = useI18n({ useScope: 'global' });

const rows = reactive<ResidenceRow[]>(seedRows(props.detail.residences));
// Frozen snapshot of the starting rows, to detect unsaved changes for confirm-on-discard.
const originalRows = seedRows(props.detail.residences);
const reverted = ref(false);
const openPicker = ref<number | null>(null);
const saving = ref(false);
const error = ref<string | null>(null);
const formError = ref<string | null>(null);
const pendingDiscard = ref(false);

const base = ref<PersonProfile | null>(null);
void getProfile(props.personId)
  .then(p => { base.value = p; })
  .catch(() => { error.value = t('members.loadFailed'); });

function addRow(): void {
  reverted.value = false;
  rows.push(emptyRow());
}
function removeRow(i: number): void {
  rows.splice(i, 1);
  // openPicker holds a row index, not a row identity: splicing shifts every
  // later row down by one, so a picker open past the removed row must follow
  // the same shift (or close, if it was the removed row itself) to avoid
  // silently retargeting a different row's coordinates.
  if (openPicker.value !== null) {
    if (openPicker.value === i) {
      openPicker.value = null;
    } else if (openPicker.value > i) {
      openPicker.value -= 1;
    }
  }
}
function togglePicker(i: number): void {
  openPicker.value = openPicker.value === i ? null : i;
}
// Explicit :value/@input (not v-model.number) — looseToNumber returns the original
// string on a failed parse, so clearing the field would otherwise set '' instead of
// null and break the PUT payload (see MemberFieldsEditor's numberModel).
function onYearInput(row: ResidenceRow, field: 'fromYear' | 'toYear', e: Event): void {
  row[field] = parseIntInput((e.target as HTMLInputElement).value);
}
function pickedFor(row: ResidenceRow): PickedPlace {
  return { lat: row.lat, lng: row.lng, place: { ...row.place }, mapUrl: row.mapUrl };
}
function onPicked(i: number, value: PickedPlace): void {
  const row = rows[i];
  row.lat = value.lat;
  row.lng = value.lng;
  row.mapUrl = value.mapUrl;
  // Only overwrite a place locale the picker actually resolved (non-empty).
  if (value.place.ru) { row.place.ru = value.place.ru; }
  if (value.place.be) { row.place.be = value.place.be; }
  if (value.place.en) { row.place.en = value.place.en; }
}
function revertAll(): void {
  reverted.value = true;
  rows.splice(0, rows.length);
}

const canRevert = computed(() => base.value?.residences != null);
// Mirrors MemberFieldsEditor's dirty tracking, adapted to the row-array shape: either
// the row contents changed, or a revert is queued (which alone would otherwise send
// residences: null unprompted, even with zero visible row edits).
const dirty = computed(() => reverted.value || JSON.stringify(rows) !== JSON.stringify(originalRows));

async function save(): Promise<void> {
  if (saving.value || base.value == null) {
    return;
  }
  saving.value = true;
  error.value = null;
  formError.value = null;
  try {
    const residences = reverted.value ? null : toResidences(rows);
    const payload: PersonProfile = { ...base.value, residences };
    const updated = await putProfile(props.personId, payload);
    emit('saved', updated);
  } catch (e) {
    if (e instanceof ProfileSaveError) {
      formError.value = e.fieldErrors[0]?.errorMessage ?? null;
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
  <div class="res-editor" data-test="residences-editor">
    <ul class="res-editor__list">
      <li v-for="(row, i) in rows" :key="i" class="res-editor__row">
        <div class="res-editor__places">
          <input v-model="row.place.ru" type="text" class="res-editor__input" :data-test="`place-ru-${i}`" :placeholder="t('members.placeRu')" />
          <input v-model="row.place.be" type="text" class="res-editor__input" :data-test="`place-be-${i}`" :placeholder="t('members.placeBe')" />
          <input v-model="row.place.en" type="text" class="res-editor__input" :data-test="`place-en-${i}`" :placeholder="t('members.placeEn')" />
        </div>
        <div class="res-editor__years">
          <input :value="row.fromYear ?? ''" type="number" class="res-editor__input" :data-test="`from-${i}`" :placeholder="t('members.fromYear')" @input="onYearInput(row, 'fromYear', $event)" />
          <input :value="row.toYear ?? ''" type="number" class="res-editor__input" :data-test="`to-${i}`" :placeholder="t('members.toYear')" @input="onYearInput(row, 'toYear', $event)" />
          <button type="button" class="res-editor__icon" :data-test="`pick-${i}`" :aria-label="t('members.pickOnMap')" @click="togglePicker(i)"><MapPinIcon :size="16" /></button>
          <button type="button" class="res-editor__icon" :data-test="`remove-${i}`" :aria-label="t('members.removeResidence')" @click="removeRow(i)">✕</button>
        </div>
        <MapPicker v-if="openPicker === i" :model-value="pickedFor(row)" @update:model-value="onPicked(i, $event)" />
      </li>
    </ul>

    <button type="button" class="res-editor__add" data-test="add-residence" @click="addRow">+ {{ t('members.addResidence') }}</button>

    <p v-if="formError" class="res-editor__error" data-test="residences-form-error">{{ formError }}</p>
    <p v-if="error" class="res-editor__error" data-test="residences-error">{{ error }}</p>

    <div v-if="pendingDiscard" class="res-editor__confirm" data-test="residences-confirm">
      <p class="res-editor__confirm-msg">{{ t('editor.confirmDiscard') }}</p>
      <div class="res-editor__actions">
        <button type="button" class="res-editor__btn res-editor__btn--warn" data-test="residences-confirm-discard" @click="confirmDiscard">{{ t('editor.discard') }}</button>
        <button type="button" class="res-editor__btn res-editor__btn--ghost" data-test="residences-confirm-keep" @click="dismissDiscard">{{ t('editor.keepEditing') }}</button>
      </div>
    </div>
    <div v-else class="res-editor__actions">
      <button v-if="canRevert" type="button" class="res-editor__btn res-editor__btn--ghost" data-test="residences-revert" @click="revertAll">{{ t('members.revert') }}</button>
      <button type="button" class="res-editor__btn res-editor__btn--ghost" data-test="residences-cancel" @click="cancel">{{ t('members.cancelEdit') }}</button>
      <button type="button" class="res-editor__btn res-editor__btn--primary" data-test="residences-save" :disabled="saving || base == null" @click="save">{{ saving ? t('editor.saving') : t('editor.save') }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.res-editor { display: flex; flex-direction: column; gap: 12px; font-family: var(--font-body); }
.res-editor__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.res-editor__row { display: flex; flex-direction: column; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--panel-edge); }
.res-editor__places { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.res-editor__years { display: flex; gap: 8px; align-items: center; }
.res-editor__input {
  box-sizing: border-box; padding: 8px 10px; min-width: 0;
  background: var(--field-bg); border: 1px solid var(--gilt); border-radius: 8px; color: var(--ink);
  font-family: var(--font-body); font-size: 15px;
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 1px; }
}
.res-editor__icon {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--gilt); background: var(--surface-card); color: var(--ink);
  display: inline-flex; align-items: center; justify-content: center;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 1px; }
}
.res-editor__add {
  align-self: flex-start; padding: 7px 14px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--gilt); background: var(--surface-card); color: var(--ink); font-family: var(--font-display); font-size: 14px;
  &:hover { background: var(--control-hover); }
}
.res-editor__error { margin: 0; font-size: 13px; color: var(--umber); }
.res-editor__confirm { border: 1px solid var(--gilt); background: var(--surface-card); border-radius: 8px; padding: 10px 12px; }
.res-editor__confirm-msg { margin: 0 0 10px; font-size: 14px; color: var(--umber); }
.res-editor__actions { display: flex; justify-content: flex-end; gap: 10px; }
.res-editor__btn {
  height: 32px; padding: 0 16px; border-radius: 8px; cursor: pointer; font-family: var(--font-display); font-size: 14px;
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  &--ghost { border: none; background: transparent; color: var(--ink-soft); font-family: var(--font-body); &:hover { background: var(--btn-hover); } }
  &--primary { border: 1px solid var(--leaf-deep); background: var(--leaf-deep); color: var(--on-accent); &:disabled { opacity: 0.45; cursor: default; } }
  &--warn { border: 1px solid var(--umber); background: var(--umber); color: var(--on-accent); }
}
</style>
