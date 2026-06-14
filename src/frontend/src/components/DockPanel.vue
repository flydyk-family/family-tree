<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { useI18n } from 'vue-i18n';

type PanelState = 'expanded' | 'minimized' | 'chip';

const props = withDefaults(defineProps<{
  icon: string;
  title: string;
  state: PanelState;
  chipGlyph?: string;
  closable?: boolean;
  biggerable?: boolean;
  pinned?: boolean;
  flipId?: string;
}>(), { closable: true, biggerable: false, pinned: false, chipGlyph: '' });

const emit = defineEmits<{ expand: []; minimize: []; close: []; bigger: []; chipTap: [] }>();

// Disable automatic attr inheritance so that data-test="panel-chip" on the chip
// element is never overwritten by attrs passed from a parent (e.g. StatsPanel
// passes data-test="stats-panel" which should live on the section, not the chip).
defineOptions({ inheritAttrs: false });
const attrs = useAttrs();

const { t } = useI18n({ useScope: 'global' });
const showBody = computed(() => props.state === 'expanded');
const glyph = computed(() => props.chipGlyph || props.icon);
</script>

<template>
  <!-- Chip: data-test="panel-chip" is always hardcoded here; $attrs are NOT applied
       so that a parent's data-test (e.g. "stats-panel") doesn't override it. -->
  <div v-if="state === 'chip'" class="dock-chip" :class="{ 'dock-chip--pinned': pinned }" data-test="panel-chip" :data-flip-id="flipId"
       role="button" tabindex="0" :aria-label="title" @click="emit('chipTap')" @keydown.enter="emit('chipTap')">
    <span class="dock-chip__glyph">{{ glyph }}</span>
  </div>

  <!-- Section: $attrs fall through here, so data-test from parents (e.g. "stats-panel") land on the section. -->
  <section v-else v-bind="attrs" class="dock-panel" :class="{ 'dock-panel--min': state === 'minimized', 'dock-panel--exp': state === 'expanded' }"
           :data-flip-id="flipId"
           role="region" :aria-label="title">
    <header class="dock-panel__bar">
      <span class="dock-panel__icon" aria-hidden="true">{{ icon }}</span>
      <span class="dock-panel__title" data-test="panel-title">{{ title }}</span>
      <span v-if="pinned" class="dock-panel__lock" aria-hidden="true">🔒</span>

      <!-- Fixed slot order: undock (⤡) · expand/minimize toggle · close. The toggle
           swaps glyph/action with state but keeps the same position. -->
      <button v-if="biggerable" type="button" class="dock-panel__btn" data-test="panel-bigger"
              :aria-label="t('panel.biggerView')" @click="emit('bigger')">⤡</button>
      <button v-if="state === 'minimized'" type="button" class="dock-panel__btn" data-test="panel-expand"
              :aria-label="t('panel.expand')" @click="emit('expand')">▢</button>
      <button v-else type="button" class="dock-panel__btn" data-test="panel-minimize"
              :aria-label="t('panel.minimize')" @click="emit('minimize')">–</button>
      <button v-if="closable" type="button" class="dock-panel__btn" data-test="panel-close"
              :aria-label="t('panel.close')" @click="emit('close')">✕</button>
    </header>

    <Transition name="dock-body">
      <div v-if="showBody" class="dock-panel__bodywrap">
        <div class="dock-panel__body"><slot /></div>
      </div>
    </Transition>
  </section>
</template>

<style scoped lang="scss">
.dock-panel { flex: 0 0 auto; background: linear-gradient(#f8f2df, #f1e7cb); border: 1px solid var(--gilt); border-radius: 10px; box-shadow: 0 6px 18px var(--shadow); overflow: hidden; transition: width 150ms cubic-bezier(0.22, 0.61, 0.36, 1); }
.dock-panel--exp { border-color: var(--gilt-deep); }
.dock-panel__bar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: linear-gradient(var(--control-grad-top), var(--control-grad-bottom)); border-bottom: 1px solid rgba(183, 145, 63, 0.45); }
.dock-panel--min .dock-panel__bar { border-bottom: none; }
.dock-panel__icon { width: 22px; height: 22px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 5px; background: var(--paper); border: 1px solid var(--gilt); font-size: 13px; }
.dock-panel__title { flex: 1 1 auto; font-family: var(--font-display); font-weight: 600; font-size: 16px; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dock-panel__lock { font-size: 12px; color: var(--gilt-deep); }
.dock-panel__btn { width: 24px; height: 24px; flex: 0 0 auto; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--ink-soft); font-size: 14px; line-height: 1; cursor: pointer; display: grid; place-items: center; &:hover { background: rgba(95, 82, 64, 0.12); } &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 1px; } }
// Minimize ↔ maximize: the body height animates via a 0fr↔1fr grid row (works
// for unknown content height); the inner body is clipped while it collapses.
.dock-panel__bodywrap { display: grid; grid-template-rows: 1fr; }
// `contain: paint` scopes the reveal's repaint to the panel body so the height
// animation doesn't repaint the whole rail; the content is already clipped here.
.dock-panel__body { overflow: hidden; padding: 12px 14px 14px; contain: paint; }
.dock-body-enter-active, .dock-body-leave-active { transition: grid-template-rows 150ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 110ms ease; will-change: grid-template-rows; }
.dock-body-enter-from, .dock-body-leave-to { grid-template-rows: 0fr; opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .dock-panel { transition: none; }
  .dock-body-enter-active, .dock-body-leave-active { transition: none; }
}

.dock-chip { flex: 0 0 auto; width: 48px; height: 48px; border-radius: 11px; background: linear-gradient(#f8f2df, #f1e7cb); border: 1px solid var(--gilt); box-shadow: 0 4px 12px var(--shadow); display: grid; place-items: center; cursor: pointer; &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; } }
.dock-chip--pinned { border-color: var(--gilt-deep); }
.dock-chip__glyph { font-family: var(--font-display); font-size: 18px; color: var(--ink-soft); }
</style>
