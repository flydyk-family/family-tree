<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFamilyStore } from '../stores/familyStore';
import { useMediaQuery, MOBILE_MEDIA_QUERY, NARROW_DESKTOP_MEDIA_QUERY } from '../composables/useMediaQuery';
import TabNav from './TabNav.vue';
import CrestMark from './heraldry/CrestMark.vue';
import SearchField from './SearchField.vue';
import SettingsMenu from './SettingsMenu.vue';
import SettingsPanel from './SettingsPanel.vue';
import SignInControl from './SignInControl.vue';

const { t } = useI18n({ useScope: 'global' });
const family = useFamilyStore();
const menuOpen = ref(false);
const searchOpen = ref(false);

const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
const isNarrowDesktop = useMediaQuery(NARROW_DESKTOP_MEDIA_QUERY);
const deskSearchOpen = ref(false);

// Captured once (Date isn't reactive); the subtitle's "present" year is fixed for
// the page session — fine, and avoids a `new Date()` on every subtitle re-compute.
const thisYear = new Date().getFullYear();

// SignInControl renders nothing when GIS has no client id (typical local dev).
// Gate the labelled mobile-sheet group on the same condition so an empty "Sign in"
// row doesn't appear in the sheet while the desktop account slot sits blank.
const signInConfigured = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '') !== '';

function closeAll() {
  menuOpen.value = false;
  searchOpen.value = false;
}

// Lineage subtitle: "{label} · {earliest birth} — {current year}", mirroring the
// chronicle masthead. Falls back to the bare label until the graph has loaded.
const subtitle = computed(() => {
  const years = family.people.map(p => p.birthYear).filter((y): y is number => y != null);
  if (years.length === 0) return t('brand.lineage');
  return `${t('brand.lineage')} · ${Math.min(...years)} — ${thisYear}`;
});
</script>

<template>
  <header class="app-bar" data-test="app-bar" @keydown.esc="closeAll">
    <!-- Desktop row — only mounted on desktop -->
    <template v-if="!isMobile">
      <div class="app-bar__row app-bar__row--desktop">
        <div class="app-bar__nav">
          <CrestMark v-if="!isNarrowDesktop" class="app-bar__crest" :size="38" />
          <TabNav />
        </div>
        <div class="app-bar__masthead">
          <h1 class="app-bar__title"><b>{{ t('brand.titleLead') }}</b> {{ t('brand.titleRest') }}</h1>
          <p class="app-bar__subtitle" data-test="app-bar-subtitle">{{ subtitle }}</p>
        </div>
        <div class="app-bar__controls">
          <button
            v-if="isNarrowDesktop"
            type="button"
            class="app-bar__icon"
            data-test="desktop-search-toggle"
            :aria-label="t('search.label')"
            :aria-expanded="deskSearchOpen"
            @click="deskSearchOpen = !deskSearchOpen"
          ><svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6" /><line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" stroke-width="1.6" /></svg></button>
          <SearchField v-else />
          <SettingsMenu />
          <span class="app-bar__signin" data-test="sign-in-control-slot"><SignInControl /></span>
        </div>
      </div>
      <div v-if="isNarrowDesktop && deskSearchOpen" class="app-bar__searchrow" data-test="desktop-searchrow">
        <SearchField />
      </div>
    </template>

    <!-- Mobile group — only mounted on mobile -->
    <template v-if="isMobile">
      <div class="app-bar__mobilewrap">
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
          ><svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6" /><line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" stroke-width="1.6" /></svg></button>
          <span
            v-if="signInConfigured"
            class="app-bar__account"
            data-test="mobile-account"
          ><SignInControl compact /></span>
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
            <span class="app-bar__label">{{ t('settings.label') }}</span>
            <SettingsPanel />
          </div>
        </div>
      </div>
    </template>

  </header>
</template>

<style scoped lang="scss">
@use '../styles/tokens.scss' as t;

.app-bar {
  position: relative; z-index: 20; padding: 4px 8px 8px; color: var(--ink);
  // Carved divider between the page header (nav / masthead / search / sign-in)
  // and the page content. The Film theme overrides this with its own dark band
  // + edge (see themes/eighties.scss); this base rule gives the Classic theme
  // the same clear header/content separation.
  border-bottom: 1px solid var(--gilt);
  box-shadow: 0 2px 8px var(--shadow, rgba(0, 0, 0, 0.12));
}
.app-bar__row--desktop {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
}
.app-bar__nav { justify-self: start; display: flex; align-items: center; gap: 10px; }
.app-bar__crest { flex-shrink: 0; }
.app-bar__masthead { justify-self: center; text-align: center; }
.app-bar__controls {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 10px;
}
.app-bar__signin { flex: 0 0 auto; display: inline-flex; }

// Compacted masthead — single-tier band; sizes tuned against both themes/locales.
.app-bar__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 500;
  letter-spacing: 2px;
  font-size: 30px;
  line-height: 1.1;
  color: var(--ink);
  text-shadow: 0 1px 0 var(--title-shadow);
  b { font-weight: 600; color: var(--ink); }
}
.app-bar__subtitle {
  margin: 1px 0 0;
  font-family: var(--font-body);
  font-style: italic;
  letter-spacing: 0.5px;
  font-size: 20px;
  color: var(--ink-soft);
}

// Mobile header pieces
.app-bar__mobilewrap { display: contents; }
.app-bar__mobile { display: flex; align-items: center; gap: 8px; position: relative; z-index: 22; }
// Account control pinned to the top-right of the mobile bar. Its menu (signed in)
// is right-aligned to this slot at the screen edge, so it opens leftward on-screen
// rather than off the left edge as it did inside the ☰ sheet.
.app-bar__account { flex: 0 0 auto; display: inline-flex; align-items: center; }
.app-bar__searchrow { padding: 6px 0 2px; }
// The search pill is inline-flex with a min-width, so it would sit at half the
// row; stretch it across the whole mobile search row instead.
.app-bar__searchrow :deep(.search) { display: flex; width: 100%; min-width: 0; }
// Absolute dropdown (not in flow) with a capped height + internal scroll, so a
// short landscape viewport can still reach the lower groups instead of the sheet
// overflowing the clipped app shell. The height budget leaves room for the frame
// inset + app bar above (~60px) plus a bottom margin, so the last group is always
// scrollable fully into view rather than clipped a few px below the viewport.
.app-bar__sheet {
  display: flex; flex-direction: column; gap: 10px; padding: 10px;
  background: var(--surface-card); border: 1px solid var(--gilt-deep);
  border-radius: 10px;
  position: absolute; top: calc(100% + 4px); left: 8px; right: 8px; z-index: 21;
  max-height: calc(100dvh - 88px); overflow-y: auto;
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

// Fix 6 — nav tabs wrap on narrow screens
.app-bar__sheet :deep(.tabnav) { flex-wrap: wrap; }
.app-bar__sheet :deep(.tabnav__tab) { flex: 1 1 auto; border-radius: 7px; }
</style>
