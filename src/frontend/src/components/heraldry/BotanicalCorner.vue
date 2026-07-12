<script setup lang="ts">
/** Leafy branch spray anchoring a bottom corner; asymmetric, meant to bleed off the edge. */
</script>

<template>
  <svg
    class="botanical-corner"
    data-test="botanical-corner"
    viewBox="0 0 120 120"
    preserveAspectRatio="xMidYMax slice"
    aria-hidden="true"
  >
    <!-- main stem, rising from the corner -->
    <path
      d="M4 118 C 20 92 28 62 54 32 C 66 18 82 8 102 3"
      fill="none"
      stroke="var(--gilt)"
      stroke-width="1.4"
      stroke-linecap="round"
    />

    <!-- fern leaflets, alternating along the stem and tapering toward the tip -->
    <g transform="translate(16,100) rotate(-35)">
      <path d="M0 0 C -6 -4 -9 -12 -5 -19 C -1 -12 2 -4 0 0 Z" fill="var(--leaf)" />
      <path d="M0 0 L-3 -14" stroke="var(--leaf-deep)" stroke-width="0.6" />
    </g>
    <g transform="translate(28,80) rotate(25)">
      <path d="M0 0 C 6 -4 9 -11 5 -17 C 1 -11 -2 -4 0 0 Z" fill="var(--leaf-deep)" />
      <path d="M0 0 L3 -13" stroke="var(--leaf)" stroke-width="0.6" />
    </g>
    <g transform="translate(40,62) rotate(-25)">
      <path d="M0 0 C -5 -4 -8 -10 -4 -15 C -1 -10 2 -4 0 0 Z" fill="var(--leaf)" />
      <path d="M0 0 L-2 -11" stroke="var(--leaf-deep)" stroke-width="0.5" />
    </g>
    <g transform="translate(58,44) rotate(30)">
      <path d="M0 0 C 5 -3 7 -9 3 -13 C 1 -9 -1 -3 0 0 Z" fill="var(--leaf-deep)" />
      <path d="M0 0 L2 -10" stroke="var(--leaf)" stroke-width="0.5" />
    </g>
    <g transform="translate(76,26) rotate(-20)">
      <path d="M0 0 C -4 -3 -6 -7 -3 -11 C -1 -7 1 -3 0 0 Z" fill="var(--leaf)" />
    </g>
    <g transform="translate(94,12) rotate(18)">
      <path d="M0 0 C 4 -2 5 -6 2 -9 C 0.5 -6 -1 -2 0 0 Z" fill="var(--leaf-deep)" />
    </g>
  </svg>
</template>

<style scoped lang="scss">
.botanical-corner {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
