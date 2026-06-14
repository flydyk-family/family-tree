<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { PersonDetail } from '../types/family';
import PersonHeader from './PersonHeader.vue';
import PersonDossier from './PersonDossier.vue';

// Prop-driven (one detail per rail panel) rather than reading the shared
// selection store: that store's `detail` is cleared whenever nothing is expanded
// (minimize), which would tear the content down. The rail feeds each panel from
// the persistent per-person cache instead, so a panel keeps its content while
// minimized and min↔max stays a pure CSS toggle (no re-mount, no re-fetch).
defineProps<{
  detail: PersonDetail | null;
  loading?: boolean;
  error?: string | null;
}>();

const { t } = useI18n({ useScope: 'global' });
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
.detail { font-family: var(--font-body); color: var(--ink); --pager-page-h: min(48vh, 460px); }
.detail__status { margin: 8px 0; font-style: italic; &--error { color: #8a3b32; } }
.detail__dossier { margin-top: 14px; }
</style>
