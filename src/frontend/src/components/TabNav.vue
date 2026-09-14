<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import type { TabId } from '../stores/uiStore';
import { activeFamilyId, familyLocation, isView, type FamilyView } from '../router/familyRoutes';

const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();

const tabs: { id: TabId; key: string; view?: FamilyView; enabled: boolean }[] = [
  { id: 'chronicle', key: 'nav.chronicle', view: 'chronicle', enabled: true },
  { id: 'tree', key: 'nav.tree', view: 'tree', enabled: true },
  { id: 'members', key: 'nav.members', view: 'members', enabled: true },
  { id: 'timeline', key: 'nav.timeline', enabled: false }
];

// The route is the single source of truth for which view is shown; the person
// deep-link (/person/:slug or /f/:familyId/person/:slug) still belongs to the
// Tree tab.
const activeId = computed<TabId>(() =>
  isView(route, 'chronicle') ? 'chronicle'
  : isView(route, 'members') ? 'members'
  : 'tree'
);

function go(tab: { view?: FamilyView; enabled: boolean }): void {
  if (tab.enabled && tab.view) {
    void router.push(familyLocation(tab.view, activeFamilyId(route)));
  }
}
</script>

<template>
  <nav class="tabnav" data-test="tab-nav">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      class="tabnav__tab"
      :class="{ 'tabnav__tab--active': activeId === tab.id }"
      :data-test="`tab-${tab.id}`"
      :disabled="!tab.enabled"
      :title="tab.enabled ? '' : t('nav.comingSoon')"
      @click="go(tab)"
    >{{ t(tab.key) }}</button>
  </nav>
</template>

<style scoped lang="scss">
.tabnav {
  display: flex; gap: 4px;
  &__tab {
    font-family: var(--font-display); font-size: 18.5px; font-weight: 600; letter-spacing: 0.5px;
    color: var(--ink); padding: 7px 14px; border: 1px solid transparent; border-bottom: none;
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
