<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFamilyStore } from '../stores/familyStore';
import TabNav from './TabNav.vue';
import SearchField from './SearchField.vue';
import LanguagePicker from './LanguagePicker.vue';
import OrientationToggle from './OrientationToggle.vue';

const { t } = useI18n({ useScope: 'global' });
const family = useFamilyStore();

// Lineage subtitle: "{label} · {earliest birth} — {current year}", mirroring the
// chronicle masthead. Falls back to the bare label until the graph has loaded.
const subtitle = computed(() => {
  const years = family.people.map(p => p.birthYear).filter((y): y is number => y != null);
  if (years.length === 0) return t('brand.lineage');
  return `${t('brand.lineage')} · ${Math.min(...years)} — ${new Date().getFullYear()}`;
});
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
    <h1 class="app-bar__title"><b>{{ t('brand.titleLead') }}</b> {{ t('brand.titleRest') }}</h1>
    <p class="app-bar__subtitle" data-test="app-bar-subtitle">{{ subtitle }}</p>
  </header>
</template>

<style scoped lang="scss">
.app-bar {
  position: relative; z-index: 20; padding: 4px 8px 6px; color: var(--ink);
  &__row { display: flex; align-items: center; gap: 10px; }
  &__spacer { flex: 1 1 auto; }
  &__title {
    margin: 2px 0 0; text-align: center; font-family: var(--font-display);
    font-weight: 500; letter-spacing: 3px; font-size: 36px; color: var(--ink);
    text-shadow: 0 1px 0 #fff7e2;
    b { font-weight: 600; color: var(--ink); }
  }
  &__subtitle {
    margin: 3px 0 4px; text-align: center; font-family: var(--font-body);
    font-style: italic; letter-spacing: 1px; font-size: 15px; color: var(--ink-soft);
  }
}
@media (max-width: 640px) {
  .app-bar__title { font-size: 25px; letter-spacing: 2px; }
  .app-bar__subtitle { font-size: 13.5px; }
  .app-bar__row { flex-wrap: wrap; }
}
</style>
