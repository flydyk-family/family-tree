<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Locale } from '../constants/locales';
import { formatPersonName } from '../format/personName';
import { formatYearSpan } from '../format/lifespan';
import { deriveRelatives } from '../composables/useRelatives';
import type { PersonSummary, Union } from '../types/family';

const props = defineProps<{ personId: string; people: PersonSummary[]; unions: Union[] }>();
const emit = defineEmits<{ select: [id: string] }>();

const { t, locale } = useI18n({ useScope: 'global' });
const relatives = computed(() => deriveRelatives(props.personId, props.people, props.unions));

const groups = computed(() => [
  { key: 'parents', label: t('members.parents'), members: relatives.value.parents },
  { key: 'spouse', label: t('members.spouse'), members: relatives.value.spouses },
  { key: 'siblings', label: t('members.siblings'), members: relatives.value.siblings },
  { key: 'children', label: t('members.children'), members: relatives.value.children }
].filter(g => g.members.length > 0));

function name(person: PersonSummary): string {
  return formatPersonName(person.givenName, person.surname, locale.value as Locale);
}
function years(person: PersonSummary): string {
  return formatYearSpan(person.birthYear, person.deathYear);
}
</script>

<template>
  <section class="family-sheet" data-test="family-sheet" :aria-label="t('members.familyLabel')">
    <div v-for="g in groups" :key="g.key" class="family-sheet__group">
      <h3 class="family-sheet__heading">{{ g.label }}</h3>
      <div class="family-sheet__chips">
        <button
          v-for="m in g.members"
          :key="m.id"
          type="button"
          class="family-sheet__chip"
          data-test="relative-chip"
          @click="emit('select', m.id)"
        >
          <img v-if="m.portraitThumb || m.portrait" class="family-sheet__chip-thumb" :src="(m.portraitThumb || m.portrait) as string" alt="" />
          <span class="family-sheet__chip-name">{{ name(m) }}</span>
          <span class="family-sheet__chip-years">{{ years(m) }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
// Layout leaves room for future add/remove affordances (cut 2) but renders none now.
.family-sheet { display: flex; flex-direction: column; gap: 14px; }
.family-sheet__heading { margin: 0 0 6px; font-family: var(--font-display); font-size: 15px; letter-spacing: 1px; color: var(--ink-soft); text-transform: uppercase; }
.family-sheet__chips { display: flex; flex-wrap: wrap; gap: 8px; }
.family-sheet__chip {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; min-height: 44px;
  background: var(--stat-card-bg); border: 1px solid var(--panel-edge); border-radius: 10px; cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.family-sheet__chip-thumb { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
.family-sheet__chip-name { font-family: var(--font-display); color: var(--ink); }
.family-sheet__chip-years { font-size: 13px; font-style: italic; color: var(--ink-soft); }
</style>
