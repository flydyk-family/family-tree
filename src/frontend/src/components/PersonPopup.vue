<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { usePanelStore } from '../stores/panelStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useDockMorph } from '../composables/useDockMorph';
import PersonHeader from './PersonHeader.vue';
import PersonDossier from './PersonDossier.vue';
import ChronicleScroll from './ChronicleScroll.vue';

const { t } = useI18n({ useScope: 'global' });
const panel = usePanelStore();
const selection = useSelectionStore();
const { detail, loading, error } = storeToRefs(selection);
const dockMorph = useDockMorph();
const dialogRef = ref<HTMLElement | null>(null);

function onDock(): void {
  void dockMorph.dock();
}

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

        <p v-if="loading" class="popup__status">{{ t('person.loading') }}</p>
        <p v-else-if="error" class="popup__status popup__status--error">{{ t('person.error') }}</p>
        <template v-else-if="detail">
          <PersonHeader :detail="detail" class="popup__header" />
          <ChronicleScroll class="popup__body">
            <PersonDossier :detail="detail" />
          </ChronicleScroll>
        </template>
      </section>
      <button
        type="button"
        class="popup__dock-chevron"
        data-test="popup-dock"
        :aria-label="t('panel.dock')"
        :title="t('panel.dock')"
        @click="onDock"
      >
        <span class="popup__dock-body" aria-hidden="true"></span>
        <span class="popup__dock-chev" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.popup { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; }
.popup__scrim { position: absolute; inset: 0; background: var(--scrim); }
.popup__shell { position: relative; z-index: 1; }
.popup__dialog {
  position: relative; display: flex; flex-direction: column;
  width: min(560px, calc(100vw - 32px)); max-height: min(82vh, 720px);
  overflow: hidden; padding: 22px 24px; background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: 14px; box-shadow: var(--glass-shadow); backdrop-filter: blur(12px); color: var(--ink);
  @supports not ((backdrop-filter: blur(12px)) or (-webkit-backdrop-filter: blur(12px))) { background: var(--parchment-2); }
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; }
}
.popup__header { flex: 0 0 auto; padding-bottom: 14px; border-bottom: 1px solid var(--glass-border); }
.popup__body {
  flex: 1 1 auto; min-height: 0; margin-top: 12px;
  --cs-gutter: 16px;
  --pager-page-h: min(42vh, 340px);
}
.popup__status { margin: 8px 0; font-style: italic; &--error { color: #8a3b32; } }
.popup__btn { position: absolute; top: 10px; width: 28px; height: 28px; border: none; border-radius: 50%; background: transparent; color: var(--ink-soft); font-size: 20px; cursor: pointer; z-index: 2; &:hover { background: rgba(95, 82, 64, 0.12); } &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 2px; } }
.popup__close { right: 12px; }

// Floating dock control: a chevron resting just off the dialog's right edge that
// grows a rounded-square glass body on hover/focus and ticks toward the rail.
.popup__dock-chevron {
  position: absolute; top: 50%; right: -30px; transform: translateY(-50%);
  width: 32px; height: 32px; padding: 0; border: none; background: transparent; cursor: pointer; z-index: 1;
  display: grid; place-items: center;
  &:focus-visible { outline: 2px solid var(--leaf-deep); outline-offset: 3px; border-radius: 9px; }
}
.popup__dock-body {
  position: absolute; inset: 0; border-radius: 9px;
  background: var(--glass-bg); border: 1px solid var(--glass-border); backdrop-filter: blur(12px);
  transform: scale(0.4); opacity: 0;
  transition: transform 200ms cubic-bezier(0.2, 0.7, 0.3, 1), opacity 150ms ease;
  @supports not ((backdrop-filter: blur(12px)) or (-webkit-backdrop-filter: blur(12px))) { background: var(--parchment-2); }
}
.popup__dock-chevron:hover .popup__dock-body,
.popup__dock-chevron:focus-visible .popup__dock-body { transform: scale(1); opacity: 1; }
// An HTML span (not the <svg>) carries the tick so a pure-pixel translateX
// animates reliably — a CSS transform with a % on an <svg> (transform-box:
// view-box) silently drops the offset. Grid centres it; z-index keeps it above
// the body.
.popup__dock-chev {
  position: relative; z-index: 1; display: block; width: 16px; height: 16px;
  color: var(--ink-soft); transition: color 200ms ease;
}
.popup__dock-chev svg { display: block; width: 16px; height: 16px; }
.popup__dock-chevron:hover .popup__dock-chev,
.popup__dock-chevron:focus-visible .popup__dock-chev { color: var(--ink); animation: popup-dock-tick 480ms both; }
@keyframes popup-dock-tick {
  0%   { transform: translateX(0); animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1); }
  45%  { transform: translateX(7px); animation-timing-function: linear; }
  62%  { transform: translateX(7px); animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1); }
  100% { transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) {
  .popup__dock-body { transition: none; }
  .popup__dock-chevron:hover .popup__dock-chev,
  .popup__dock-chevron:focus-visible .popup__dock-chev { animation: none; }
}
</style>
