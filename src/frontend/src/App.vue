<script setup lang="ts">
import { onMounted, watch } from 'vue';
import AppBar from './components/AppBar.vue';
import AppFrame from './components/AppFrame.vue';
import AppVersion from './components/AppVersion.vue';
import { useUiStore } from './stores/uiStore';
import { useAuthStore } from './stores/authStore';
import { applyThemeToRoot } from './styles/applyTheme';

const ui = useUiStore();
const auth = useAuthStore();
onMounted(() => {
  ui.init();
  // Fire-and-forget; fetchMe is error-tolerant and never rejects.
  void auth.fetchMe();
});
watch(() => ui.theme, applyThemeToRoot, { immediate: true });
</script>

<template>
  <AppFrame>
    <div class="app-shell">
      <AppBar />
      <div class="app-shell__body"><router-view /></div>
    </div>
    <AppVersion />
  </AppFrame>
</template>

<style scoped lang="scss">
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
.app-shell__body {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
