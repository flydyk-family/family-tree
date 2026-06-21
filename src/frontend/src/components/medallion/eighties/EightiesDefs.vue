<script setup lang="ts"></script>

<template>
  <!-- shared '80s film defs. The grain turbulence renders ONCE into a small tiled
       pattern (film-grain-tex) rather than a per-card filter, so it does not
       multiply GPU filter surfaces as the tree zooms (each card just fills with
       the shared tile). Drop-shadows are drawn as static rects per card; only the
       selected card uses the glow filter, so at most one filtered card exists. -->
  <filter id="film-grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
    <feColorMatrix type="saturate" values="0" />
    <feComponentTransfer><feFuncA type="linear" slope="0.5" /></feComponentTransfer>
  </filter>
  <pattern id="film-grain-tex" patternUnits="userSpaceOnUse" width="140" height="140">
    <rect width="140" height="140" filter="url(#film-grain)" />
  </pattern>
  <filter id="film-glow" x="-40%" y="-40%" width="180%" height="180%">
    <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#e6e8ea" flood-opacity="0.9" />
  </filter>
  <!-- edge-fading backing behind medallion names: a translucent dark band that
       fades to nothing at both ends, so names stay legible over the bright metal
       backdrop without a hard chip. objectBoundingBox → scales to each name band. -->
  <linearGradient id="e80-name-fade" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#0a0b0d" stop-opacity="0" />
    <stop offset="0.22" stop-color="#0a0b0d" stop-opacity="0.5" />
    <stop offset="0.78" stop-color="#0a0b0d" stop-opacity="0.5" />
    <stop offset="1" stop-color="#0a0b0d" stop-opacity="0" />
  </linearGradient>
</template>
