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

const filtered = computed<PersonSummary[]>(() => {
  const q = query.value.trim();
  const list = q === ''
    ? [...props.people]
    : props.people.filter(p => personMatchesQuery(p, q, locale.currentLocale));
  return list.sort((a, b) =>
    localize(a.surname, locale.currentLocale).localeCompare(localize(b.surname, locale.currentLocale), locale.currentLocale)
  );
});

function fullName(p: PersonSummary): string {
  return `${localize(p.givenName, locale.currentLocale)} ${localize(p.surname, locale.currentLocale)}`.trim();
}
function thumbUrl(p: PersonSummary): string | null {
  const source = p.portraitThumb ?? p.portrait;
  return source ? resolveMediaUrl(source) : null;
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
        <span v-else class="members-index__thumb members-index__thumb--empty" aria-hidden="true"></span>
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
    background: var(--field-bg); border: 1px solid var(--panel-edge); border-radius: 8px; color: var(--ink);
  }
  &__list { flex: 1; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 0; }
  &__row {
    display: grid; grid-template-columns: 40px 1fr auto; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 8px; cursor: pointer; min-height: 44px;
    &:hover { background: var(--control-hover); }
    &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
    &--selected { background: var(--panel); box-shadow: inset 0 -1px 0 var(--gilt); }
  }
  &__thumb { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
  &__thumb--empty { background: var(--field-bg); border: 1px solid var(--panel-edge); }
  &__name { font-family: var(--font-display); color: var(--ink); }
  &__years { font-family: var(--font-body); font-style: italic; color: var(--ink-soft); font-size: 14px; }
  &__empty { padding: 16px; color: var(--ink-soft); font-style: italic; text-align: center; }
  &__count { margin: 6px 0 0; font-size: 12px; color: var(--ink-soft); text-align: center; }
}
</style>
