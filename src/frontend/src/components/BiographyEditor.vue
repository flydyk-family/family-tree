<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { LOCALE_OPTIONS, type Locale } from '../constants/locales';
import type { LocalizedText, PersonDetail } from '../types/family';
import { putBiography } from '../api/biographyApi';

const props = defineProps<{ personId: string; biography: LocalizedText | null }>();
const emit = defineEmits<{ saved: [detail: PersonDetail]; cancel: [] }>();
const { t } = useI18n({ useScope: 'global' });

// Editor tab order: ru primary, then be, en.
const TABS: Locale[] = ['ru', 'be', 'en'];
function localeName(code: Locale): string {
  return LOCALE_OPTIONS.find(option => option.code === code)?.nativeName ?? code;
}

// Resilient buffers, seeded from the current biography (null → ''). Never cleared
// on a failed save, so typed text is never lost.
// Snapshot the original biography once so dirty/blank detection compares against
// the values present when editing began, even if the prop changes mid-edit.
const original: LocalizedText | null = props.biography ? { ...props.biography } : null;
const seed = (code: Locale): string => original?.[code] ?? '';
const buffers = reactive<Record<Locale, string>>({ ru: seed('ru'), be: seed('be'), en: seed('en') });

const activeTab = ref<Locale>('ru');
const saving = ref(false);
const error = ref<string | null>(null);
const pendingConfirm = ref<'blank' | 'discard' | null>(null);

function hasText(code: Locale): boolean {
  return buffers[code].trim() !== '';
}
const allEmpty = computed(() => TABS.every(code => !hasText(code)));
const dirty = computed(() => TABS.some(code => buffers[code] !== seed(code)));

// Locales that had text originally but would be blanked by this save.
function blankedLocales(): Locale[] {
  return TABS.filter(code => (original?.[code] ?? '').trim() !== '' && !hasText(code));
}
const blankedNames = computed(() => blankedLocales().map(localeName).join(', '));

function buildPayload(): LocalizedText {
  return {
    ru: buffers.ru.trim() || null,
    be: buffers.be.trim() || null,
    en: buffers.en.trim() || null
  };
}

async function save(): Promise<void> {
  if (allEmpty.value || saving.value) {
    return;
  }
  if (pendingConfirm.value !== 'blank' && blankedLocales().length > 0) {
    pendingConfirm.value = 'blank';
    return;
  }
  saving.value = true;
  error.value = null;
  try {
    const updated = await putBiography(props.personId, buildPayload());
    emit('saved', updated);
  } catch {
    error.value = t('editor.saveFailed');
  } finally {
    saving.value = false;
    pendingConfirm.value = null;
  }
}

function cancel(): void {
  if (dirty.value) {
    pendingConfirm.value = 'discard';
    return;
  }
  emit('cancel');
}

function acceptConfirm(): void {
  if (pendingConfirm.value === 'blank') {
    void save();
  } else {
    emit('cancel');
  }
}
function dismissConfirm(): void {
  pendingConfirm.value = null;
}
</script>

<template>
  <div class="bio-editor" data-test="bio-editor">
    <div class="bio-editor__tabs" role="tablist">
      <button
        v-for="code in TABS"
        :key="code"
        type="button"
        role="tab"
        class="bio-editor__tab"
        :class="{ 'bio-editor__tab--active': activeTab === code }"
        :aria-selected="activeTab === code"
        :data-test="`bio-tab-${code}`"
        @click="activeTab = code"
      >
        {{ localeName(code) }}
        <span class="bio-editor__dot" :class="{ 'bio-editor__dot--filled': hasText(code) }" aria-hidden="true" />
      </button>
    </div>

    <textarea v-model="buffers[activeTab]" class="bio-editor__input" data-test="bio-input" rows="6" :aria-label="localeName(activeTab)" />

    <p v-if="allEmpty" class="bio-editor__hint" data-test="bio-require">{{ t('editor.requireOne') }}</p>
    <p v-if="error" class="bio-editor__error" data-test="bio-error">{{ error }}</p>

    <div v-if="pendingConfirm" class="bio-editor__confirm" data-test="bio-confirm">
      <p class="bio-editor__confirm-msg">
        {{ pendingConfirm === 'blank'
          ? t('editor.confirmBlank', { locales: blankedNames })
          : t('editor.confirmDiscard') }}
      </p>
      <div class="bio-editor__actions">
        <button type="button" class="bio-editor__btn bio-editor__btn--ghost" data-test="bio-confirm-cancel" @click="dismissConfirm">
          {{ t('editor.keepEditing') }}
        </button>
        <button type="button" class="bio-editor__btn bio-editor__btn--warn" data-test="bio-confirm-accept" @click="acceptConfirm">
          {{ pendingConfirm === 'blank' ? t('editor.saveAnyway') : t('editor.discard') }}
        </button>
      </div>
    </div>

    <div v-else class="bio-editor__actions">
      <button type="button" class="bio-editor__btn bio-editor__btn--ghost" data-test="bio-cancel" @click="cancel">
        {{ t('editor.cancel') }}
      </button>
      <button type="button" class="bio-editor__btn bio-editor__btn--primary" data-test="bio-save" :disabled="allEmpty || saving" @click="save">
        {{ saving ? t('editor.saving') : t('editor.save') }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bio-editor { display: flex; flex-direction: column; gap: 10px; font-family: var(--font-body); }
.bio-editor__tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.bio-editor__tab {
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 14px; border-radius: 15px; cursor: pointer;
  border: 1px solid var(--glass-border); background: transparent; color: var(--ink-soft);
  font-family: var(--font-display); font-size: 13px; letter-spacing: 0.3px;
  &--active { border-color: var(--gilt); background: linear-gradient(var(--control-grad-top), var(--control-grad-bottom)); color: var(--gilt-deep); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
.bio-editor__dot {
  width: 6px; height: 6px; border-radius: 50%;
  border: 1px solid var(--ink-faint); background: transparent;
  &--filled { border-color: var(--leaf-deep); background: var(--leaf-deep); }
}
.bio-editor__input {
  width: 100%; box-sizing: border-box; resize: vertical; min-height: 120px;
  padding: 10px 12px; border: 1px solid var(--glass-border); border-radius: 8px;
  background: var(--field-bg); color: var(--ink);
  font-family: var(--font-body); font-size: 16px; line-height: 1.55;
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 1px; }
}
.bio-editor__hint { margin: 0; font-size: 14px; color: var(--ink-soft); }
.bio-editor__error { margin: 0; font-size: 14px; color: var(--umber); }
.bio-editor__confirm {
  border: 1px solid rgba(156, 90, 50, 0.35); background: rgba(156, 90, 50, 0.1);
  border-radius: 8px; padding: 10px 12px;
}
.bio-editor__confirm-msg { margin: 0 0 10px; font-size: 14px; color: var(--umber); line-height: 1.45; }
.bio-editor__actions { display: flex; justify-content: flex-end; gap: 10px; }
.bio-editor__btn {
  height: 32px; padding: 0 16px; border-radius: 8px; cursor: pointer;
  font-family: var(--font-display); font-size: 14px; letter-spacing: 0.3px;
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  &--ghost { border: none; background: transparent; color: var(--ink-soft); font-family: var(--font-body); &:hover { background: var(--btn-hover); } }
  &--primary { border: 1px solid var(--leaf-deep); background: var(--leaf-deep); color: var(--on-accent); &:disabled { opacity: 0.45; cursor: default; } }
  &--warn { border: 1px solid var(--umber); background: var(--umber); color: var(--on-accent); }
}
</style>
