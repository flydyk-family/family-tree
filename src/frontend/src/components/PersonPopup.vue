<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePanelStore } from '../stores/panelStore';
import { useDockMorph } from '../composables/useDockMorph';
import PersonDetail from './PersonDetail.vue';

const { t } = useI18n({ useScope: 'global' });
const panel = usePanelStore();
const dockMorph = useDockMorph();
const dialogRef = ref<HTMLElement | null>(null);

// Dock: return the person to the rail (non-destructive default), morphing the
// glass card into its rail slot. The dock tab, the scrim, and Esc all use this.
function onDock(): void {
  void dockMorph.dock();
}

// Close entirely: remove the person from the rail too (no morph target).
function onClose(): void {
  if (panel.biggerViewId !== null) {
    panel.closePerson(panel.biggerViewId);
  }
}

onMounted(() => dialogRef.value?.focus());
</script>

<template>
  <div class="popup" data-test="person-popup">
    <div class="popup__scrim" data-test="scrim" @click="onDock" />
    <div class="popup__shell">
      <section
        ref="dialogRef"
        class="popup__dialog"
        data-test="dialog"
        :data-flip-id="`dock-card-${panel.biggerViewId}`"
        role="dialog"
        aria-modal="true"
        :aria-label="t('panel.biggerView')"
        tabindex="-1"
        @keydown.esc.prevent="onDock"
      >
        <button type="button" class="popup__btn popup__close" data-test="close" :aria-label="t('person.close')" @click="onClose">✕</button>
        <PersonDetail />
      </section>
      <button
        type="button"
        class="popup__dock-tab"
        data-test="popup-dock"
        :aria-label="t('panel.dock')"
        :title="t('panel.dock')"
        @click="onDock"
      ><span class="popup__dock-arrow" aria-hidden="true">→</span></button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.popup { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; }
.popup__scrim { position: absolute; inset: 0; background: var(--scrim); }
.popup__shell { position: relative; z-index: 1; }
.popup__dialog {
  position: relative; width: min(560px, calc(100vw - 32px)); max-height: min(82vh, 720px);
  overflow-y: auto; padding: 22px 24px; background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: 14px; box-shadow: var(--glass-shadow); backdrop-filter: blur(12px); color: var(--ink);
  @supports not ((backdrop-filter: blur(12px)) or (-webkit-backdrop-filter: blur(12px))) { background: var(--parchment-2); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
.popup__btn { position: absolute; top: 10px; width: 28px; height: 28px; border: none; border-radius: 50%; background: transparent; color: var(--ink-soft); font-size: 20px; cursor: pointer; z-index: 2; &:hover { background: rgba(95, 82, 64, 0.12); } &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; } }
.popup__close { right: 12px; }

// Dock tab on the right edge: gilt parchment (echoes a rail card, signalling
// the destination); the arrow points at the rail and nudges right on hover.
.popup__dock-tab {
  position: absolute; top: 50%; right: -22px; transform: translateY(-50%);
  width: 24px; height: 78px; display: grid; place-items: center; z-index: 1;
  border: 1px solid var(--gilt); border-left: none; border-radius: 0 12px 12px 0;
  background: linear-gradient(#f8f2df, #f1e7cb); color: var(--ink-soft);
  font-size: 18px; cursor: pointer;
  transition: background var(--motion-feedback-ms) ease;
  &:hover { border-color: var(--gilt-deep); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
.popup__dock-arrow { display: block; transition: transform var(--motion-feedback-ms) ease; }
.popup__dock-tab:hover .popup__dock-arrow { transform: translateX(3px); }
</style>
