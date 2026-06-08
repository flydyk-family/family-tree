<script setup lang="ts"></script>

<template>
  <div class="app-frame" data-test="app-frame">
    <div class="app-frame__border" aria-hidden="true"></div>
    <svg class="app-frame__corner app-frame__corner--tl" viewBox="0 0 46 46" aria-hidden="true"><path d="M3 43 C 26 43 43 26 43 3" fill="none" stroke="var(--gilt-light)" stroke-width="2.4"/><circle cx="12" cy="12" r="3" fill="#c8543e"/><path d="M18 8 q7 2 5 9 q-8 -1 -5 -9Z" fill="var(--leaf)"/></svg>
    <svg class="app-frame__corner app-frame__corner--tr" viewBox="0 0 46 46" aria-hidden="true"><path d="M3 43 C 26 43 43 26 43 3" fill="none" stroke="var(--gilt-light)" stroke-width="2.4"/><circle cx="12" cy="12" r="3" fill="#c8543e"/><path d="M18 8 q7 2 5 9 q-8 -1 -5 -9Z" fill="var(--leaf)"/></svg>
    <svg class="app-frame__corner app-frame__corner--bl" viewBox="0 0 46 46" aria-hidden="true"><path d="M3 43 C 26 43 43 26 43 3" fill="none" stroke="var(--gilt-light)" stroke-width="2.4"/><circle cx="12" cy="12" r="3" fill="#c8543e"/><path d="M18 8 q7 2 5 9 q-8 -1 -5 -9Z" fill="var(--leaf)"/></svg>
    <svg class="app-frame__corner app-frame__corner--br" viewBox="0 0 46 46" aria-hidden="true"><path d="M3 43 C 26 43 43 26 43 3" fill="none" stroke="var(--gilt-light)" stroke-width="2.4"/><circle cx="12" cy="12" r="3" fill="#c8543e"/><path d="M18 8 q7 2 5 9 q-8 -1 -5 -9Z" fill="var(--leaf)"/></svg>
    <div class="app-frame__inner"><slot /></div>
  </div>
</template>

<style scoped lang="scss">
.app-frame {
  position: relative; height: 100%; width: 100%;
  &__border {
    position: absolute; inset: 6px; border-radius: 9px; pointer-events: none; z-index: 40;
    box-shadow:
      inset 0 0 0 2px var(--gilt-deep),
      inset 0 0 0 9px var(--leaf-deep),
      inset 0 0 0 11px var(--gilt),
      inset 0 0 0 12px rgba(71, 55, 25, 0.45);
  }
  &__corner { position: absolute; width: 40px; height: 40px; z-index: 41; pointer-events: none; }
  &__corner--tl { left: 6px; top: 6px; }
  &__corner--tr { right: 6px; top: 6px; transform: scaleX(-1); }
  &__corner--bl { left: 6px; bottom: 6px; transform: scaleY(-1); }
  &__corner--br { right: 6px; bottom: 6px; transform: scale(-1, -1); }
  &__inner { position: absolute; inset: 14px; display: flex; flex-direction: column; }
}
@media (max-width: 640px) {
  .app-frame__border { inset: 3px; }
  .app-frame__inner { inset: 8px; }
}
</style>
