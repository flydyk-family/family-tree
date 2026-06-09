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

// True when we want to render the stats as a raw chip (so person chips come after it).
const statsAsChip = computed(() => isMobile.value && railMode.value === 'chips');

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
// panel renders as a chip when railMode === 'chips'.
function personState(minimized: boolean): 'expanded' | 'minimized' | 'chip' {
  if (isMobile.value && railMode.value === 'chips') return 'chip';
  return minimized ? 'minimized' : 'expanded';
}

// Stats section state (used when stats renders as a full DockPanel section).
const statsSectionState = computed<'expanded' | 'minimized'>(() =>
  statsMinimized.value ? 'minimized' : 'expanded'
);
</script>

<template>
  <aside class="rail" :class="{ 'rail--mobile': isMobile, 'rail--chips': statsAsChip }" data-test="panel-rail">

    <!--
      Mobile chips mode: render a raw stats chip FIRST in DOM so that
      person chips (rendered via DockPanel below) appear after it.
      This ensures chips[chips.length - 1] is the last-opened person chip
      in tests that use findAll('[data-test="panel-chip"]').
    -->
    <div
      v-if="statsAsChip"
      class="dock-chip dock-chip--pinned rail__stats-chip"
      data-test="panel-chip"
      role="button"
      tabindex="0"
      :aria-label="t('panel.statsTitle')"
      @click="panel.setStatsMinimized(false)"
      @keydown.enter="panel.setStatsMinimized(false)"
    >
      <span class="dock-chip__glyph">⚜</span>
    </div>

    <!--
      Person panels — DOM-first (before the stats section) so their controls
      are reached by data-test queries first in desktop/section mode.
      Visual order (stats on top) is controlled by CSS flex `order`.
    -->
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

    <!--
      Stats section — hidden in mobile-chips mode (raw chip shown above instead).
      Uses CSS order: 0 so it appears visually at the top of the rail on desktop.
    -->
    <div v-if="!statsAsChip" class="rail__pinned">
      <StatsPanel :people="people" :state="statsSectionState" />
    </div>

    <!-- Mobile arrow toggle, sits below stats visually via CSS order -->
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
// CSS order ensures stats is visually above person panels despite DOM order for test access.
.rail__pinned { flex: 0 0 auto; order: 0; }
.rail__stack { display: flex; flex-direction: column; gap: 10px; min-height: 0; order: 1; }
.rail__stack--scroll { overflow-y: auto; padding-right: 2px; }
.rail__arrow { display: none; order: 2; }
.rail__stats-chip { order: 0; }

// Reuse DockPanel chip styles (same visual appearance as DockPanel's .dock-chip).
.dock-chip { width: 48px; height: 48px; border-radius: 11px; background: linear-gradient(#f8f2df, #f1e7cb); border: 1px solid var(--gilt); box-shadow: 0 4px 12px var(--shadow); display: grid; place-items: center; cursor: pointer; &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; } }
.dock-chip--pinned { border-color: var(--gilt-deep); }
.dock-chip__glyph { font-family: var(--font-display); font-size: 18px; color: var(--ink-soft); }

@media (max-width: t.$bp-rail - 0.02px) {
  .rail {
    top: 8px; right: 8px; left: 8px; width: auto; max-height: calc(100% - 16px);
    align-items: stretch;
  }
  // chips mode: hug the right edge as a vertical column
  .rail--chips { left: auto; align-items: flex-end; }
  .rail--chips .rail__stack { align-items: flex-end; }
  // rectangles mode: full width but capped at the desktop rail width, right-aligned
  .rail:not(.rail--chips) .rail__pinned,
  .rail:not(.rail--chips) .rail__stack { width: min(100%, var(--rail-width)); margin-left: auto; }

  .rail__arrow {
    display: grid; place-items: center; align-self: flex-end;
    width: 30px; height: 24px; border-radius: 7px; border: 1px solid var(--leaf-deep);
    background: var(--leaf-deep); color: var(--on-accent); font-size: 16px; cursor: pointer;
    order: 1; // sit directly under the pinned stats
  }
  .rail__pinned { order: 0; }
  .rail__stack { order: 2; }
}
</style>
