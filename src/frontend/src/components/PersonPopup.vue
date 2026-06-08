<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useSelectionStore } from '../stores/selectionStore';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { formatLifespan } from '../format/lifespan';
import type { LocalizedText } from '../types/family';
import VocationIcon from './VocationIcon.vue';

const emit = defineEmits<{ close: [] }>();

const { t, te } = useI18n({ useScope: 'global' });
const selection = useSelectionStore();
const localeStore = useLocaleStore();
const { detail, mode, loading, error } = storeToRefs(selection);

const dialogRef = ref<HTMLElement | null>(null);

function loc(text: LocalizedText | null | undefined): string {
  return localize(text, localeStore.currentLocale);
}

const fullName = computed(() => {
  if (!detail.value) {
    return '';
  }
  return `${loc(detail.value.givenName)} ${loc(detail.value.surname)}`.trim();
});

const maidenName = computed(() => (detail.value?.maidenName ? loc(detail.value.maidenName) : ''));

const lifespan = computed(() =>
  detail.value ? formatLifespan(detail.value.birth, detail.value.death) : ''
);

const summaryText = computed(() => loc(detail.value?.summary));

const initial = computed(() => fullName.value.charAt(0).toUpperCase());

const vocationLabel = computed(() => {
  const vocation = detail.value?.vocation;
  if (!vocation) {
    return '';
  }
  const key = `vocation.${vocation}`;
  return te(key) ? t(key) : vocation;
});

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

function onClose(): void {
  emit('close');
}

onMounted(() => {
  dialogRef.value?.focus();
});
</script>

<template>
  <div class="popup" data-test="person-popup">
    <div class="popup__scrim" data-test="scrim" @click="onClose" />
    <section
      ref="dialogRef"
      class="popup__dialog"
      :class="{ 'popup__dialog--expanded': mode === 'expanded' }"
      data-test="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="popup-name"
      :aria-label="fullName || t('person.loading')"
      tabindex="-1"
      @keydown.esc.prevent="onClose"
    >
      <button
        type="button"
        class="popup__close"
        data-test="close"
        :aria-label="t('person.close')"
        @click="onClose"
      >
        ✕
      </button>

      <p v-if="loading" class="popup__status">{{ t('person.loading') }}</p>
      <p v-else-if="error" class="popup__status popup__status--error">{{ t('person.error') }}</p>

      <template v-else-if="detail">
        <header class="popup__head">
          <div class="popup__portrait">
            <span class="popup__initial" data-test="portrait-fallback">{{ initial }}</span>
          </div>
          <div class="popup__heading">
            <h2 id="popup-name" class="popup__name">{{ fullName }}</h2>
            <p v-if="maidenName" class="popup__maiden">{{ t('person.nee') }} {{ maidenName }}</p>
            <p class="popup__life">{{ lifespan }}</p>
            <p v-if="vocationLabel" class="popup__vocation">
              <VocationIcon :vocation="detail.vocation" />{{ vocationLabel }}
            </p>
          </div>
        </header>

        <p v-if="summaryText" class="popup__summary">{{ summaryText }}</p>

        <section v-if="mode === 'expanded'" class="popup__expanded">
          <div v-if="loc(detail.biography)" class="popup__block">
            <h3 class="popup__block-title">{{ t('person.biography') }}</h3>
            <p class="popup__bio" data-test="biography">{{ loc(detail.biography) }}</p>
          </div>

          <div v-if="detail.residences.length" class="popup__block">
            <h3 class="popup__block-title">{{ t('person.residences') }}</h3>
            <ul class="popup__list" data-test="residences">
              <li v-for="(residence, index) in detail.residences" :key="index" class="popup__residence">
                <span class="popup__place">{{ loc(residence.place) }}</span>
                <span class="popup__years">{{ residenceYears(residence.fromYear, residence.toYear) }}</span>
                <a
                  v-if="residence.mapUrl"
                  class="popup__map"
                  :href="residence.mapUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="t('person.viewOnMap')"
                >🗺</a>
              </li>
            </ul>
          </div>

          <div v-if="detail.links.length" class="popup__block">
            <h3 class="popup__block-title">{{ t('person.links') }}</h3>
            <ul class="popup__list popup__links" data-test="links">
              <li v-for="link in detail.links" :key="link.url">
                <a :href="link.url" target="_blank" rel="noopener noreferrer">{{ socialLabel(link.type) }}</a>
              </li>
            </ul>
          </div>
        </section>

        <footer class="popup__actions">
          <button
            v-if="mode === 'normal'"
            type="button"
            class="popup__expand"
            data-test="expand"
            @click="selection.expand()"
          >
            {{ t('person.expand') }}
          </button>
          <button
            v-else
            type="button"
            class="popup__expand"
            data-test="collapse"
            @click="selection.collapse()"
          >
            {{ t('person.collapse') }}
          </button>
        </footer>
      </template>
    </section>
  </div>
</template>

<style scoped lang="scss">
.popup {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;

  &__scrim {
    position: absolute;
    inset: 0;
    background: var(--scrim);
  }

  &__dialog {
    position: relative;
    z-index: 1;
    width: min(460px, calc(100vw - 32px));
    max-height: min(80vh, 640px);
    overflow-y: auto;
    padding: 20px 22px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 14px;
    box-shadow: var(--glass-shadow);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--ink);
    font-family: var(--font-body);

    &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  }

  &__close {
    position: absolute;
    top: 10px;
    right: 12px;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--ink-soft);
    font-size: 17px;
    cursor: pointer;
    &:hover { background: rgba(95, 82, 64, 0.12); }
    &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  }

  &__status {
    margin: 8px 0;
    font-style: italic;
    &--error { color: #8a3b32; }
  }

  &__head {
    display: flex;
    gap: 14px;
    align-items: center;
  }

  &__portrait {
    flex: 0 0 auto;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    border: 1px solid var(--glass-border);
    background: var(--parchment-2);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__initial {
    font-size: 30px;
    color: var(--ink-soft);
  }

  &__name {
    margin: 0;
    font-size: 24px;
    font-family: var(--font-display);
  }

  &__maiden,
  &__life,
  &__vocation {
    margin: 3px 0 0;
    font-size: 16.5px;
    color: var(--ink-soft);
  }

  &__vocation {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  &__summary {
    margin: 14px 0 0;
    line-height: 1.5;
    font-size: 16px;
  }

  &__expanded {
    margin-top: 16px;
    border-top: 1px solid var(--glass-border);
    padding-top: 12px;
  }

  &__block { margin-top: 12px; }

  &__block-title {
    margin: 0 0 6px;
    font-size: 15px;
    font-family: var(--font-display);
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--ink-soft);
  }

  &__bio { margin: 0; line-height: 1.55; font-size: 16px; }

  &__list {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 16px;
  }

  &__residence {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 0;
  }

  &__years { color: var(--ink-soft); font-size: 15px; }

  &__map { text-decoration: none; }

  &__links a { color: var(--leaf-deep); }

  &__actions {
    margin-top: 16px;
    display: flex;
    gap: 10px;
  }

  &__expand {
    padding: 6px 14px;
    background: var(--parchment-2);
    border: 1px solid var(--ink-soft);
    border-radius: 6px;
    color: var(--ink);
    font: inherit;
    cursor: pointer;
    &:hover { background: var(--parchment); }
    &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  }
}

// mobile-first: bottom sheet on phones (§7 responsive)
@media (max-width: 640px) {
  .popup {
    align-items: flex-end;
    justify-content: stretch;

    &__dialog {
      width: 100%;
      max-height: 85vh;
      border-radius: 16px 16px 0 0;
    }
  }
}
</style>
