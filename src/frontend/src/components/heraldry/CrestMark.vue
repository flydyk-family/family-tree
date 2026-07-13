<script setup lang="ts">
/** Compact header achievement: a crowned shield with an oak charge, flanked by
 *  acanthus scrollwork — a heraldic brand mark for the masthead. */
withDefaults(defineProps<{ size?: number }>(), { size: 44 });
</script>

<template>
  <svg
    class="crest-mark"
    data-test="crest-mark"
    viewBox="0 0 48 44"
    :width="size"
    :height="size"
    aria-hidden="true"
  >
    <!-- flanking acanthus scrollwork / mantling -->
    <path d="M17 18 C 9 16 4 20 3 27 C 8 25 10 28 8 33 C 14 31 16 25 15 20"
      fill="var(--gilt-light)" fill-opacity="0.35" stroke="var(--gilt)" stroke-width="0.8" stroke-linejoin="round" />
    <path d="M31 18 C 39 16 44 20 45 27 C 40 25 38 28 40 33 C 34 31 32 25 33 20"
      fill="var(--gilt-light)" fill-opacity="0.35" stroke="var(--gilt)" stroke-width="0.8" stroke-linejoin="round" />

    <!-- coronet -->
    <path d="M16 12 L17 5 L20.5 10 L24 3 L27.5 10 L31 5 L32 12 Z"
      fill="var(--gilt-light)" stroke="var(--gilt-deep)" stroke-width="0.9" stroke-linejoin="round" />
    <circle cx="17" cy="5" r="1" fill="var(--gilt-deep)" />
    <circle cx="24" cy="3" r="1.2" fill="var(--gilt-deep)" />
    <circle cx="31" cy="5" r="1" fill="var(--gilt-deep)" />
    <path d="M15 12 L33 12" fill="none" stroke="var(--gilt-deep)" stroke-width="1" stroke-linecap="round" />

    <!-- shield -->
    <path d="M13 15 L35 15 L35 25 C35 33 29.5 38 24 41 C18.5 38 13 33 13 25 Z"
      fill="var(--gilt-light)" fill-opacity="0.3" stroke="var(--gilt)" stroke-width="1.5" stroke-linejoin="round" />
    <!-- chief division line -->
    <path d="M13.5 21 L34.5 21" fill="none" stroke="var(--gilt)" stroke-width="0.9" />

    <!-- oak charge -->
    <path d="M24 34 L24 26" fill="none" stroke="var(--ink-soft)" stroke-width="1.1" stroke-linecap="round" />
    <circle cx="24" cy="27.5" r="4.6" fill="var(--leaf)" />
    <circle cx="19.8" cy="30" r="2.7" fill="var(--leaf-deep)" />
    <circle cx="28.2" cy="30" r="2.7" fill="var(--leaf-deep)" />
    <circle cx="24" cy="24.6" r="2.4" fill="var(--leaf-deep)" />
  </svg>
</template>

<style scoped lang="scss">
.crest-mark {
  display: block;
  pointer-events: none;
}
</style>
