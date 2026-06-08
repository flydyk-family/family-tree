<script setup lang="ts">
import TabNav from './TabNav.vue';
import SearchField from './SearchField.vue';
import LanguagePicker from './LanguagePicker.vue';
import OrientationToggle from './OrientationToggle.vue';
</script>

<template>
  <header class="app-bar" data-test="app-bar">
    <div class="app-bar__row">
      <TabNav />
      <span class="app-bar__spacer" />
      <SearchField />
      <LanguagePicker />
      <OrientationToggle />
    </div>
    <h1 class="app-bar__title"><b>Family</b> Chronicle</h1>
  </header>
</template>

<style scoped lang="scss">
.app-bar {
  position: relative; z-index: 20; padding: 4px 8px 6px; color: var(--ink);
  &__row { display: flex; align-items: center; gap: 10px; }
  &__spacer { flex: 1 1 auto; }
  &__title {
    margin: 2px 0 4px; text-align: center; font-family: var(--font-display);
    font-weight: 500; letter-spacing: 4px; font-size: 28px; color: var(--ink);
    b { font-weight: 700; color: var(--leaf-deep); }
  }
}
@media (max-width: 640px) {
  .app-bar__title { font-size: 20px; letter-spacing: 2px; }
  .app-bar__row { flex-wrap: wrap; }
}
</style>
