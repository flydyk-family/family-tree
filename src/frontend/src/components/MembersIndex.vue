<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { personMatchesQuery, normalizeQuery } from '../composables/useSearchMatches';
import { computeGenerations, generationOptions } from '../composables/familyGenerations';
import { resolveMediaUrl } from '../media/mediaUrl';
import BotanicalCorner from './heraldry/BotanicalCorner.vue';
import type { Locale } from '../constants/locales';
import type { PersonSummary, Union } from '../types/family';

const props = withDefaults(
  defineProps<{ people: PersonSummary[]; selectedId: string | null; unions?: Union[] }>(),
  { unions: () => [] }
);
const emit = defineEmits<{ select: [id: string] }>();

const { t } = useI18n({ useScope: 'global' });
const locale = useLocaleStore();
const query = ref('');
const surnameFilter = ref('');
const placeFilter = ref('');
const generationFilter = ref('');
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

// Distinct localized birth places for the place filter, sorted in the active locale.
const places = computed<string[]>(() => {
  const seen = new Set<string>();
  for (const p of props.people) {
    const place = localize(p.birthPlace, locale.currentLocale).trim();
    if (place) {
      seen.add(place);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b, locale.currentLocale));
});

const generations = computed(() => computeGenerations(props.people, props.unions));
const generationOpts = computed<number[]>(() => generationOptions(generations.value));

const hasFilters = computed(() =>
  query.value.trim() !== ''
  || surnameFilter.value !== ''
  || placeFilter.value !== ''
  || generationFilter.value !== ''
  || sortMode.value !== 'name');

function clearFilters(): void {
  query.value = '';
  surnameFilter.value = '';
  placeFilter.value = '';
  generationFilter.value = '';
  sortMode.value = 'name';
}

// Matches on name/maiden name (personMatchesQuery) or, since the roster search
// also covers "…or place", on the person's localized birth place. The place branch
// reuses personMatchesQuery's shared normalizeQuery so both paths treat a query identically.
function matchesQuery(p: PersonSummary, q: string, loc: Locale): boolean {
  if (personMatchesQuery(p, q, loc)) {
    return true;
  }
  const needle = normalizeQuery(q);
  if (needle === '') {
    return false;
  }
  const place = localize(p.birthPlace, loc).toLowerCase();
  return place !== '' && place.includes(needle);
}

const filtered = computed<PersonSummary[]>(() => {
  const q = query.value.trim();
  let list = q === ''
    ? [...props.people]
    : props.people.filter(p => matchesQuery(p, q, locale.currentLocale));
  if (surnameFilter.value !== '') {
    list = list.filter(p => localize(p.surname, locale.currentLocale).trim() === surnameFilter.value);
  }
  if (placeFilter.value !== '') {
    list = list.filter(p => localize(p.birthPlace, locale.currentLocale).trim() === placeFilter.value);
  }
  if (generationFilter.value !== '') {
    const g = Number(generationFilter.value);
    list = list.filter(p => generations.value.get(p.id) === g);
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
    <div class="members-index__controls">
      <div class="members-index__search-wrap">
        <svg class="members-index__search-icon" aria-hidden="true" viewBox="0 0 16 16">
          <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4" />
          <line x1="10" y1="10" x2="14.5" y2="14.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
        <input
          v-model="query"
          type="search"
          class="members-index__search"
          data-test="members-search"
          :placeholder="t('members.searchPlaceholder')"
          :aria-label="t('members.searchPlaceholder')"
        />
      </div>
      <div class="members-index__filters" data-test="members-filters">
        <div class="members-index__filters-row">
          <label class="members-index__chip">
            <svg class="members-index__chip-icon" aria-hidden="true" viewBox="0 0 14 14">
              <line x1="2" y1="3" x2="12" y2="3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
              <line x1="4" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
              <line x1="6" y1="11" x2="12" y2="11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
            <span class="members-index__chip-label">{{ t('members.filter.generation') }}</span>
            <select v-model="generationFilter" class="members-index__chip-select" data-test="filter-generation">
              <option value="">{{ t('members.filter.all') }}</option>
              <option v-for="g in generationOpts" :key="g" :value="String(g)">{{ t('members.generationOption', { n: g }) }}</option>
            </select>
          </label>
          <label class="members-index__chip">
            <svg class="members-index__chip-icon" aria-hidden="true" viewBox="0 0 14 14">
              <path d="M2 10 C4 4 6 4 7 7 C8 10 10 10 12 4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
            <span class="members-index__chip-label">{{ t('members.filter.surname') }}</span>
            <select v-model="surnameFilter" class="members-index__chip-select" data-test="filter-surname">
              <option value="">{{ t('members.filter.all') }}</option>
              <option v-for="s in surnames" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <label class="members-index__chip">
            <svg class="members-index__chip-icon" aria-hidden="true" viewBox="0 0 14 14">
              <path d="M7 1C4 1 2 3 2 6c0 3.5 5 7 5 7s5-3.5 5-7c0-3-2-5-5-5Z" fill="none" stroke="currentColor" stroke-width="1.2" />
              <circle cx="7" cy="6" r="1.5" fill="currentColor" />
            </svg>
            <span class="members-index__chip-label">{{ t('members.filter.place') }}</span>
            <select v-model="placeFilter" class="members-index__chip-select" data-test="filter-place">
              <option value="">{{ t('members.filter.all') }}</option>
              <option v-for="pl in places" :key="pl" :value="pl">{{ pl }}</option>
            </select>
          </label>
        </div>
        <div class="members-index__filters-row members-index__filters-row--secondary">
          <label class="members-index__chip">
            <svg class="members-index__chip-icon" aria-hidden="true" viewBox="0 0 14 14">
              <path d="M4 9V2M2 4l2-2 2 2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M10 5v7M8 10l2 2 2-2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
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
      </div>
    </div>
    <div class="members-index__list-wrap">
      <BotanicalCorner class="members-index__botanical" />
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
          <span class="members-index__marker" aria-hidden="true">
            <svg v-if="p.id === props.selectedId" class="members-index__fleuron" viewBox="0 0 10 18">
              <path d="M5 1 L9 9 L5 17 L1 9 Z" fill="var(--gilt-light)" stroke="var(--gilt-deep)" stroke-width="1" stroke-linejoin="round" />
            </svg>
          </span>
        </li>
      </ul>
    </div>
    <p v-if="filtered.length === 0" class="members-index__empty" data-test="members-empty">{{ t('members.empty') }}</p>
    <p class="members-index__count">{{ t('members.count', { n: filtered.length }) }}</p>
  </div>
</template>

<style scoped lang="scss">
.members-index {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  // Framed search + filter block, carved off from the roster below it.
  &__controls {
    padding: 12px;
    margin-bottom: 12px;
    background: var(--surface-card);
    border: 1px solid var(--gilt);
    border-radius: 10px;
    box-shadow: 0 3px 10px var(--shadow, rgba(0, 0, 0, 0.1));
  }
  &__search-wrap {
    position: relative; margin-bottom: 10px;
  }
  &__search-icon {
    position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
    width: 14px; height: 14px; color: var(--ink-soft); pointer-events: none;
  }
  &__search {
    width: 100%; padding: 10px 12px 10px 32px;
    background: var(--field-bg); border: 1px solid var(--gilt); border-radius: 8px; color: var(--ink);
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 1px; }
  }
  &__filters {
    display: flex; flex-direction: column; gap: 8px;
  }
  &__filters-row {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    &--secondary { justify-content: space-between; }
  }
  &__chip {
    display: inline-flex; align-items: center; gap: 6px; min-height: 44px;
    padding: 4px 10px 4px 10px;
    background: var(--stat-card-bg); border: 1px solid var(--panel-edge); border-radius: 999px;
  }
  &__chip-icon {
    flex: 0 0 auto; width: 13px; height: 13px; color: var(--ink-soft);
  }
  &__chip-label {
    font-family: var(--font-body); font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-soft);
  }
  &__chip-select {
    background: transparent; border: none; color: var(--ink); font-family: var(--font-display); font-size: 13px; cursor: pointer;
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
  }
  &__clear {
    display: inline-flex; align-items: center; min-height: 44px;
    padding: 5px 12px; background: transparent; border: 1px solid var(--panel-edge); border-radius: 999px;
    color: var(--ink-soft); font-family: var(--font-body); font-size: 12px; cursor: pointer;
    &:hover { background: var(--control-hover); color: var(--ink); }
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
  }
  &__list-wrap {
    position: relative; flex: 1; min-height: 0; display: flex;
  }
  &__botanical {
    position: absolute; left: 0; bottom: 0; width: 96px; height: 96px;
    z-index: 0; opacity: 0.55; pointer-events: none;
  }
  &__list {
    position: relative; z-index: 1;
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
    display: grid; grid-template-columns: 40px 1fr auto 16px; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 8px; cursor: pointer; min-height: 44px;
    &:hover { background: var(--control-hover); }
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
    // Selected row: a framed gilt cartouche (double inset rule + raised surface),
    // no border so the grid never reflows on select. Token-only for Film.
    &--selected {
      background: var(--surface-card);
      box-shadow:
        inset 0 0 0 1.5px var(--gilt),
        inset 0 0 0 3px var(--gilt-light),
        0 1px 5px var(--shadow, rgba(0, 0, 0, 0.12));
    }
  }
  // Portrait cameo: a fine gilt ring with a thin paper gap, a framed-medallion look.
  &__thumb {
    width: 40px; height: 40px; border-radius: 50%; object-fit: cover;
    border: 1px solid var(--gilt);
    box-shadow: 0 0 0 2px var(--paper), 0 0 0 3px var(--gilt-light);
  }
  &__thumb--empty {
    display: flex; align-items: center; justify-content: center;
    background: var(--stat-card-bg); color: var(--ink-soft);
    font-family: var(--font-display); font-size: 17px;
  }
  &__name { font-family: var(--font-display); color: var(--ink); }
  &__years { font-family: var(--font-body); font-style: italic; color: var(--ink-soft); font-size: 14px; }
  &__marker { display: flex; align-items: center; justify-content: center; width: 16px; }
  &__fleuron { width: 10px; height: 18px; display: block; }
  &__empty { padding: 16px; color: var(--ink-soft); font-style: italic; text-align: center; }
  &__count { margin: 6px 0 0; font-size: 12px; color: var(--ink-soft); text-align: left; }
}
</style>
