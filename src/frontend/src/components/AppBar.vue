<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFamilyStore } from '../stores/familyStore';
import TabNav from './TabNav.vue';
import SearchField from './SearchField.vue';
import LanguagePicker from './LanguagePicker.vue';
import OrientationToggle from './OrientationToggle.vue';

const { t } = useI18n({ useScope: 'global' });
const family = useFamilyStore();
const menuOpen = ref(false);
const searchOpen = ref(false);

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
    <!-- Desktop row (hidden below $bp-rail) -->
    <div class="app-bar__row app-bar__row--desktop">
      <TabNav />
      <span class="app-bar__spacer" />
      <SearchField />
      <LanguagePicker />
      <OrientationToggle />
    </div>

    <!-- Mobile header row (shown below $bp-rail; always in DOM for tests) -->
    <div class="app-bar__mobile">
      <button
        type="button"
        class="app-bar__icon"
        data-test="nav-menu"
        :aria-label="t('nav.menu')"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >☰</button>
      <span class="app-bar__brand"><b>{{ t('brand.titleLead') }}</b> {{ t('brand.titleRest') }}</span>
      <button
        type="button"
        class="app-bar__icon"
        data-test="nav-search"
        :aria-label="t('search.label')"
        @click="searchOpen = !searchOpen"
      >⌕</button>
    </div>

    <!-- Inline search row revealed by ⌕ -->
    <div v-if="searchOpen" class="app-bar__searchrow">
      <SearchField />
    </div>

    <!-- Dropdown sheet revealed by ☰ -->
    <div v-if="menuOpen" class="app-bar__sheet" data-test="nav-sheet">
      <div class="app-bar__group">
        <span class="app-bar__label">{{ t('nav.views') }}</span>
        <TabNav />
      </div>
      <div class="app-bar__group">
        <span class="app-bar__label">{{ t('nav.language') }}</span>
        <LanguagePicker />
      </div>
      <div class="app-bar__group">
        <span class="app-bar__label">{{ t('nav.layout') }}</span>
        <OrientationToggle />
      </div>
    </div>

    <h1 class="app-bar__title"><b>{{ t('brand.titleLead') }}</b> {{ t('brand.titleRest') }}</h1>
    <p class="app-bar__subtitle" data-test="app-bar-subtitle">{{ subtitle }}</p>
  </header>
</template>

<style scoped lang="scss">
@use '../styles/tokens.scss' as t;

.app-bar {
  position: relative; z-index: 20; padding: 4px 8px 6px; color: var(--ink);
}
.app-bar__row {
  display: flex; align-items: center; gap: 10px;
}
.app-bar__spacer { flex: 1 1 auto; }
.app-bar__title {
  margin: 2px 0 0; text-align: center; font-family: var(--font-display);
  font-weight: 500; letter-spacing: 3px; font-size: 49px; color: var(--ink);
  text-shadow: 0 1px 0 #fff7e2;
  b { font-weight: 600; color: var(--ink); }
}
.app-bar__subtitle {
  margin: 3px 0 4px; text-align: center; font-family: var(--font-body);
  font-style: italic; letter-spacing: 1px; font-size: 21px; color: var(--ink-soft);
}

// Mobile header pieces — hidden on desktop, shown below $bp-rail
.app-bar__mobile { display: none; align-items: center; gap: 8px; }
.app-bar__searchrow { display: none; padding: 6px 0 2px; }
.app-bar__sheet { display: none; flex-direction: column; gap: 10px; padding: 10px; margin-top: 6px; background: linear-gradient(#f8f2df, #f1e7cb); border: 1px solid var(--gilt-deep); border-radius: 10px; }

.app-bar__icon {
  width: 30px; height: 30px; border: 1px solid var(--gilt); border-radius: 6px;
  background: var(--paper); color: var(--ink); font-size: 15px;
  display: grid; place-items: center; cursor: pointer;
  &:hover { background: var(--parchment-2); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.app-bar__brand {
  flex: 1 1 auto; text-align: center; font-family: var(--font-display);
  letter-spacing: 1.5px; font-size: 20px;
}
.app-bar__group { display: flex; flex-direction: column; gap: 4px; }
.app-bar__label {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gilt-deep);
}

@media (max-width: t.$bp-rail - 0.02px) {
  .app-bar__row--desktop, .app-bar__title, .app-bar__subtitle { display: none; }
  .app-bar__mobile { display: flex; }
  .app-bar__searchrow { display: block; }
  .app-bar__sheet { display: flex; }
}
</style>
