<script setup lang="ts">
import { computed } from 'vue';
import { viewportTicks, horizontalTicks, type TimeScale } from '../layout/timeScale';
import type { Viewport } from '../interactions/panZoom';
import type { Orientation } from '../stores/uiStore';

const props = defineProps<{ scale: TimeScale; viewport: Viewport; orientation: Orientation }>();

type Tier = 'minor' | 'decade' | 'century';
interface RailTick { year: number; pos: number; label: string; tier: Tier }

// Minimum on-screen gap between adjacent ticks before the axis steps to a finer
// year interval. Horizontal labels sit side-by-side, so they need room for the
// whole ~4-digit year (~38px at the rail font size) — otherwise, right after a
// step-down (10→5, 5→2, 2→1) the labels overlap until the zoom grows further.
// Vertical labels stack, so they only need their line height.
const H_MIN_SPACING = 56;
const V_MIN_SPACING = 24;

// Decade marks (every 10th year) read stronger than the 1/2/5-year in-betweens;
// centuries strongest of all.
function tierFor(year: number): Tier {
  if (year % 100 === 0) return 'century';
  if (year % 10 === 0) return 'decade';
  return 'minor';
}

const ticks = computed<RailTick[]>(() => {
  const raw = props.orientation === 'horizontal'
    ? horizontalTicks(props.scale, props.viewport.x, props.viewport.k, H_MIN_SPACING).map(t => ({ year: t.year, pos: t.x, label: t.label }))
    : viewportTicks(props.scale, props.viewport.y, props.viewport.k, V_MIN_SPACING).map(t => ({ year: t.year, pos: t.y, label: t.label }));
  return raw.map(t => ({ ...t, tier: tierFor(t.year) }));
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
      :class="`time-rail__tick--${tick.tier}`"
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

  // tick marks: short & faint for in-between years, longer & darker every decade,
  // longest with a gilt accent every century.
  &--vertical &__tick {
    right: 0; width: 100%; display: flex; align-items: center; justify-content: flex-end;
    gap: 5px; transform: translateY(-50%);
    &::after { content: ''; width: 5px; border-top: 1px solid rgba(111, 90, 60, 0.4); }
    &--decade::after { width: 10px; border-top: 1.5px solid var(--bark); }
    &--century::after { width: 14px; border-top: 2px solid var(--gilt-deep); }
  }

  &--horizontal &__tick {
    bottom: 0; height: 100%; display: flex; align-items: flex-end; justify-content: center;
    transform: translateX(-50%); flex-direction: column-reverse;
    &::after { content: ''; height: 5px; border-left: 1px solid rgba(111, 90, 60, 0.4); }
    &--decade::after { height: 10px; border-left: 1.5px solid var(--bark); }
    &--century::after { height: 14px; border-left: 2px solid var(--gilt-deep); }
  }

  &__label {
    font-size: 15.5px; font-weight: 400; color: var(--ink); padding: 0 3px;
    background: linear-gradient(var(--panel), #f2e9cf);
  }
  // decade & century numerals stand out without dimming the in-between years
  &__tick--decade &__label { font-weight: 600; }
  &__tick--century &__label { font-weight: 600; font-size: 17px; }
}
</style>
