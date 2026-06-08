<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocaleStore } from '../stores/localeStore';
import type { Locale } from '../constants/locales';

const store = useLocaleStore();
const { t } = useI18n({ useScope: 'global' });
const open = ref(false);

function toggle(): void {
  open.value = !open.value;
}

function choose(locale: Locale): void {
  store.setLocale(locale);
  open.value = false;
}

// Close when focus leaves the picker entirely (tab-away / click-away).
function onFocusOut(event: FocusEvent): void {
  const root = event.currentTarget as HTMLElement;
  if (!root.contains(event.relatedTarget as Node | null)) {
    open.value = false;
  }
}
</script>

<template>
  <div
    class="lang-picker"
    data-test="language-picker"
    @keydown.esc.stop="open = false"
    @focusout="onFocusOut"
  >
    <button
      type="button"
      class="lang-picker__current"
      :aria-label="t('picker.label')"
      :aria-expanded="open"
      aria-haspopup="menu"
      aria-controls="lang-picker-menu"
      data-test="language-picker-toggle"
      @click="toggle"
    >
      <span :class="store.currentOption.flagClass" class="lang-picker__flag" aria-hidden="true"></span>
      <span class="lang-picker__name">{{ store.currentOption.nativeName }}</span>
    </button>

    <ul v-if="open" id="lang-picker-menu" class="lang-picker__menu" role="menu">
      <li v-for="option in store.options" :key="option.code" role="none">
        <button
          type="button"
          role="menuitemradio"
          :aria-checked="option.code === store.currentLocale"
          class="lang-picker__option"
          data-test="language-option"
          @click="choose(option.code)"
        >
          <span :class="option.flagClass" class="lang-picker__flag" aria-hidden="true"></span>
          <span class="lang-picker__name">{{ option.nativeName }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.lang-picker {
  position: relative;
  font-family: var(--font-display);

  &__current,
  &__option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    color: var(--ink);
    font: inherit;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--gilt);
      outline-offset: 2px;
    }
  }

  &__current {
    background: #fffdf5;
    border: 1px solid var(--panel-edge);
    border-radius: 8px;
    font-family: var(--font-display);
    font-size: 12.5px;
  }

  &__menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 10;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--panel);
    border: 1px solid var(--panel-edge);
    border-radius: 6px;
    box-shadow: 0 6px 18px var(--shadow);

    li { margin: 2px 0; }
  }

  &__option {
    border: none;
    background: transparent;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: 12.5px;
    &:hover { background: var(--control-hover); }
  }

  &__flag {
    width: 1.2em;
    line-height: 1em;
    border-radius: 2px;
  }
}
</style>
