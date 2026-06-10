<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUiStore } from '../stores/uiStore';
import { useSearchMatches } from '../composables/useSearchMatches';

const ui = useUiStore();
const { t } = useI18n({ useScope: 'global' });
const value = computed({ get: () => ui.search, set: v => ui.setSearch(v) });

const { total, currentIndex } = useSearchMatches();
const hasQuery = computed(() => ui.search.trim() !== '');
const counter = computed(() => (total.value === 0 ? '0' : `${currentIndex.value + 1} / ${total.value}`));

function onEnter(): void {
  if (hasQuery.value) {
    ui.advanceSearchCursor();
  }
}
</script>

<template>
  <label class="search">
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="var(--ink-soft)" stroke-width="1.6"/><line x1="11" y1="11" x2="15" y2="15" stroke="var(--ink-soft)" stroke-width="1.6"/></svg>
    <input
      v-model="value"
      type="search"
      class="search__input"
      data-test="search-input"
      :aria-label="t('search.label')"
      :placeholder="t('search.placeholder')"
      @search="value = ($event.target as HTMLInputElement).value"
      @keydown.enter="onEnter"
    />
    <span
      v-if="hasQuery"
      class="search__count"
      :class="{ 'search__count--empty': total === 0 }"
      data-test="search-count"
      role="status"
      :title="t('search.matches')"
    >{{ counter }}</span>
  </label>
</template>

<style scoped lang="scss">
.search {
  display: inline-flex; align-items: center; gap: 7px;
  background: #fffdf5; border: 1px solid var(--panel-edge);
  border-radius: 20px; padding: 8px 15px; min-width: 240px;
  box-shadow: inset 0 1px 2px rgba(74, 58, 36, 0.08);
  &__input {
    border: none; background: transparent; outline: none; width: 100%;
    font-family: var(--font-body); font-size: 19px; color: var(--ink);
    &::placeholder { color: var(--ink-faint); }
  }
  &__count {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--ink-soft);
    white-space: nowrap;
    &--empty { color: var(--ink-faint); }
  }
}
@media (max-width: 640px) { .search { min-width: 120px; } }
</style>
