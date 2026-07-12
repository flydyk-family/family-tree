<script setup lang="ts">
/** Larger dossier ornament: a shield flanked by laurel branches, topped by a coronet. */
withDefaults(defineProps<{ size?: number }>(), { size: 120 });
</script>

<template>
  <svg
    class="coat-of-arms"
    data-test="coat-of-arms"
    viewBox="0 0 100 120"
    :width="size"
    :height="size * 1.2"
    aria-hidden="true"
  >
    <!-- coronet -->
    <path
      d="M40 20 L42 8 L47 15 L50 3 L53 15 L58 8 L60 20 Z"
      fill="var(--gilt-light)"
      stroke="var(--gilt-deep)"
      stroke-width="1"
      stroke-linejoin="round"
    />
    <circle cx="42" cy="8" r="1.5" fill="var(--gilt-deep)" />
    <circle cx="50" cy="3" r="1.7" fill="var(--gilt-deep)" />
    <circle cx="58" cy="8" r="1.5" fill="var(--gilt-deep)" />
    <path d="M39 20 L61 20" stroke="var(--gilt-deep)" stroke-width="1.2" stroke-linecap="round" />

    <!-- shield -->
    <path
      d="M35 22 L65 22 L65 40 C65 55 58 68 50 76 C42 68 35 55 35 40 Z"
      fill="var(--gilt-light)"
      fill-opacity="0.25"
      stroke="var(--gilt)"
      stroke-width="1.6"
      stroke-linejoin="round"
    />

    <!-- chevron + motif charge -->
    <path
      d="M41 60 L50 49 L59 60"
      fill="none"
      stroke="var(--gilt-deep)"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle cx="50" cy="67" r="3.2" fill="var(--gilt-light)" stroke="var(--gilt-deep)" stroke-width="1" />

    <!-- left laurel branch -->
    <g>
      <path d="M20 112 C 14 92 18 66 31 44" fill="none" stroke="var(--gilt)" stroke-width="1.2" stroke-linecap="round" />
      <path d="M20 104 c-6 -1 -9 -6 -8 -11 c5 1 8 6 8 11 Z" fill="var(--leaf)" />
      <path d="M18 90 c-6 0 -10 -5 -10 -10 c5 0 9 5 10 10 Z" fill="var(--leaf-deep)" />
      <path d="M21 76 c-6 1 -11 -3 -12 -8 c6 -1 11 3 12 8 Z" fill="var(--leaf)" />
      <path d="M25 62 c-5 1 -10 -2 -11 -7 c5 -1 10 2 11 7 Z" fill="var(--leaf-deep)" />
      <path d="M31 48 c-4 2 -9 0 -11 -4 c5 -2 9 0 11 4 Z" fill="var(--leaf)" />
    </g>

    <!-- right laurel branch (mirror) -->
    <g>
      <path d="M80 112 C 86 92 82 66 69 44" fill="none" stroke="var(--gilt)" stroke-width="1.2" stroke-linecap="round" />
      <path d="M80 104 c6 -1 9 -6 8 -11 c-5 1 -8 6 -8 11 Z" fill="var(--leaf)" />
      <path d="M82 90 c6 0 10 -5 10 -10 c-5 0 -9 5 -10 10 Z" fill="var(--leaf-deep)" />
      <path d="M79 76 c6 1 11 -3 12 -8 c-6 -1 -11 3 -12 8 Z" fill="var(--leaf)" />
      <path d="M75 62 c5 1 10 -2 11 -7 c-5 -1 -10 2 -11 7 Z" fill="var(--leaf-deep)" />
      <path d="M69 48 c4 2 9 0 11 -4 c-5 -2 -9 0 -11 4 Z" fill="var(--leaf)" />
    </g>
  </svg>
</template>

<style scoped lang="scss">
.coat-of-arms {
  display: block;
  pointer-events: none;
}
</style>
