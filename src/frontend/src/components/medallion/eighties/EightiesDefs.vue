<script setup lang="ts"></script>

<template>
  <!-- shared '80s film defs: grain, drop-shadow, selection glow. Sprocket holes
       are per-card (height varies by role) so they live in FilmFrame. -->
  <filter id="film-grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
    <feColorMatrix type="saturate" values="0" />
    <feComponentTransfer><feFuncA type="linear" slope="0.5" /></feComponentTransfer>
  </filter>
  <filter id="film-shadow" x="-40%" y="-40%" width="180%" height="180%">
    <feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#000" flood-opacity="0.5" />
  </filter>
  <filter id="film-glow" x="-40%" y="-40%" width="180%" height="180%">
    <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#e6e8ea" flood-opacity="0.9" />
  </filter>
</template>
