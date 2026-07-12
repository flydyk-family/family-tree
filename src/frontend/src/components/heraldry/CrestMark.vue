<script setup lang="ts">
/** Compact header emblem: a shield bearing an oak tree, topped by a coronet. */
withDefaults(defineProps<{ size?: number }>(), { size: 40 });
</script>

<template>
  <svg
    class="crest-mark"
    data-test="crest-mark"
    viewBox="0 0 40 40"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <!-- coronet -->
    <path
      d="M12 9 L13 3 L16 7.5 L20 1.5 L24 7.5 L27 3 L28 9 Z"
      fill="var(--gilt-light)"
      stroke="var(--gilt-deep)"
      stroke-width="0.9"
      stroke-linejoin="round"
    />
    <circle cx="13" cy="3" r="1" fill="var(--gilt-deep)" />
    <circle cx="20" cy="1.5" r="1.1" fill="var(--gilt-deep)" />
    <circle cx="27" cy="3" r="1" fill="var(--gilt-deep)" />
    <path d="M11 9 L29 9" fill="none" stroke="var(--gilt-deep)" stroke-width="1" stroke-linecap="round" />

    <!-- shield -->
    <path
      d="M8 12 L32 12 L32 23 C32 31 26 36 20 39 C14 36 8 31 8 23 Z"
      fill="var(--gilt-light)"
      fill-opacity="0.28"
      stroke="var(--gilt)"
      stroke-width="1.4"
      stroke-linejoin="round"
    />

    <!-- oak charge -->
    <path d="M20 31 L20 20" fill="none" stroke="var(--ink-soft)" stroke-width="1.1" stroke-linecap="round" />
    <circle cx="20" cy="17" r="5.4" fill="var(--leaf)" />
    <circle cx="15.2" cy="20.2" r="3.1" fill="var(--leaf-deep)" />
    <circle cx="24.8" cy="20.2" r="3.1" fill="var(--leaf-deep)" />

    <!-- base laurel sprigs -->
    <path d="M9 37 q-4 -1 -5 -5 q4 0 5 3 Z" fill="var(--leaf)" />
    <path d="M31 37 q4 -1 5 -5 q-4 0 -5 3 Z" fill="var(--leaf)" />
  </svg>
</template>

<style scoped lang="scss">
.crest-mark {
  display: block;
  pointer-events: none;
}
</style>
