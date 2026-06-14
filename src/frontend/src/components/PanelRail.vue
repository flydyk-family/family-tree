<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { usePanelStore } from '../stores/panelStore';
import { useLocaleStore } from '../stores/localeStore';
import { useMediaQuery, MOBILE_MEDIA_QUERY } from '../composables/useMediaQuery';
import { useDockMorph } from '../composables/useDockMorph';
import { formatPersonName } from '../format/personName';
import ChronicleScroll from './ChronicleScroll.vue';
import DockPanel from './DockPanel.vue';
import PersonDetail from './PersonDetail.vue';
import StatsPanel from './StatsPanel.vue';
import type { PersonSummary } from '../types/family';

const props = defineProps<{ people: PersonSummary[] }>();
const { t } = useI18n({ useScope: 'global' });
const panel = usePanelStore();
const localeStore = useLocaleStore();
const { personPanels, statsMinimized, railMode, expandedId, biggerViewId } = storeToRefs(panel);

const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
const dockMorph = useDockMorph();

// Localized name + initial per person, memoized so a locale switch re-localizes
// once per person instead of on every incidental re-render of the rail.
const panelNames = computed(() => {
  const locale = localeStore.currentLocale;
  return new Map(props.people.map(p => {
    const name = formatPersonName(p.givenName, p.surname, locale);
    return [p.id, { name, initial: name.charAt(0).toUpperCase() }];
  }));
});

// Per-person DockPanel state. On desktop chips never appear; on mobile a
// panel renders as a chip when railMode === 'chips'.
function personState(minimized: boolean): 'expanded' | 'minimized' | 'chip' {
  if (isMobile.value && railMode.value === 'chips') return 'chip';
  return minimized ? 'minimized' : 'expanded';
}

// Stats section state: chip in mobile chips mode, otherwise expanded/minimized.
const statsState = computed<'expanded' | 'minimized' | 'chip'>(() =>
  (isMobile.value && railMode.value === 'chips') ? 'chip' : (statsMinimized.value ? 'minimized' : 'expanded'));

// On desktop, hide the panel for whoever is currently popped out as a modal.
const visiblePanels = computed(() =>
  personPanels.value.filter(p => p.id !== biggerViewId.value));

// Desktop (and mobile rectangles) get the scrolling vine rail; mobile chips do not.
const scrollWrap = computed(() => !isMobile.value || railMode.value === 'rectangles');

// On desktop, default stats to expanded (the store starts minimized so mobile
// stays collapsed; desktop expands on mount).
onMounted(() => {
  if (!isMobile.value) {
    panel.setStatsMinimized(false);
  }
});
</script>

<template>
  <aside class="rail" :class="{ 'rail--mobile': isMobile, 'rail--chips': isMobile && railMode === 'chips' }" data-test="panel-rail">

    <!-- Stats always first in DOM (pinned section / chip in mobile chips mode). -->
    <div class="rail__pinned">
      <StatsPanel :people="people" :state="statsState" />
    </div>

    <!-- Mobile arrow toggle, sits between stats and the person stack. -->
    <button
      v-if="isMobile"
      type="button"
      class="rail__arrow"
      data-test="rail-arrow"
      :aria-label="railMode === 'chips' ? t('panel.expandPanels') : t('panel.collapseToChips')"
      @click="railMode === 'chips' ? panel.expandRail() : panel.collapseRail()"
    >{{ railMode === 'chips' ? '←' : '→' }}</button>

    <!-- Person panels stack: a scrolling vine rail on desktop/rectangles, a plain
         column in mobile chips mode. -->
    <component :is="scrollWrap ? ChronicleScroll : 'div'" :class="scrollWrap ? 'rail__scroll' : 'rail__stack'">
      <DockPanel
        v-for="p in visiblePanels"
        :key="p.id"
        icon="👤"
        :flip-id="`dock-card-${p.id}`"
        :title="panelNames.get(p.id)?.name ?? p.id"
        :chip-glyph="panelNames.get(p.id)?.initial ?? ''"
        :state="personState(p.minimized)"
        :biggerable="!isMobile"
        @expand="panel.expandPerson(p.id)"
        @minimize="panel.minimizePerson(p.id)"
        @close="panel.closePerson(p.id)"
        @bigger="dockMorph.undock(p.id)"
        @chip-tap="panel.openPerson(p.id)"
      >
        <PersonDetail v-if="expandedId === p.id" />
      </DockPanel>
    </component>
  </aside>
</template>

<style scoped lang="scss">
@use '../styles/tokens.scss' as t;

.rail {
  position: absolute; top: 12px; right: 12px; bottom: 12px; z-index: 6;
  width: var(--rail-width);
  display: flex; flex-direction: column; gap: 10px;
  pointer-events: none;
}
.rail__pinned { flex: 0 0 auto; pointer-events: auto; }
.rail__arrow { display: none; pointer-events: auto; }
.rail__stack { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.rail__stack > * { pointer-events: auto; }

// Scrolling vine rail (ChronicleScroll wrapper). Its root fills the rail; the
// viewport holds the panel column. Keep the rail click-through except on the
// panels and the scrollbar thumb/gutter.
.rail__scroll { flex: 1 1 auto; min-height: 0; pointer-events: none; }
.rail__scroll :deep(.cs__view) { pointer-events: none; }
.rail__scroll :deep(.cs__content) { display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
.rail__scroll :deep(.cs__content) > * { pointer-events: auto; }
// The full-height vine gutter is decoration — let clicks fall through to the tree;
// only the draggable thumb stays interactive.
.rail__scroll :deep(.cs__thumb) { pointer-events: auto; }
.rail__scroll :deep(.cs__gutter) { pointer-events: none; }

@media (max-width: t.$bp-rail - 0.02px), (max-height: t.$bp-rail-short - 0.02px) {
  .rail {
    top: 8px; right: 8px; left: 8px; bottom: 8px; width: auto;
    align-items: stretch;
  }
  // chips mode: hug the right edge as a vertical column
  .rail--chips { left: auto; align-items: flex-end; }
  .rail--chips .rail__stack { align-items: flex-end; }
  // rectangles mode: stats stays capped at the desktop rail width, right-aligned
  .rail:not(.rail--chips) .rail__pinned { width: min(100%, var(--rail-width)); margin-left: auto; }
  // person panels (inside the vine scroll viewport): a minimized panel keeps the
  // compact width and hugs the right edge; a maximized panel fills the full width.
  // Both states hug the right edge so width animates from the right: maximize
  // opens right→left, minimize closes left→right.
  .rail:not(.rail--chips) .rail__scroll :deep(.dock-panel--min) { width: min(100%, var(--rail-width)); align-self: flex-end; }
  .rail:not(.rail--chips) .rail__scroll :deep(.dock-panel--exp) { width: 100%; align-self: flex-end; }

  .rail__arrow {
    display: grid; place-items: center; align-self: flex-end;
    width: 30px; height: 24px; border-radius: 7px; border: 1px solid var(--leaf-deep);
    background: var(--leaf-deep); color: var(--on-accent); font-size: 16px; cursor: pointer;
  }
}
</style>
