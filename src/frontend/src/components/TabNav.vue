<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useUiStore, type TabId } from '../stores/uiStore';

const ui = useUiStore();
const { t } = useI18n({ useScope: 'global' });

const tabs: { id: TabId; key: string; enabled: boolean }[] = [
  { id: 'chronicle', key: 'nav.chronicle', enabled: true },
  { id: 'tree', key: 'nav.tree', enabled: true },
  { id: 'members', key: 'nav.members', enabled: false },
  { id: 'timeline', key: 'nav.timeline', enabled: false }
];
</script>

<template>
  <nav class="tabnav" data-test="tab-nav">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      class="tabnav__tab"
      :class="{ 'tabnav__tab--active': ui.activeTab === tab.id }"
      :data-test="`tab-${tab.id}`"
      :disabled="!tab.enabled"
      :title="tab.enabled ? '' : t('nav.comingSoon')"
      @click="tab.enabled && ui.setActiveTab(tab.id)"
    >{{ t(tab.key) }}</button>
  </nav>
</template>

<style scoped lang="scss">
.tabnav {
  display: flex; gap: 4px;
  &__tab {
    font-family: var(--font-display); font-size: 13px; letter-spacing: 0.5px;
    color: var(--ink-soft); padding: 6px 12px; border: 1px solid transparent; border-bottom: none;
    border-radius: 7px 7px 0 0; background: transparent; cursor: pointer;
    &:hover:not(:disabled) { background: var(--control-hover); }
    &:disabled { opacity: 0.5; cursor: default; }
    &--active {
      color: var(--ink); background: var(--panel);
      border-color: var(--panel-edge); box-shadow: inset 0 -1px 0 var(--gilt);
    }
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
  }
}
</style>
