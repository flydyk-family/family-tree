<script setup lang="ts">
import { onMounted } from 'vue';
import AppBar from './components/AppBar.vue';
import AppFrame from './components/AppFrame.vue';
import { useUiStore } from './stores/uiStore';

const ui = useUiStore();
onMounted(() => ui.init());
</script>

<template>
  <AppFrame>
    <div class="app-shell">
      <AppBar />
      <div class="app-shell__body"><router-view /></div>
    </div>
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
