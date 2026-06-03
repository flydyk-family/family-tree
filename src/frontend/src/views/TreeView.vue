<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { useSelectionStore } from '../stores/selectionStore';
import { buildLayout } from '../layout/treeLayout';
import YearAxis from '../components/YearAxis.vue';
import OakTree from '../components/OakTree.vue';
import PersonPopup from '../components/PersonPopup.vue';

const store = useFamilyStore();
const selection = useSelectionStore();
const { people, unions, focusId, loading, error } = storeToRefs(store);
const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();

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

const layout = computed(() => {
  if (!focusId.value || people.value.length === 0) {
    return null;
  }
  return buildLayout({ people: people.value, unions: unions.value }, { focusId: focusId.value });
});
</script>

<template>
  <main class="tree-view">
    <p v-if="loading" class="tree-view__status">{{ t('status.loading') }}</p>
    <p v-else-if="error" class="tree-view__status tree-view__status--error">{{ t('status.error') }}</p>
    <div v-else-if="layout" class="tree-view__canvas">
      <YearAxis class="tree-view__axis" :scale="layout.scale" :step="25" />
      <div class="tree-view__oak">
        <OakTree :layout="layout" :selected-id="selectedId" @select="onSelect" />
      </div>
    </div>

    <PersonPopup v-if="selectedId" @close="onClose" />
  </main>
</template>

<style scoped lang="scss">
.tree-view {
  height: 100%;
  width: 100%;
  overflow: hidden;

  &__status {
    padding: 24px;
    font-style: italic;
    &--error { color: #8a3b32; }
  }

  &__canvas {
    display: flex;
    height: 100%;
    width: 100%;
  }

  &__axis {
    flex: 0 0 auto;
    height: 100%;
    overflow: hidden;
    border-right: 1px solid rgba(95, 82, 64, 0.25);
  }

  &__oak {
    flex: 1 1 auto;
    height: 100%;
    min-width: 0;
  }
}

// mobile-first: axis stays pinned, oak scales to fit width
@media (max-width: 640px) {
  .tree-view__axis { width: 48px; }
}
</style>
