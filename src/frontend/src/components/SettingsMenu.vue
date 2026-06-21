<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import SettingsPanel from './SettingsPanel.vue';

const { t } = useI18n({ useScope: 'global' });
const open = ref(false);

function toggle(): void {
  open.value = !open.value;
}

// Close when focus leaves the menu entirely (tab-away / click-away),
// mirroring LanguagePicker's dismissal pattern.
function onFocusOut(event: FocusEvent): void {
  const root = event.currentTarget as HTMLElement;
  if (!root.contains(event.relatedTarget as Node | null)) {
    open.value = false;
  }
}
</script>

<template>
  <div
    class="settings-menu"
    data-test="settings-menu"
    @keydown.esc.stop="open = false"
    @focusout="onFocusOut"
  >
    <button
      type="button"
      class="settings-menu__trigger"
      :aria-label="t('settings.label')"
      :aria-expanded="open"
      aria-haspopup="menu"
      aria-controls="settings-menu-panel"
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
      id="settings-menu-panel"
      class="settings-menu__panel"
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
  padding: 12px;
  background: var(--panel);
  border: 1px solid var(--panel-edge);
  border-radius: 10px;
  box-shadow: 0 6px 18px var(--shadow);
}
</style>
