<script setup lang="ts">
/** Slim rule with a central fleuron, set between a name and its lifespan line. */
</script>

<template>
  <svg
    class="ornament-divider"
    data-test="ornament-divider"
    viewBox="0 0 200 20"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <path d="M0 10 L86 10" stroke="var(--gilt)" stroke-width="1" stroke-linecap="round" />
    <path d="M114 10 L200 10" stroke="var(--gilt)" stroke-width="1" stroke-linecap="round" />

    <!-- central fleuron -->
    <path d="M88 6 L92 4 L88 10 L92 16 L88 14 Z" fill="var(--gilt)" opacity="0.8" />
    <path d="M112 6 L108 4 L112 10 L108 16 L112 14 Z" fill="var(--gilt)" opacity="0.8" />
    <path
      d="M100 3 L106 10 L100 17 L94 10 Z"
      fill="var(--gilt-light)"
      stroke="var(--gilt-deep)"
      stroke-width="1"
      stroke-linejoin="round"
    />
    <circle cx="100" cy="10" r="1.4" fill="var(--gilt-deep)" />
  </svg>
</template>

<style scoped lang="scss">
.ornament-divider {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
