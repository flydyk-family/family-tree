<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUiStore } from '../stores/uiStore';

const ui = useUiStore();
const { t } = useI18n({ useScope: 'global' });
const value = computed({ get: () => ui.search, set: v => ui.setSearch(v) });
</script>

<template>
  <label class="search" :aria-label="t('search.label')">
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="var(--ink-soft)" stroke-width="1.6"/><line x1="11" y1="11" x2="15" y2="15" stroke="var(--ink-soft)" stroke-width="1.6"/></svg>
    <input v-model="value" type="search" class="search__input" data-test="search-input" :placeholder="t('search.placeholder')" />
  </label>
</template>

<style scoped lang="scss">
.search {
  display: inline-flex; align-items: center; gap: 8px;
  background: linear-gradient(var(--control-grad-top), var(--control-grad-bottom)); border: 1px solid var(--gilt-deep);
  border-radius: 9px; padding: 7px 13px; min-width: 220px;
  &__input {
    border: none; background: transparent; outline: none; width: 100%;
    font-family: var(--font-body); font-size: 14px; color: var(--ink);
    &::placeholder { color: #9a875e; }
  }
}
@media (max-width: 640px) { .search { min-width: 120px; } }
</style>
