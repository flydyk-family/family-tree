<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { personSlug, extractPersonId } from '../utils/personSlug';
import MembersIndex from '../components/MembersIndex.vue';
import MemberDetail from '../components/MemberDetail.vue';

const store = useFamilyStore();
const { people, loading, error } = storeToRefs(store);
const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();

onMounted(() => {
  if (store.people.length === 0) {
    void store.load();
  }
});

const selectedId = computed<string | null>(() => {
  const slug = route.params.slug;
  return typeof slug === 'string' ? extractPersonId(slug) : null;
});

function select(id: string): void {
  const person = store.personById(id);
  void router.push({ name: 'members', params: { slug: person ? personSlug(person) : id } });
}
</script>

<template>
  <main class="members" data-test="members-view">
    <p v-if="loading" class="members__status">{{ t('status.loading') }}</p>
    <p v-else-if="error" class="members__status members__status--error">{{ t('status.error') }}</p>
    <div v-else class="members__layout">
      <MembersIndex class="members__index" :people="people" :selected-id="selectedId" @select="select" />
      <MemberDetail v-if="selectedId" class="members__detail" :person-id="selectedId" />
      <p v-else class="members__hint">{{ t('members.pickHint') }}</p>
    </div>
  </main>
</template>

<style scoped lang="scss">
.members { height: 100%; overflow: hidden; }
.members__status { padding: 24px; font-style: italic; color: var(--ink-soft); &--error { color: #8a3b32; } }
.members__layout { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 16px; height: 100%; padding: 16px; }
.members__index { min-height: 0; }
.members__detail { min-height: 0; overflow-y: auto; }
.members__hint { color: var(--ink-soft); font-style: italic; align-self: start; padding: 24px; }
@media (max-width: 720px) {
  .members__layout { grid-template-columns: 1fr; }
}
</style>
