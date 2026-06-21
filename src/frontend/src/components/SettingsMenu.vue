<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import SettingsPanel from './SettingsPanel.vue';
import { usePopover } from '../composables/usePopover';

const { t } = useI18n({ useScope: 'global' });
const rootEl = ref<HTMLElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const triggerEl = ref<HTMLElement | null>(null);
// Settings is a small popover of preference controls, so it carries dialog
// (not menu) semantics — see usePopover for the dismissal/focus behaviour.
const { open, toggle, closeAndRestoreFocus } = usePopover({ root: rootEl, panel: panelEl, trigger: triggerEl });
</script>

<template>
  <div
    ref="rootEl"
    class="settings-menu"
    data-test="settings-menu"
    @keydown.esc.stop="closeAndRestoreFocus"
  >
    <button
      ref="triggerEl"
      type="button"
      class="settings-menu__trigger"
      :aria-label="t('settings.label')"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :aria-controls="open ? 'settings-menu-panel' : undefined"
      data-test="settings-menu-toggle"
      @click="toggle"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <g stroke="currentColor" stroke-width="1.5" fill="none">
          <line x1="2" y1="4" x2="14" y2="4" />
          <line x1="2" y1="8" x2="14" y2="8" />
          <line x1="2" y1="12" x2="14" y2="12" />
          <circle cx="6" cy="4" r="1.7" fill="var(--paper)" />
          <circle cx="10" cy="8" r="1.7" fill="var(--paper)" />
          <circle cx="5" cy="12" r="1.7" fill="var(--paper)" />
        </g>
      </svg>
    </button>

    <div
      v-if="open"
      ref="panelEl"
      id="settings-menu-panel"
      class="settings-menu__panel"
      role="dialog"
      :aria-label="t('settings.label')"
      tabindex="-1"
      data-test="settings-menu-panel"
    >
      <SettingsPanel />
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings-menu {
  position: relative;
  display: inline-flex;
}
.settings-menu__trigger {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--panel-edge);
  border-radius: 8px;
  background: var(--field-bg);
  color: var(--ink);
  cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.settings-menu__panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  min-width: 220px;
  padding: 12px;
  background: var(--panel);
  border: 1px solid var(--panel-edge);
  border-radius: 10px;
  box-shadow: 0 6px 18px var(--shadow);
  // Focus is moved here programmatically on open (dialog pattern); the container
  // itself doesn't need a visible ring — its children show their own.
  &:focus { outline: none; }
}
</style>
