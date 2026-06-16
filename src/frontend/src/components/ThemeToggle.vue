<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useUiStore, type Theme } from '../stores/uiStore';

const ui = useUiStore();
const { t } = useI18n({ useScope: 'global' });

function set(theme: Theme): void {
  ui.setTheme(theme);
}
</script>

<template>
  <div class="theme-toggle" role="group" :aria-label="t('theme.label')" data-test="theme-toggle">
    <button
      type="button"
      class="theme-toggle__btn"
      :class="{ 'theme-toggle__btn--on': ui.theme === 'classic' }"
      :aria-pressed="ui.theme === 'classic'"
      data-test="theme-classic"
      @click="set('classic')"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>
      <span>{{ t('theme.classic') }}</span>
    </button>
    <button
      type="button"
      class="theme-toggle__btn"
      :class="{ 'theme-toggle__btn--on': ui.theme === 'eighties' }"
      :aria-pressed="ui.theme === 'eighties'"
      data-test="theme-eighties"
      @click="set('eighties')"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><g stroke="currentColor" stroke-width="1.4" fill="none"><rect x="3" y="2" width="8" height="10" rx="1"/><line x1="3" y1="4.5" x2="11" y2="4.5"/><line x1="3" y1="9.5" x2="11" y2="9.5"/></g></svg>
      <span>{{ t('theme.eighties') }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.theme-toggle {
  display: inline-flex;
  border: 1px solid var(--panel-edge);
  border-radius: 8px;
  overflow: hidden;
  background: var(--control-grad-top);
  font-family: var(--font-display);
  font-size: 17px;

  &__btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 17px;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--ink-soft);
    cursor: pointer;
    &:hover:not(&--on) { background: var(--control-hover); }
    &--on { background: var(--bark); color: var(--on-accent); }
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: -2px; }
  }
}
</style>
