<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePanelStore } from '../stores/panelStore';
import DockPanel from './DockPanel.vue';
import type { PersonSummary } from '../types/family';

const props = withDefaults(defineProps<{ people: PersonSummary[]; state?: 'expanded' | 'minimized' | 'chip' }>(), { state: 'expanded' });
const { t } = useI18n({ useScope: 'global' });
const panel = usePanelStore();

const birthYears = computed(() => props.people.map(p => p.birthYear).filter((y): y is number => y != null));
const stats = computed(() => [
  { key: 'members', label: t('stats.members'), value: props.people.length },
  { key: 'earliest', label: t('stats.earliest'), value: birthYears.value.length ? Math.min(...birthYears.value) : '—' },
  { key: 'withPortraits', label: t('stats.withPortraits'), value: props.people.filter(p => p.portrait).length },
  { key: 'living', label: t('stats.living'), value: props.people.filter(p => p.deathYear == null).length }
]);
</script>

<template>
  <DockPanel
    :icon="'⚜'"
    :title="t('panel.statsTitle')"
    :state="state"
    chip-glyph="⚜"
    :closable="false"
    :pinned="true"
    data-test="stats-panel"
    @expand="panel.setStatsMinimized(false)"
    @minimize="panel.setStatsMinimized(true)"
    @chip-tap="panel.setStatsMinimized(false)"
  >
    <div v-for="s in stats" :key="s.key" class="stats__row" :data-test="`stat-${s.key}`">
      <span class="stats__label">{{ s.label }}</span>
      <span class="stats__value">{{ s.value }}</span>
    </div>
  </DockPanel>
</template>

<style scoped lang="scss">
.stats__row { display: flex; justify-content: space-between; align-items: baseline; padding: 9px 2px; border-bottom: 1px dashed rgba(111, 90, 60, 0.22); &:last-child { border-bottom: none; } }
.stats__label { font-family: var(--font-body); font-size: 18px; color: var(--ink); }
.stats__value { font-family: var(--font-display); font-weight: 600; font-size: 21px; color: var(--umber); }
</style>
