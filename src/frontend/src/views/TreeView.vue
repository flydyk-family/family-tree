<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useUiStore } from '../stores/uiStore';
import { usePanelStore } from '../stores/panelStore';
import { buildLayout } from '../layout/treeLayout';
import { projectLayout } from '../layout/projection';
import type { Viewport } from '../interactions/panZoom';
import TimeRail from '../components/TimeRail.vue';
import OakTree from '../components/OakTree.vue';
import PersonPopup from '../components/PersonPopup.vue';
import PanelRail from '../components/PanelRail.vue';

const store = useFamilyStore();
const selection = useSelectionStore();
const ui = useUiStore();
const panel = usePanelStore();
const { people, unions, focusId, loading, error } = storeToRefs(store);
const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();

// The oak owns the pan/zoom gesture surface and reports its viewport up so the
// time rail can apply the same transform and stay aligned.
const oakViewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
function onViewport(value: Viewport): void {
  oakViewport.value = value;
}

onMounted(() => {
  if (store.people.length === 0) {
    void store.load();
  }
});

const selectedId = computed(() => {
  const id = route.params.id;
  return typeof id === 'string' ? id : null;
});

// Panel store expandedId → selection store + URL: when the user expands a panel
// (e.g. via the rail controls) we fetch the person's detail and keep the URL in
// sync. Guards on the current route value prevent infinite navigation loops.
// Registered BEFORE the selectedId watcher so it catches changes made by the
// selectedId watcher's immediate firing.
watch(
  () => panel.expandedId,
  id => {
    if (id) {
      void selection.open(id);
      if (route.params.id !== id) {
        void router.replace({ name: 'person', params: { id } });
      }
    } else {
      selection.close();
      if (route.name !== 'tree') {
        void router.replace({ name: 'tree' });
      }
    }
  }
);

// Route param → panel store: opening a /person/:id URL opens (or expands) that
// person's panel. Navigating back to the tree root minimizes all person panels.
watch(
  selectedId,
  id => {
    if (id) {
      panel.openPerson(id);
    } else {
      panel.minimizeAllPersons();
    }
  },
  { immediate: true }
);

function onSelect(id: string): void {
  void router.push({ name: 'person', params: { id } });
}

const baseLayout = computed(() => {
  if (!focusId.value || people.value.length === 0) return null;
  return buildLayout({ people: people.value, unions: unions.value }, { focusId: focusId.value });
});
const layout = computed(() => (baseLayout.value ? projectLayout(baseLayout.value, ui.orientation) : null));
</script>

<template>
  <main class="tree-view">
    <p v-if="loading" class="tree-view__status">{{ t('status.loading') }}</p>
    <p v-else-if="error" class="tree-view__status tree-view__status--error">{{ t('status.error') }}</p>
    <div v-else-if="layout" class="tree-view__canvas" :class="`tree-view__canvas--${ui.orientation}`">
      <TimeRail class="tree-view__rail" :scale="layout.scale" :viewport="oakViewport" :orientation="ui.orientation" />
      <div class="tree-view__oak">
        <OakTree :layout="layout" :selected-id="selectedId" :orientation="ui.orientation" @select="onSelect" @viewport="onViewport" />
      </div>
    </div>

    <PanelRail v-if="layout" :people="people" />
    <PersonPopup v-if="panel.biggerViewId" />
  </main>
</template>

<style scoped lang="scss">
.tree-view {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;

  &__status {
    padding: 24px;
    font-style: italic;
    &--error { color: #8a3b32; }
  }

  &__canvas { display: flex; height: 100%; width: 100%; }
  &__canvas--horizontal { flex-direction: column-reverse; }
  &__rail { flex: 0 0 auto; overflow: hidden; }
  &__canvas--vertical &__rail { width: 88px; height: 100%; }
  &__canvas--horizontal &__rail { width: 100%; height: 62px; }
  &__oak {
    flex: 1 1 auto; min-width: 0; min-height: 0;
    position: relative; border: 1px solid var(--panel-edge); border-radius: 10px; overflow: hidden;
    background: radial-gradient(130% 120% at 50% 18%, #fbf5e3 0%, #f1e8cf 55%, #ddceb0 100%);
    box-shadow: inset 0 0 40px rgba(120, 150, 70, 0.10);
  }
  @media (max-width: 640px) { &__canvas--vertical &__rail { width: 64px; } }
}
</style>
