<script setup lang="ts">
import { computed } from 'vue';
import { viewportTicks, type TimeScale } from '../layout/timeScale';
import type { Viewport } from '../interactions/panZoom';

const props = defineProps<{ scale: TimeScale; viewport: Viewport }>();

// Ticks follow the same vertical pan/zoom transform the oak applies, so a person's
// birth-year node always lines up with its year on the axis. Density adapts to zoom.
const ticks = computed(() => viewportTicks(props.scale, props.viewport.y, props.viewport.k));
</script>

<template>
  <div class="year-axis">
    <div
      v-for="tick in ticks"
      :key="tick.year"
      class="year-axis__tick"
      data-test="tick"
      :style="{ top: `${tick.y}px` }"
    >
      <span class="year-axis__label" data-test="tick-label">{{ tick.label }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.year-axis {
  position: relative;
  height: 100%;
  overflow: hidden;
  font-family: Georgia, serif;
  user-select: none;

  &__tick {
    position: absolute;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    width: 100%;
    // centre the row on the year line; constant on-screen size (never zoom-scaled)
    transform: translateY(-50%);
    white-space: nowrap;

    // short tick mark touching the spine (the axis container's right border)
    &::after {
      content: '';
      width: 6px;
      border-top: 1px solid var(--ink-soft);
    }
  }

  &__label {
    font-size: 12px;
    color: var(--ink-soft);
  }
}
</style>
