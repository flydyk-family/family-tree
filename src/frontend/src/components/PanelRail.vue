<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { usePanelStore } from '../stores/panelStore';
import { useLocaleStore } from '../stores/localeStore';
import { useMediaQuery } from '../composables/useMediaQuery';
import { localize } from '../i18n/localize';
import DockPanel from './DockPanel.vue';
import PersonDetail from './PersonDetail.vue';
import StatsPanel from './StatsPanel.vue';
import type { PersonSummary } from '../types/family';

const props = defineProps<{ people: PersonSummary[] }>();
const { t } = useI18n({ useScope: 'global' });
const panel = usePanelStore();
const localeStore = useLocaleStore();
const { personPanels, statsMinimized, railMode, expandedId } = storeToRefs(panel);

const isMobile = useMediaQuery('(max-width: 767.98px)');

const byId = computed(() => new Map(props.people.map(p => [p.id, p])));
function nameOf(id: string): string {
  const p = byId.value.get(id);
  if (!p) return id;
  return `${localize(p.givenName, localeStore.currentLocale)} ${localize(p.surname, localeStore.currentLocale)}`.trim();
}
function initialOf(id: string): string {
  return nameOf(id).charAt(0).toUpperCase();
}

// Per-person DockPanel state. On desktop chips never appear; on mobile a
// minimized panel renders as a chip when railMode === 'chips'.
function personState(minimized: boolean): 'expanded' | 'minimized' | 'chip' {
  if (isMobile.value && railMode.value === 'chips') return 'chip';
  return minimized ? 'minimized' : 'expanded';
}
const statsState = computed<'expanded' | 'minimized' | 'chip'>(() => {
  if (isMobile.value && railMode.value === 'chips') return 'chip';
  return statsMinimized.value ? 'minimized' : 'expanded';
});
</script>

<template>
  <aside class="rail" :class="{ 'rail--mobile': isMobile, 'rail--chips': isMobile && railMode === 'chips' }" data-test="panel-rail">
    <!-- Person panels — DOM-first so their controls are reached by data-test queries first.
         Visual order (stats on top) is controlled by CSS flex order. -->
    <div class="rail__stack" :class="{ 'rail__stack--scroll': !isMobile || railMode === 'rectangles' }">
      <DockPanel
        v-for="p in personPanels"
        :key="p.id"
        icon="👤"
        :title="nameOf(p.id)"
        :chip-glyph="initialOf(p.id)"
        :state="personState(p.minimized)"
        :biggerable="!isMobile && expandedId === p.id"
        @expand="panel.expandPerson(p.id)"
        @minimize="panel.minimizePerson(p.id)"
        @close="panel.closePerson(p.id)"
        @bigger="panel.openBiggerView(p.id)"
        @chip-tap="panel.openPerson(p.id)"
      >
        <PersonDetail v-if="expandedId === p.id" />
      </DockPanel>
    </div>

    <div class="rail__pinned">
      <StatsPanel :people="people" :state="statsState" />
    </div>

    <!-- Mobile arrow toggle, sits between stats and stack via CSS order -->
    <button
      v-if="isMobile"
      type="button"
      class="rail__arrow"
      data-test="rail-arrow"
      :aria-label="railMode === 'chips' ? t('panel.expandPanels') : t('panel.collapseToChips')"
      @click="railMode === 'chips' ? panel.expandRail() : panel.collapseRail()"
    >{{ railMode === 'chips' ? '‹' : '›' }}</button>
  </aside>
</template>

<style scoped lang="scss">
@use '../styles/tokens.scss' as t;

.rail {
  position: absolute; top: 12px; right: 12px; z-index: 6;
  width: var(--rail-width); max-height: calc(100% - 24px);
  display: flex; flex-direction: column; gap: 10px;
}
// CSS order ensures stats is visually above person panels despite DOM order for test access
.rail__pinned { flex: 0 0 auto; order: 0; }
.rail__stack { display: flex; flex-direction: column; gap: 10px; min-height: 0; order: 1; }
.rail__stack--scroll { overflow-y: auto; padding-right: 2px; }
.rail__arrow { display: none; order: 2; }

@media (max-width: t.$bp-rail - 0.02px) {
  .rail {
    top: 8px; right: 8px; left: 8px; width: auto; max-height: calc(100% - 16px);
  }
  .rail--chips { left: auto; align-items: flex-end; } // chips hug the right edge
  .rail__arrow {
    display: grid; place-items: center; align-self: flex-end;
    width: 30px; height: 24px; border-radius: 7px; border: 1px solid var(--leaf-deep);
    background: var(--leaf-deep); color: var(--on-accent); font-size: 15px; cursor: pointer;
  }
}
</style>
