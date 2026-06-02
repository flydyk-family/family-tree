<script setup lang="ts">
import { computed } from 'vue'
import type { ViewBox } from '@/composables/usePanZoom'
import { computeYearTicks, worldYToScreen } from '@/layout/yearAxis'

const props = defineProps<{
  viewBox: ViewBox
  containerHeight: number
  minBirthYear: number
  maxBirthYear: number
  yTop: number
  yBottom: number
}>()

interface ScreenTick {
  year: number
  y: number
}

const ticks = computed<ScreenTick[]>(() =>
  computeYearTicks(props.minBirthYear, props.maxBirthYear, props.yTop, props.yBottom)
    .map((tick) => ({
      year: tick.year,
      y: worldYToScreen(tick.worldY, props.viewBox.y, props.viewBox.height, props.containerHeight)
    }))
    .filter((tick) => tick.y >= 0 && tick.y <= props.containerHeight)
)
</script>

<template>
  <div class="year-axis" aria-hidden="true">
    <div class="year-axis__caption">Years</div>
    <div
      v-for="tick in ticks"
      :key="tick.year"
      class="year-axis__tick"
      :style="{ top: `${tick.y}px` }"
    >
      <span class="year-axis__label">{{ tick.year }}</span>
      <span class="year-axis__dash" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.year-axis {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: $year-axis-width-mobile;
  border-right: 1px solid rgba(91, 74, 50, 0.25);
  background: linear-gradient(to right, rgba(227, 215, 189, 0.65), rgba(227, 215, 189, 0));
  pointer-events: none;
  overflow: hidden;

  @media (min-width: $breakpoint-tablet) {
    width: $year-axis-width;
  }

  &__caption {
    position: absolute;
    top: 8px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: $ink-soft;
  }

  &__tick {
    position: absolute;
    left: 0;
    right: 4px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    transform: translateY(-50%);
  }

  &__label {
    font-size: 12px;
    color: $bark-brown;
    font-variant-numeric: tabular-nums;
  }

  &__dash {
    width: 8px;
    height: 1px;
    background: $bark-light;
  }
}
</style>
