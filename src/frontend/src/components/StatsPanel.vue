<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PersonSummary } from '../types/family';

const props = defineProps<{ people: PersonSummary[] }>();
const { t } = useI18n({ useScope: 'global' });

const birthYears = computed(() => props.people.map(p => p.birthYear).filter((y): y is number => y != null));
const stats = computed(() => [
  { key: 'members', label: t('stats.members'), value: props.people.length },
  { key: 'earliest', label: t('stats.earliest'), value: birthYears.value.length ? Math.min(...birthYears.value) : '—' },
  { key: 'withPortraits', label: t('stats.withPortraits'), value: props.people.filter(p => p.portrait).length },
  // "living" = no death year recorded (unknown death dates are counted as living)
  { key: 'living', label: t('stats.living'), value: props.people.filter(p => p.deathYear == null).length }
]);
</script>

<template>
  <aside class="stats" data-test="stats-panel" :aria-label="t('stats.title')">
    <h3 class="stats__title">{{ t('stats.title') }}</h3>
    <div class="stats__rule" aria-hidden="true" />
    <div v-for="s in stats" :key="s.key" class="stats__row" :data-test="`stat-${s.key}`">
      <span class="stats__label">{{ s.label }}</span>
      <span class="stats__value">{{ s.value }}</span>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.stats {
  background: linear-gradient(#f8f2df, #f1e7cb); border: 1px solid var(--gilt);
  border-radius: 10px; padding: 14px 16px 16px; box-shadow: 0 6px 18px var(--shadow); position: relative;
  &::before { content: ''; position: absolute; inset: 5px; border: 1px solid rgba(183, 145, 63, 0.35); border-radius: 6px; pointer-events: none; }
  &__title { font-family: var(--font-display); font-weight: 600; font-size: 23px; letter-spacing: 1px; text-align: center; margin: 2px 0 4px; }
  &__rule { height: 1px; background: linear-gradient(90deg, transparent, var(--gilt), transparent); margin: 7px 2px 12px; }
  &__row { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 2px; border-bottom: 1px dashed rgba(111, 90, 60, 0.22); &:last-child { border-bottom: none; } }
  &__label { font-family: var(--font-body); font-size: 20px; color: var(--ink); }
  &__value { font-family: var(--font-display); font-weight: 600; font-size: 23px; color: var(--umber); }
}
</style>
