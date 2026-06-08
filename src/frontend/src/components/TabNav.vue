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
  display: flex; gap: 5px;
  &__tab {
    font-family: var(--font-display); font-size: 12.5px; letter-spacing: 0.6px;
    color: var(--ink-soft); padding: 7px 13px; border: 1px solid transparent;
    border-radius: 8px; background: transparent; cursor: pointer;
    &:hover:not(:disabled) { background: var(--control-hover); }
    &:disabled { opacity: 0.5; cursor: default; }
    &--active {
      color: var(--leaf-deep); background: linear-gradient(var(--control-grad-top), var(--control-grad-bottom));
      border-color: var(--gilt); box-shadow: inset 0 -2px 0 var(--gilt);
    }
    &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
  }
}
</style>
