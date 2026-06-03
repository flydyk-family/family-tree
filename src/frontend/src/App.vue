<script setup lang="ts">
import AppBar from './components/AppBar.vue';
</script>

<template>
  <div class="app-shell">
    <AppBar />
    <div class="app-shell__body">
      <router-view />
    </div>
  </div>
</template>

<style scoped lang="scss">
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.app-shell__body {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
