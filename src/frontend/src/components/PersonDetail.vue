<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useSelectionStore } from '../stores/selectionStore';
import PersonHeader from './PersonHeader.vue';
import PersonDossier from './PersonDossier.vue';

const { t } = useI18n({ useScope: 'global' });
const selection = useSelectionStore();
const { detail, loading, error } = storeToRefs(selection);
</script>

<template>
  <div class="detail" data-test="person-detail">
    <p v-if="loading" class="detail__status">{{ t('person.loading') }}</p>
    <p v-else-if="error" class="detail__status detail__status--error">{{ t('person.error') }}</p>
    <template v-else-if="detail">
      <PersonHeader :detail="detail" />
      <PersonDossier :detail="detail" class="detail__dossier" />
    </template>
  </div>
</template>

<style scoped lang="scss">
.detail { font-family: var(--font-body); color: var(--ink); --pager-page-h: 200px; }
.detail__status { margin: 8px 0; font-style: italic; &--error { color: #8a3b32; } }
.detail__dossier { margin-top: 14px; }
</style>
