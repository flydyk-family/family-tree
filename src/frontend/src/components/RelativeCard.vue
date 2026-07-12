<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Locale } from '../constants/locales';
import { formatPersonName } from '../format/personName';
import { formatYearSpan } from '../format/lifespan';
import { resolveMediaUrl } from '../media/mediaUrl';
import type { PersonSummary } from '../types/family';

/** A single relative's portrait card, used in the family drawer's parents/spouse/children/siblings groups. */
const props = defineProps<{ person: PersonSummary }>();
const emit = defineEmits<{ select: [id: string] }>();

const { locale } = useI18n({ useScope: 'global' });

const name = computed(() => formatPersonName(props.person.givenName, props.person.surname, locale.value as Locale));
const years = computed(() => formatYearSpan(props.person.birthYear, props.person.deathYear));
const thumbUrl = computed(() => {
  const source = props.person.portraitThumb ?? props.person.portrait;
  return source ? resolveMediaUrl(source) : null;
});
const initial = computed(() => name.value.charAt(0).toUpperCase());
</script>

<template>
  <button
    type="button"
    class="relative-card"
    data-test="relative-chip"
    @click="emit('select', person.id)"
  >
    <img v-if="thumbUrl" class="relative-card__thumb" :src="thumbUrl" alt="" />
    <span v-else class="relative-card__thumb relative-card__thumb--empty" aria-hidden="true">{{ initial }}</span>
    <span class="relative-card__name">{{ name }}</span>
    <span class="relative-card__years">{{ years }}</span>
  </button>
</template>

<style scoped lang="scss">
.relative-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  min-width: 84px; min-height: 44px; padding: 10px 8px;
  background: var(--stat-card-bg); border: 1px solid var(--gilt); border-radius: 12px; cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.relative-card__thumb {
  width: 48px; height: 56px; border-radius: 50% / 42%; object-fit: cover; border: 1px solid var(--gilt);
}
.relative-card__thumb--empty {
  display: flex; align-items: center; justify-content: center;
  background: var(--field-bg); color: var(--ink-soft); font-family: var(--font-display); font-size: 18px;
}
.relative-card__name { font-family: var(--font-display); color: var(--ink); font-size: 13px; text-align: center; }
.relative-card__years { font-size: 11px; font-style: italic; color: var(--ink-soft); text-align: center; }
</style>
