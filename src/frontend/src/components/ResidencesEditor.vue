<script setup lang="ts">
import { ref, reactive, computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PersonDetail } from '../types/family';
import { getProfile, putProfile, ProfileSaveError, type PersonProfile, type ProfileFieldError } from '../api/profileApi';
import { seedRows, emptyRow, toResidences, comparableRows, type ResidenceRow } from '../composables/residenceDraft';
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
const openPickerId = ref<string | null>(null);
const saving = ref(false);
const error = ref<string | null>(null);
const formError = ref<string | null>(null);
// Save failures scoped to one residence row, keyed by its index in the submitted list.
// `toResidences` maps rows 1:1 without filtering, so that index is also the row's index here.
const rowErrors = ref<Record<number, string[]>>({});

// FluentValidation names residence failures `Profile.Residences[<i>]` (whole-row rules)
// or `Profile.Residences[<i>].<Field>` (per-field rules) — pinned server-side by
// UpdatePersonProfileValidatorTests so this parse can't drift silently.
const residenceErrorPattern = /^Profile\.Residences\[(\d+)\]/;

function applyFieldErrors(fieldErrors: ProfileFieldError[]): void {
  const perRow: Record<number, string[]> = {};
  const general: string[] = [];
  for (const fieldError of fieldErrors) {
    const match = residenceErrorPattern.exec(fieldError.propertyName);
    if (match) {
      (perRow[Number(match[1])] ??= []).push(fieldError.errorMessage);
    } else {
      general.push(fieldError.errorMessage);
    }
  }
  rowErrors.value = perRow;
  formError.value = general[0] ?? null;
}
const pendingDiscard = ref(false);
const addResidenceBtnRef = ref<HTMLButtonElement | null>(null);
const cancelBtnRef = ref<HTMLButtonElement | null>(null);
const keepEditingBtnRef = ref<HTMLButtonElement | null>(null);

const base = ref<PersonProfile | null>(null);
void getProfile(props.personId)
  .then(p => { base.value = p; })
  .catch(() => { error.value = t('members.loadFailed'); });

// Mirrors the server's own cap (UpdatePersonProfileValidator: at most 10 residences) so the
// limit shows as a disabled Add rather than a generic form error after a failed round-trip.
// The server rule stays authoritative — this only spares the editor a pointless save.
const MAX_ROWS = 10;
const atRowLimit = computed(() => rows.length >= MAX_ROWS);

function addRow(): void {
  if (atRowLimit.value) {
    return;
  }
  reverted.value = false;
  rowErrors.value = {};
  rows.push(emptyRow());
}
function removeRow(row: ResidenceRow): void {
  const idx = rows.findIndex(r => r.id === row.id);
  if (idx === -1) {
    return;
  }
  rows.splice(idx, 1);
  // Row errors are keyed by list position, so a removal invalidates every key after
  // the removed one — drop them all rather than point a message at the wrong row.
  rowErrors.value = {};
  if (openPickerId.value === row.id) {
    openPickerId.value = null;
  }
  void nextTick(() => { addResidenceBtnRef.value?.focus(); });
}
function togglePicker(row: ResidenceRow): void {
  openPickerId.value = openPickerId.value === row.id ? null : row.id;
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
function onPicked(row: ResidenceRow, value: PickedPlace): void {
  row.lat = value.lat;
  row.lng = value.lng;
  row.mapUrl = value.mapUrl;
  // Only overwrite a place locale the picker actually resolved (non-empty).
  if (value.place.ru) { row.place.ru = value.place.ru; }
  if (value.place.be) { row.place.be = value.place.be; }
  if (value.place.en) { row.place.en = value.place.en; }
}
// Queue the revert without emptying the list: the seed list isn't available to the
// client (PersonDetail.residences is already seed-merged, and the profile override
// only carries the override), so blanking the rows would read as "the seed is empty"
// rather than "these rows are about to be discarded". Keep them on screen, marked as
// discarded, and let the editor undo.
function revertAll(): void {
  reverted.value = true;
  openPickerId.value = null;
}
function undoRevert(): void {
  reverted.value = false;
}

const hasRowErrors = computed(() => Object.keys(rowErrors.value).length > 0);
const canRevert = computed(() => base.value?.residences != null);
// Mirrors MemberFieldsEditor's dirty tracking, adapted to the row-array shape: either
// the row contents changed, or a revert is queued (which alone would otherwise send
// residences: null unprompted, even with zero visible row edits).
const dirty = computed(() => reverted.value || comparableRows(rows) !== comparableRows(originalRows));

async function save(): Promise<void> {
  // Also guards the un-edited case: for a person still inheriting seed residences
  // (base.residences === null) a no-op save would PUT a concrete array, freezing the
  // inheritance into an override that stops tracking later seed corrections.
  if (!dirty.value || saving.value || base.value == null) {
    return;
  }
  saving.value = true;
  error.value = null;
  formError.value = null;
  rowErrors.value = {};
  try {
    const residences = reverted.value ? null : toResidences(rows);
    const payload: PersonProfile = { ...base.value, residences };
    const updated = await putProfile(props.personId, payload);
    emit('saved', updated);
  } catch (e) {
    if (e instanceof ProfileSaveError) {
      applyFieldErrors(e.fieldErrors);
    }
    error.value = t('editor.saveFailed');
  } finally {
    saving.value = false;
  }
}

function cancel(): void {
  if (dirty.value) {
    pendingDiscard.value = true;
    void nextTick(() => { keepEditingBtnRef.value?.focus(); });
    return;
  }
  emit('cancel');
}
function confirmDiscard(): void { emit('cancel'); }
function dismissDiscard(): void {
  pendingDiscard.value = false;
  void nextTick(() => { cancelBtnRef.value?.focus(); });
}
</script>

<template>
  <div class="res-editor" data-test="residences-editor">
    <div v-if="reverted" class="res-editor__revert-notice" data-test="residences-revert-notice">
      <p class="res-editor__revert-msg">{{ t('members.revertQueued') }}</p>
      <button type="button" class="res-editor__btn res-editor__btn--ghost" data-test="residences-revert-undo" @click="undoRevert">{{ t('members.revertUndo') }}</button>
    </div>

    <ul class="res-editor__list" :class="{ 'res-editor__list--discarded': reverted }" :inert="reverted || undefined">
      <li v-for="(row, i) in rows" :key="row.id" class="res-editor__row">
        <div class="res-editor__places">
          <input v-model="row.place.ru" type="text" class="res-editor__input" :data-test="`place-ru-${i}`" :placeholder="t('members.placeRu')" :aria-label="t('members.placeRu')" />
          <input v-model="row.place.be" type="text" class="res-editor__input" :data-test="`place-be-${i}`" :placeholder="t('members.placeBe')" :aria-label="t('members.placeBe')" />
          <input v-model="row.place.en" type="text" class="res-editor__input" :data-test="`place-en-${i}`" :placeholder="t('members.placeEn')" :aria-label="t('members.placeEn')" />
        </div>
        <div class="res-editor__years">
          <input :value="row.fromYear ?? ''" type="number" class="res-editor__input" :data-test="`from-${i}`" :placeholder="t('members.fromYear')" :aria-label="t('members.fromYear')" @input="onYearInput(row, 'fromYear', $event)" />
          <input :value="row.toYear ?? ''" type="number" class="res-editor__input" :data-test="`to-${i}`" :placeholder="t('members.toYear')" :aria-label="t('members.toYear')" @input="onYearInput(row, 'toYear', $event)" />
          <button type="button" class="res-editor__icon" :data-test="`pick-${i}`" :aria-label="t('members.pickOnMap')" @click="togglePicker(row)"><MapPinIcon :size="16" /></button>
          <button type="button" class="res-editor__icon" :data-test="`remove-${i}`" :aria-label="t('members.removeResidence')" @click="removeRow(row)">✕</button>
        </div>
        <p v-if="rowErrors[i]" class="res-editor__row-error" :data-test="`row-error-${i}`" role="alert">{{ rowErrors[i].join(' ') }}</p>
        <MapPicker v-if="openPickerId === row.id" :model-value="pickedFor(row)" @update:model-value="onPicked(row, $event)" />
      </li>
    </ul>

    <button v-if="!reverted" ref="addResidenceBtnRef" type="button" class="res-editor__add" data-test="add-residence" :disabled="atRowLimit" :title="atRowLimit ? t('members.residenceLimit') : undefined" @click="addRow">+ {{ t('members.addResidence') }}</button>

    <p v-if="formError" class="res-editor__error" data-test="residences-form-error" role="alert">{{ formError }}</p>
    <p v-else-if="error && !hasRowErrors" class="res-editor__error" data-test="residences-error" role="alert">{{ error }}</p>

    <div v-if="pendingDiscard" class="res-editor__confirm" data-test="residences-confirm">
      <p class="res-editor__confirm-msg">{{ t('editor.confirmDiscard') }}</p>
      <div class="res-editor__actions">
        <button type="button" class="res-editor__btn res-editor__btn--warn" data-test="residences-confirm-discard" @click="confirmDiscard">{{ t('editor.discard') }}</button>
        <button ref="keepEditingBtnRef" type="button" class="res-editor__btn res-editor__btn--ghost" data-test="residences-confirm-keep" @click="dismissDiscard">{{ t('editor.keepEditing') }}</button>
      </div>
    </div>
    <div v-else class="res-editor__actions">
      <button v-if="canRevert && !reverted" type="button" class="res-editor__btn res-editor__btn--ghost" data-test="residences-revert" @click="revertAll">{{ t('members.revert') }}</button>
      <button ref="cancelBtnRef" type="button" class="res-editor__btn res-editor__btn--ghost" data-test="residences-cancel" @click="cancel">{{ t('members.cancelEdit') }}</button>
      <button type="button" class="res-editor__btn res-editor__btn--primary" data-test="residences-save" :disabled="!dirty || saving || base == null" @click="save">{{ saving ? t('editor.saving') : t('editor.save') }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.res-editor { display: flex; flex-direction: column; gap: 12px; font-family: var(--font-body); }
.res-editor__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.res-editor__list--discarded { opacity: 0.45; text-decoration: line-through; }
.res-editor__revert-notice { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--panel-edge); border-radius: 4px; }
.res-editor__revert-msg { margin: 0; flex: 1 1 220px; font-size: 0.9rem; color: var(--ink-soft); }
.res-editor__row { display: flex; flex-direction: column; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--panel-edge); }
.res-editor__places { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
/* Wraps rather than overflowing: two year fields plus two icon buttons don't fit one line
   on a narrow phone, the same reason .res-editor__places stacks at the breakpoint below. */
.res-editor__years { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
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
.res-editor__row-error { margin: 0; font-size: 12px; color: var(--umber); }
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

@media (max-width: 860px) {
  .res-editor__places { grid-template-columns: 1fr; }
}
</style>
