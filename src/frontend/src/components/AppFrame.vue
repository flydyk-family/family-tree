<script setup lang="ts"></script>

<template>
  <div class="app-frame" data-test="app-frame">
    <div class="app-frame__border" aria-hidden="true"></div>
    <svg class="app-frame__corner app-frame__corner--tl" viewBox="0 0 34 34" aria-hidden="true"><path d="M2 30 C 18 30 30 18 30 2" fill="none" stroke="var(--bark)" stroke-width="2"/><circle cx="9" cy="9" r="2.4" fill="#c8543e"/><path d="M14 6 q6 2 4 8 q-7 -1 -4 -8Z" fill="var(--leaf)"/></svg>
    <svg class="app-frame__corner app-frame__corner--tr" viewBox="0 0 34 34" aria-hidden="true"><path d="M2 30 C 18 30 30 18 30 2" fill="none" stroke="var(--bark)" stroke-width="2"/><circle cx="9" cy="9" r="2.4" fill="#c8543e"/></svg>
    <svg class="app-frame__corner app-frame__corner--bl" viewBox="0 0 34 34" aria-hidden="true"><path d="M2 30 C 18 30 30 18 30 2" fill="none" stroke="var(--bark)" stroke-width="2"/><circle cx="9" cy="9" r="2.4" fill="#c8543e"/></svg>
    <svg class="app-frame__corner app-frame__corner--br" viewBox="0 0 34 34" aria-hidden="true"><path d="M2 30 C 18 30 30 18 30 2" fill="none" stroke="var(--bark)" stroke-width="2"/><circle cx="9" cy="9" r="2.4" fill="#c8543e"/></svg>
    <div class="app-frame__inner"><slot /></div>
  </div>
</template>

<style scoped lang="scss">
.app-frame {
  position: relative; height: 100%; width: 100%;
  // slim ornamental frame: a 2px bark rule with a fine inner companion line
  &__border {
    position: absolute; inset: 8px; border: 2px solid var(--bark); border-radius: 8px;
    pointer-events: none; z-index: 40;
    &::after {
      content: ''; position: absolute; inset: 3px;
      border: 1px solid rgba(111, 90, 60, 0.45); border-radius: 5px;
    }
  }
  &__corner { position: absolute; width: 34px; height: 34px; z-index: 41; pointer-events: none; }
  &__corner--tl { left: 4px; top: 4px; }
  &__corner--tr { right: 4px; top: 4px; transform: scaleX(-1); }
  &__corner--bl { left: 4px; bottom: 4px; transform: scaleY(-1); }
  &__corner--br { right: 4px; bottom: 4px; transform: scale(-1, -1); }
  &__inner { position: absolute; inset: 16px; display: flex; flex-direction: column; }
}
@media (max-width: 640px) {
  .app-frame__border { inset: 4px; }
  .app-frame__inner { inset: 10px; }
}
</style>
