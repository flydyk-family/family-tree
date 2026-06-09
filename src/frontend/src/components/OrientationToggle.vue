<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useUiStore, type Orientation } from '../stores/uiStore';

const ui = useUiStore();
const { t } = useI18n({ useScope: 'global' });

function set(orientation: Orientation): void {
  ui.setOrientation(orientation);
}
</script>

<template>
  <div class="orient" role="group" :aria-label="t('orientation.label')" data-test="orientation-toggle">
    <button
      type="button"
      class="orient__btn"
      :class="{ 'orient__btn--on': ui.orientation === 'vertical' }"
      :aria-pressed="ui.orientation === 'vertical'"
      data-test="orientation-vertical"
      @click="set('vertical')"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><g stroke="currentColor" stroke-width="1.7"><line x1="4" y1="2" x2="4" y2="12"/><line x1="7" y1="2" x2="7" y2="12"/><line x1="10" y1="2" x2="10" y2="12"/></g></svg>
      <span>{{ t('orientation.vertical') }}</span>
    </button>
    <button
      type="button"
      class="orient__btn"
      :class="{ 'orient__btn--on': ui.orientation === 'horizontal' }"
      :aria-pressed="ui.orientation === 'horizontal'"
      data-test="orientation-horizontal"
      @click="set('horizontal')"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><g stroke="currentColor" stroke-width="1.7"><line x1="2" y1="4" x2="12" y2="4"/><line x1="2" y1="7" x2="12" y2="7"/><line x1="2" y1="10" x2="12" y2="10"/></g></svg>
      <span>{{ t('orientation.horizontal') }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.orient {
  display: inline-flex;
  border: 1px solid var(--panel-edge);
  border-radius: 8px;
  overflow: hidden;
  background: #fffdf5;
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
