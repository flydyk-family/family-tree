<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useUiStore } from '../stores/uiStore';
import { buildLayout } from '../layout/treeLayout';
import { projectLayout } from '../layout/projection';
import type { Viewport } from '../interactions/panZoom';
import TimeRail from '../components/TimeRail.vue';
import OakTree from '../components/OakTree.vue';
import PersonPopup from '../components/PersonPopup.vue';
import StatsPanel from '../components/StatsPanel.vue';

const store = useFamilyStore();
const selection = useSelectionStore();
const ui = useUiStore();
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

// Keep the selection store in sync with the route param (covers deep links and
// in-app navigation alike).
watch(
  selectedId,
  id => {
    if (id) {
      void selection.open(id);
    } else {
      selection.close();
    }
  },
  { immediate: true }
);

function onSelect(id: string): void {
  void router.push({ name: 'person', params: { id } });
}

function onClose(): void {
  void router.push({ name: 'tree' });
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

    <StatsPanel v-if="layout" class="tree-view__stats" :people="people" />
    <PersonPopup v-if="selectedId" @close="onClose" />
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
  &__canvas--vertical &__rail { width: 78px; height: 100%; }
  &__canvas--horizontal &__rail { width: 100%; height: 54px; }
  &__oak { flex: 1 1 auto; min-width: 0; min-height: 0; }
  @media (max-width: 640px) { &__canvas--vertical &__rail { width: 56px; } }
  &__stats {
    position: absolute; top: 12px; right: 12px; z-index: 6;
    width: 248px; max-height: calc(100% - 24px); overflow: auto;
  }
  @media (max-width: 960px) { &__stats { display: none; } }
}
</style>
