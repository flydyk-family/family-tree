<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFamilyStore } from '../stores/familyStore';
import { useMediaQuery, MOBILE_MEDIA_QUERY } from '../composables/useMediaQuery';
import TabNav from './TabNav.vue';
import SearchField from './SearchField.vue';
import LanguagePicker from './LanguagePicker.vue';
import OrientationToggle from './OrientationToggle.vue';
import ThemeToggle from './ThemeToggle.vue';
import SignInControl from './SignInControl.vue';

const { t } = useI18n({ useScope: 'global' });
const family = useFamilyStore();
const menuOpen = ref(false);
const searchOpen = ref(false);

const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

function closeAll() {
  menuOpen.value = false;
  searchOpen.value = false;
}

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
    <!-- Desktop row — only mounted on desktop -->
    <div v-if="!isMobile" class="app-bar__row app-bar__row--desktop">
      <TabNav />
      <span class="app-bar__spacer" />
      <SearchField />
      <LanguagePicker />
      <OrientationToggle />
      <ThemeToggle />
      <span class="app-bar__signin" data-test="sign-in-control-slot"><SignInControl /></span>
    </div>

    <!-- Mobile group — only mounted on mobile -->
    <template v-if="isMobile">
      <div class="app-bar__mobilewrap" @keydown.esc="closeAll">
        <!-- Mobile header row -->
        <div class="app-bar__mobile">
          <button
            type="button"
            class="app-bar__icon"
            data-test="nav-menu"
            :aria-label="t('nav.menu')"
            :aria-expanded="menuOpen"
            @click="menuOpen = !menuOpen; searchOpen = false"
          >☰</button>
          <span class="app-bar__brand"><b>{{ t('brand.titleLead') }}</b> {{ t('brand.titleRest') }}</span>
          <button
            type="button"
            class="app-bar__icon"
            data-test="nav-search"
            :aria-label="t('search.label')"
            :aria-expanded="searchOpen"
            @click="searchOpen = !searchOpen; menuOpen = false"
          >⌕</button>
        </div>

        <!-- Inline search row revealed by ⌕ -->
        <div v-if="searchOpen" class="app-bar__searchrow">
          <SearchField />
        </div>

        <!-- Click-away backdrop for the sheet -->
        <div v-if="menuOpen" class="app-bar__backdrop" @click="menuOpen = false" />

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
          <div class="app-bar__group">
            <span class="app-bar__label">{{ t('theme.label') }}</span>
            <ThemeToggle />
          </div>
          <div class="app-bar__group">
            <span class="app-bar__label">{{ t('auth.signIn') }}</span>
            <SignInControl />
          </div>
        </div>
      </div>
    </template>

    <!-- Title / subtitle — desktop only -->
    <h1 v-if="!isMobile" class="app-bar__title"><b>{{ t('brand.titleLead') }}</b> {{ t('brand.titleRest') }}</h1>
    <p v-if="!isMobile" class="app-bar__subtitle" data-test="app-bar-subtitle">{{ subtitle }}</p>
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
.app-bar__signin { flex: 0 0 auto; display: inline-flex; }
.app-bar__title {
  margin: 2px 0 0; text-align: center; font-family: var(--font-display);
  font-weight: 500; letter-spacing: 3px; font-size: 49px; color: var(--ink);
  text-shadow: 0 1px 0 var(--title-shadow);
  b { font-weight: 600; color: var(--ink); }
}
.app-bar__subtitle {
  margin: 3px 0 4px; text-align: center; font-family: var(--font-body);
  font-style: italic; letter-spacing: 1px; font-size: 21px; color: var(--ink-soft);
}

// Mobile header pieces
.app-bar__mobilewrap { display: contents; }
.app-bar__mobile { display: flex; align-items: center; gap: 8px; position: relative; z-index: 22; }
.app-bar__searchrow { padding: 6px 0 2px; }
// The search pill is inline-flex with a min-width, so it would sit at half the
// row; stretch it across the whole mobile search row instead.
.app-bar__searchrow :deep(.search) { display: flex; width: 100%; min-width: 0; }
.app-bar__sheet {
  display: flex; flex-direction: column; gap: 10px; padding: 10px; margin-top: 6px;
  background: var(--surface-card); border: 1px solid var(--gilt-deep);
  border-radius: 10px; position: relative; z-index: 21;
}
.app-bar__backdrop {
  position: fixed; inset: 0; z-index: 19;
}

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

// Desktop row — fixed controls never shrink; only the search field is the flex release valve
.app-bar__row--desktop :deep(.tabnav) { flex: 0 0 auto; }
.app-bar__row--desktop :deep(.lang-picker) { flex: 0 0 auto; }
.app-bar__row--desktop :deep(.orient) { flex: 0 0 auto; }
.app-bar__row--desktop :deep(.theme-toggle) { flex: 0 0 auto; }
// With the extra theme toggle, a narrow desktop runs out of room; let the row
// wrap and keep the search field usably wide instead of crushing it to nothing.
.app-bar__row--desktop { flex-wrap: wrap; row-gap: 6px; }
.app-bar__row--desktop :deep(.search) { flex: 1 1 200px; min-width: 150px; }

// Fix 5 — orientation toggle fills the full sheet row
.app-bar__sheet :deep(.orient) { display: flex; width: 100%; }
.app-bar__sheet :deep(.orient__btn) { flex: 1 1 0; justify-content: center; }
.app-bar__sheet :deep(.theme-toggle) { display: flex; width: 100%; }
.app-bar__sheet :deep(.theme-toggle__btn) { flex: 1 1 0; justify-content: center; }

// Fix 6 — nav tabs wrap on narrow screens
.app-bar__sheet :deep(.tabnav) { flex-wrap: wrap; }
.app-bar__sheet :deep(.tabnav__tab) { flex: 1 1 auto; border-radius: 7px; }
</style>
