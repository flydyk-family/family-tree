<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useFamilyStore } from '../stores/familyStore';
import { buildLayout } from '../layout/treeLayout';
import YearAxis from '../components/YearAxis.vue';
import OakTree from '../components/OakTree.vue';

const store = useFamilyStore();
const { people, unions, focusId, loading, error } = storeToRefs(store);
const { t } = useI18n({ useScope: 'global' });

onMounted(() => {
  if (store.people.length === 0) {
    void store.load();
  }
});

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
        <OakTree :layout="layout" />
      </div>
    </div>
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
