<script setup lang="ts">
import { computed } from 'vue';
import { viewportTicks, horizontalTicks, type TimeScale } from '../layout/timeScale';
import type { Viewport } from '../interactions/panZoom';
import type { Orientation } from '../stores/uiStore';

const props = defineProps<{ scale: TimeScale; viewport: Viewport; orientation: Orientation }>();

interface RailTick { year: number; pos: number; label: string; major: boolean }

const ticks = computed<RailTick[]>(() => {
  if (props.orientation === 'horizontal') {
    return horizontalTicks(props.scale, props.viewport.x, props.viewport.k).map(t => ({
      year: t.year, pos: t.x, label: t.label, major: t.year % 100 === 0
    }));
  }
  return viewportTicks(props.scale, props.viewport.y, props.viewport.k).map(t => ({
    year: t.year, pos: t.y, label: t.label, major: t.year % 100 === 0
  }));
});

function tickStyle(pos: number): Record<string, string> {
  return props.orientation === 'horizontal' ? { left: `${pos}px` } : { top: `${pos}px` };
}
</script>

<template>
  <div class="time-rail" :class="`time-rail--${orientation}`" data-test="time-rail">
    <div
      v-for="tick in ticks"
      :key="tick.year"
      class="time-rail__tick"
      :class="{ 'time-rail__tick--major': tick.major }"
      data-test="tick"
      :style="tickStyle(tick.pos)"
    >
      <span class="time-rail__label" data-test="tick-label">{{ tick.label }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.time-rail {
  position: relative;
  overflow: hidden;
  user-select: none;
  font-family: var(--font-body);
  background: linear-gradient(var(--panel), #f2e9cf);

  &--vertical { height: 100%; border-right: 1px solid var(--panel-edge); }
  &--horizontal { width: 100%; border-top: 1px solid var(--panel-edge); }

  &__tick { position: absolute; white-space: nowrap; }

  &--vertical &__tick {
    right: 0; width: 100%; display: flex; align-items: center; justify-content: flex-end;
    gap: 5px; transform: translateY(-50%);
    &::after { content: ''; width: 6px; border-top: 1px solid rgba(111, 90, 60, 0.5); }
    &--major::after { border-top-color: var(--ink-soft); }
  }

  &--horizontal &__tick {
    bottom: 0; height: 100%; display: flex; align-items: flex-end; justify-content: center;
    transform: translateX(-50%); flex-direction: column-reverse;
    &::after { content: ''; height: 6px; border-left: 1px solid rgba(111, 90, 60, 0.5); }
    &--major::after { border-left-color: var(--ink-soft); }
  }

  &__label {
    font-size: 12px; color: var(--ink-soft); padding: 0 2px;
    background: linear-gradient(var(--panel), #f2e9cf);
  }
}
</style>
