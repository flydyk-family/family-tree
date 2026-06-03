<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import LanguagePicker from './LanguagePicker.vue';

const { t } = useI18n({ useScope: 'global' });
</script>

<template>
  <header class="app-bar" data-test="app-bar">
    <span class="app-bar__brand">{{ t('app.title') }}</span>
    <div class="app-bar__actions">
      <!-- future: search field, directory link -->
      <LanguagePicker />
    </div>
  </header>
</template>

<style scoped lang="scss">
.app-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 16px;
  background: rgba(220, 207, 174, 0.92);
  border-bottom: 1px solid rgba(95, 82, 64, 0.25);
  font-family: Georgia, serif;
  color: var(--ink);

  &__brand {
    font-size: 15px;
    letter-spacing: 0.3px;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}
</style>
