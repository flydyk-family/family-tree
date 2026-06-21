<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useLocaleStore } from '../stores/localeStore';
import type { Locale } from '../constants/locales';
import ThemeToggle from './ThemeToggle.vue';
import OrientationToggle from './OrientationToggle.vue';

const { t } = useI18n({ useScope: 'global' });
const locale = useLocaleStore();

function choose(code: Locale): void {
  locale.setLocale(code);
}
</script>

<template>
  <div class="settings-panel" data-test="settings-panel">
    <div class="settings-panel__group">
      <span class="settings-panel__label">{{ t('nav.language') }}</span>
      <ul class="settings-panel__locales" role="group" :aria-label="t('picker.label')">
        <li v-for="option in locale.options" :key="option.code">
          <button
            type="button"
            class="settings-panel__locale"
            :class="{ 'settings-panel__locale--on': option.code === locale.currentLocale }"
            :aria-pressed="option.code === locale.currentLocale"
            data-test="settings-language-option"
            @click="choose(option.code)"
          >
            <span :class="option.flagClass" class="settings-panel__flag" aria-hidden="true"></span>
            <span class="settings-panel__name">{{ option.nativeName }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div class="settings-panel__group">
      <span class="settings-panel__label">{{ t('theme.label') }}</span>
      <ThemeToggle />
    </div>

    <div class="settings-panel__group">
      <span class="settings-panel__label">{{ t('orientation.label') }}</span>
      <OrientationToggle />
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 220px;
}
.settings-panel__group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.settings-panel__label {
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--gilt-deep);
  font-family: var(--font-display);
}
.settings-panel__locales {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.settings-panel__locale {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 17px;
  cursor: pointer;
  // Guard hover so the selected (bark) item keeps its dark fill — otherwise the
  // light hover wash lands under the light --on-accent text and is unreadable.
  &:hover:not(&--on) { background: var(--control-hover); }
  &--on { background: var(--bark); color: var(--on-accent); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.settings-panel__flag {
  width: 1.2em;
  line-height: 1em;
  border-radius: 2px;
}
// The embedded toggles stretch to fill the panel width.
.settings-panel :deep(.theme-toggle),
.settings-panel :deep(.orient) { display: flex; width: 100%; }
.settings-panel :deep(.theme-toggle__btn),
.settings-panel :deep(.orient__btn) { flex: 1 1 0; justify-content: center; }
</style>
