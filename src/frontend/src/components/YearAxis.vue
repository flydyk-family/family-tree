<script setup lang="ts">
import { computed } from 'vue';
import { axisTicks, type TimeScale } from '../layout/timeScale';

const props = withDefaults(defineProps<{ scale: TimeScale; step?: number }>(), { step: 25 });

const ticks = computed(() => axisTicks(props.scale, props.step));
</script>

<template>
  <svg class="year-axis" :height="scale.height" width="64" :viewBox="`0 0 64 ${scale.height}`">
    <line x1="58" y1="0" x2="58" :y2="scale.height" class="year-axis__spine" />
    <g v-for="tick in ticks" :key="tick.year" :transform="`translate(0, ${tick.y})`">
      <line x1="52" x2="58" y1="0" y2="0" class="year-axis__tick" />
      <text x="46" y="4" text-anchor="end" data-test="tick-label" class="year-axis__label">
        {{ tick.label }}
      </text>
    </g>
  </svg>
</template>

<style scoped lang="scss">
.year-axis {
  &__spine,
  &__tick {
    stroke: var(--ink-soft);
    stroke-width: 1;
  }
  &__label {
    fill: var(--ink-soft);
    font-size: 11px;
    font-family: Georgia, serif;
  }
}
</style>
