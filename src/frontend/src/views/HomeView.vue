<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useFamilyTreeStore } from '@/stores/familyTree'
import TreeCanvas from '@/components/TreeCanvas.vue'
import MemberPopup from '@/components/MemberPopup.vue'

const store = useFamilyTreeStore()
const { layout, loading, error, selectedMember, selectedMemberLoading, selectedMemberError } =
  storeToRefs(store)
const route = useRoute()
const router = useRouter()

const selectedId = computed(() => (route.params.id as string | undefined) ?? null)

function syncSelectionFromRoute(): void {
  if (selectedId.value) {
    void store.selectMember(selectedId.value)
  } else {
    store.clearSelection()
  }
}

function onSelect(id: string): void {
  void router.push({ name: 'member', params: { id } })
}

function onClose(): void {
  void router.push({ name: 'home' })
}

onMounted(async () => {
  await store.loadTree()
  syncSelectionFromRoute()
})

watch(selectedId, syncSelectionFromRoute)
</script>

<template>
  <div class="home">
    <header class="home__header">
      <h1 class="home__title">The Bauer Family</h1>
      <p class="home__subtitle">A family tree, rooted in the XVIII century</p>
    </header>

    <main class="home__stage">
      <p v-if="loading" class="home__status">Growing the tree…</p>
      <p v-else-if="error" class="home__status home__status--error">{{ error }}</p>
      <TreeCanvas v-else :layout="layout" :selected-id="selectedId" @select="onSelect" />
    </main>

    <MemberPopup
      v-if="selectedId"
      :member="selectedMember"
      :loading="selectedMemberLoading"
      :error="selectedMemberError"
      @close="onClose"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.home {
  display: flex;
  flex-direction: column;
  height: 100%;

  &__header {
    flex: 0 0 auto;
    padding: 12px 16px 8px calc(#{$year-axis-width-mobile} + 8px);

    @media (min-width: $breakpoint-tablet) {
      padding-left: calc(#{$year-axis-width} + 16px);
    }
  }

  &__title {
    margin: 0;
    font-size: 22px;
    color: $bark-shadow;

    @media (min-width: $breakpoint-tablet) {
      font-size: 28px;
    }
  }

  &__subtitle {
    margin: 2px 0 0;
    font-size: 14px;
    color: $ink-soft;
    font-style: italic;
  }

  &__stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
  }

  &__status {
    padding: 24px calc(#{$year-axis-width-mobile} + 16px);
    color: $ink-soft;

    &--error {
      color: $accent-terracotta;
    }
  }
}
</style>
