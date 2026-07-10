<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { personMatchesQuery } from '../composables/useSearchMatches';
import { resolveMediaUrl } from '../media/mediaUrl';
import type { PersonSummary } from '../types/family';

const props = defineProps<{ people: PersonSummary[]; selectedId: string | null }>();
const emit = defineEmits<{ select: [id: string] }>();

const { t } = useI18n({ useScope: 'global' });
const locale = useLocaleStore();
const query = ref('');
const surnameFilter = ref('');
const sortMode = ref<'name' | 'birth'>('name');

// Distinct localized surnames for the surname filter, sorted in the active locale.
const surnames = computed<string[]>(() => {
  const seen = new Set<string>();
  for (const p of props.people) {
    const s = localize(p.surname, locale.currentLocale).trim();
    if (s) {
      seen.add(s);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b, locale.currentLocale));
});

const hasFilters = computed(() =>
  query.value.trim() !== '' || surnameFilter.value !== '' || sortMode.value !== 'name');

function clearFilters(): void {
  query.value = '';
  surnameFilter.value = '';
  sortMode.value = 'name';
}

const filtered = computed<PersonSummary[]>(() => {
  const q = query.value.trim();
  let list = q === ''
    ? [...props.people]
    : props.people.filter(p => personMatchesQuery(p, q, locale.currentLocale));
  if (surnameFilter.value !== '') {
    list = list.filter(p => localize(p.surname, locale.currentLocale).trim() === surnameFilter.value);
  }
  return list.sort((a, b) => {
    if (sortMode.value === 'birth') {
      return (a.birthYear ?? Number.POSITIVE_INFINITY) - (b.birthYear ?? Number.POSITIVE_INFINITY);
    }
    return localize(a.surname, locale.currentLocale).localeCompare(localize(b.surname, locale.currentLocale), locale.currentLocale);
  });
});

function fullName(p: PersonSummary): string {
  return `${localize(p.givenName, locale.currentLocale)} ${localize(p.surname, locale.currentLocale)}`.trim();
}
function thumbUrl(p: PersonSummary): string | null {
  const source = p.portraitThumb ?? p.portrait;
  return source ? resolveMediaUrl(source) : null;
}
function initial(p: PersonSummary): string {
  return fullName(p).charAt(0).toUpperCase();
}
function years(p: PersonSummary): string {
  return `${p.birthYear ?? '—'} – ${p.deathYear ?? ''}`.trim();
}
</script>

<template>
  <div class="members-index" data-test="members-index">
    <input
      v-model="query"
      type="search"
      class="members-index__search"
      data-test="members-search"
      :placeholder="t('members.searchPlaceholder')"
      :aria-label="t('members.searchPlaceholder')"
    />
    <div class="members-index__filters" data-test="members-filters">
      <label class="members-index__chip">
        <span class="members-index__chip-label">{{ t('members.filter.surname') }}</span>
        <select v-model="surnameFilter" class="members-index__chip-select" data-test="filter-surname">
          <option value="">{{ t('members.filter.all') }}</option>
          <option v-for="s in surnames" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <label class="members-index__chip">
        <span class="members-index__chip-label">{{ t('members.sort.label') }}</span>
        <select v-model="sortMode" class="members-index__chip-select" data-test="filter-sort">
          <option value="name">{{ t('members.sort.name') }}</option>
          <option value="birth">{{ t('members.sort.birth') }}</option>
        </select>
      </label>
      <button
        v-if="hasFilters"
        type="button"
        class="members-index__clear"
        data-test="filter-clear"
        @click="clearFilters"
      >{{ t('members.clear') }}</button>
    </div>
    <ul class="members-index__list" role="listbox">
      <li
        v-for="p in filtered"
        :key="p.id"
        role="option"
        :aria-selected="p.id === props.selectedId"
        class="members-index__row"
        :class="{ 'members-index__row--selected': p.id === props.selectedId }"
        data-test="member-row"
        tabindex="0"
        @click="emit('select', p.id)"
        @keydown.enter="emit('select', p.id)"
      >
        <img v-if="thumbUrl(p)" class="members-index__thumb" :src="thumbUrl(p) as string" alt="" />
        <span v-else class="members-index__thumb members-index__thumb--empty" aria-hidden="true">{{ initial(p) }}</span>
        <span class="members-index__name">{{ fullName(p) }}</span>
        <span class="members-index__years">{{ years(p) }}</span>
      </li>
    </ul>
    <p v-if="filtered.length === 0" class="members-index__empty" data-test="members-empty">{{ t('members.empty') }}</p>
    <p class="members-index__count">{{ t('members.count', { n: filtered.length }) }}</p>
  </div>
</template>

<style scoped lang="scss">
.members-index {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  &__search {
    width: 100%; padding: 10px 12px; margin-bottom: 8px;
    background: var(--field-bg); border: 1px solid var(--gilt); border-radius: 8px; color: var(--ink);
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 1px; }
  }
  &__filters {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px;
  }
  &__chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 8px 4px 12px;
    background: var(--stat-card-bg); border: 1px solid var(--panel-edge); border-radius: 999px;
  }
  &__chip-label {
    font-family: var(--font-body); font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-soft);
  }
  &__chip-select {
    background: transparent; border: none; color: var(--ink); font-family: var(--font-display); font-size: 13px; cursor: pointer;
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
  }
  &__clear {
    padding: 5px 12px; background: transparent; border: 1px solid var(--panel-edge); border-radius: 999px;
    color: var(--ink-soft); font-family: var(--font-body); font-size: 12px; cursor: pointer;
    &:hover { background: var(--control-hover); color: var(--ink); }
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
  }
  &__list {
    flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 0 6px 0 0;
    scrollbar-width: thin; scrollbar-color: var(--gilt) transparent;
    &::-webkit-scrollbar { width: 9px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb {
      background: linear-gradient(var(--gilt-light), var(--gilt));
      border: 1px solid var(--gilt-deep); border-radius: 6px;
    }
  }
  &__row {
    display: grid; grid-template-columns: 40px 1fr auto; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 8px; cursor: pointer; min-height: 44px;
    &:hover { background: var(--control-hover); }
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
    &--selected { background: var(--panel); box-shadow: inset 0 -1px 0 var(--gilt); }
  }
  &__thumb { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid var(--gilt); }
  &__thumb--empty {
    display: flex; align-items: center; justify-content: center;
    background: var(--stat-card-bg); color: var(--ink-soft);
    font-family: var(--font-display); font-size: 17px;
  }
  &__name { font-family: var(--font-display); color: var(--ink); }
  &__years { font-family: var(--font-body); font-style: italic; color: var(--ink-soft); font-size: 14px; }
  &__empty { padding: 16px; color: var(--ink-soft); font-style: italic; text-align: center; }
  &__count { margin: 6px 0 0; font-size: 12px; color: var(--ink-soft); text-align: center; }
}
</style>
