<script setup lang="ts">
import { onMounted } from 'vue';

const version = __APP_VERSION__;
const commit = __APP_COMMIT__;

onMounted(() => {
  if (!document.head.querySelector('meta[name="app-version"]')) {
    const meta = document.createElement('meta');
    meta.name = 'app-version';
    meta.content = `${version}+${commit}`;
    document.head.appendChild(meta);
  }
});
</script>

<template>
  <span class="app-version" :title="`${version} (${commit})`" aria-hidden="true">v{{ version }}</span>
</template>

<style scoped lang="scss">
.app-version {
  position: fixed;
  right: 0.4rem;
  bottom: 0.3rem;
  z-index: 1000;
  font-size: 10px;
  line-height: 1;
  color: var(--color-ink, #4a3f33);
  opacity: 0.25;
  // Intentionally non-interactive; the :title tooltip is unreachable by design.
  pointer-events: none;
  user-select: none;
}
</style>
