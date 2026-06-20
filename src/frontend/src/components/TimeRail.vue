<script setup lang="ts">
import { computed } from 'vue';
import { viewportTicks, horizontalTicks, type TimeScale } from '../layout/timeScale';
import type { Viewport } from '../interactions/panZoom';
import type { Orientation } from '../stores/uiStore';
import { sprocketPitch, sprocketOffset } from './railFilmStrip';

const props = defineProps<{
  scale: TimeScale;
  viewport: Viewport;
  orientation: Orientation;
  theme?: 'classic' | 'eighties';
  panning?: boolean;
}>();

const film = computed(() => props.theme === 'eighties');
const pitch = computed(() => sprocketPitch(props.scale.pxPerYear, props.viewport.k));
const offset = computed(() =>
  sprocketOffset(props.orientation === 'vertical' ? props.viewport.y : props.viewport.x, pitch.value)
);
const perfStyle = computed(() =>
  props.orientation === 'vertical'
    ? { backgroundSize: `15px ${pitch.value}px`, backgroundPositionY: `${offset.value}px` }
    : { backgroundSize: `${pitch.value}px 15px`, backgroundPositionX: `${offset.value}px` }
);
// frame-line dividers track the timeline like the sprockets — spaced a few perfs
// apart (4× the pitch, so they scale with zoom) and scrolling with pan — so they
// stay in register with the perforations instead of drifting.
const frameStyle = computed(() => {
  const size = pitch.value * 4;
  const along = props.orientation === 'vertical' ? props.viewport.y : props.viewport.x;
  const off = sprocketOffset(along, size);
  return props.orientation === 'vertical'
    ? { backgroundSize: `100% ${size}px`, backgroundPositionY: `${off}px` }
    : { backgroundSize: `${size}px 100%`, backgroundPositionX: `${off}px` };
});

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
  <div class="time-rail" :class="[`time-rail--${orientation}`, { 'time-rail--film': film, 'time-rail--panning': panning }]" data-test="time-rail">
    <template v-if="film">
      <div class="time-rail__perf time-rail__perf--a" data-test="film-strip" :style="perfStyle" />
      <div class="time-rail__perf time-rail__perf--b" :style="perfStyle" />
      <div class="time-rail__frames" :style="frameStyle" />
      <div class="time-rail__barcode" />
      <div class="time-rail__stock">KODAK 5247 · SAFETY</div>
      <div class="time-rail__emulsion" />
    </template>
    <!-- plain list: a TransitionGroup here would call getBoundingClientRect on every
         tick on every re-render (its FLIP machinery), and the rail re-renders each
         pan/zoom frame — a forced-reflow storm. The film fade is a per-tick mount
         animation instead (see `.time-rail--film .time-rail__tick`). -->
    <div class="time-rail__ticks">
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
  </div>
</template>

<style scoped lang="scss">
.time-rail {
  position: relative;
  overflow: hidden;
  user-select: none;
  font-family: var(--font-body);
  background: linear-gradient(var(--panel), var(--rail-grad-bottom));

  &--vertical { height: 100%; border-right: 1px solid var(--panel-edge); }
  &--horizontal { width: 100%; border-top: 1px solid var(--panel-edge); }

  &__ticks { position: absolute; inset: 0; }
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
    background: linear-gradient(var(--panel), var(--rail-grad-bottom));
  }
  // decade & century numerals stand out without dimming the in-between years
  &__tick--decade &__label { font-weight: 600; }
  &__tick--century &__label { font-weight: 600; font-size: 17px; }
}

// film label fade: a mount animation runs once per tick element, so a year fades
// in when it first appears (a finer step revealing it, or scrolling in at an edge)
// with no per-frame layout cost. Reused ticks (persisting years) don't re-animate.
.time-rail--film .time-rail__tick { animation: tick-fade-in 0.45s ease; }
@keyframes tick-fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .time-rail--film .time-rail__tick { animation: none; }
}
// While dragging, years scroll past continuously — running a fade on every newly
// mounted tick is wasted work that never finishes before the tick scrolls off.
// Suppress it during the pan; it resumes for genuine reveals once the drag ends.
.time-rail--panning .time-rail__tick { animation: none; }

// ---- '80s film-strip variant ----
.time-rail--film {
  background: linear-gradient(100deg, #1d160f, #100c08 55%, #171109);
}
.time-rail__perf { position: absolute; pointer-events: none; }
.time-rail--vertical .time-rail__perf {
  top: -20px; bottom: -20px; width: 15px;
  // dot centred on the pitch-scaling (vertical) axis with `50%`, so it never drifts
  // to a tile edge and clips as the pitch shrinks when zoomed out
  background-image: radial-gradient(circle at 7.5px 50%, var(--rail-perf) 3.4px, transparent 3.6px);
}
.time-rail--vertical .time-rail__perf--a { left: 0; }
.time-rail--vertical .time-rail__perf--b { right: 0; }
.time-rail--horizontal .time-rail__perf {
  left: -20px; right: -20px; height: 15px;
  // dot centred on the pitch-scaling (horizontal) axis with `50%`
  background-image: radial-gradient(circle at 50% 7.5px, var(--rail-perf) 3.4px, transparent 3.6px);
}
.time-rail--horizontal .time-rail__perf--a { top: 0; }
.time-rail--horizontal .time-rail__perf--b { bottom: 0; }

.time-rail__barcode {
  position: absolute; pointer-events: none; opacity: 0.5;
  background-image: repeating-linear-gradient(180deg, #c9bd95 0 2px, transparent 2px 4px, #c9bd95 4px 5px, transparent 5px 12px, #c9bd95 12px 14px, transparent 14px 18px);
}
.time-rail--vertical .time-rail__barcode { left: 16px; top: 0; bottom: 0; width: 8px; }

.time-rail__stock {
  position: absolute; left: 26px; top: 0; bottom: 0; writing-mode: vertical-rl;
  font-family: var(--font-mono); font-size: 7px; letter-spacing: 2px; color: #d6c79f; opacity: 0.85; pointer-events: none;
}
.time-rail__emulsion {
  position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(120% 60% at 50% 30%, #7a5a2e22, transparent);
}
// frame-line dividers — a single 1px line tiled at the pitch-derived size from
// `frameStyle`, so the cadence scales with zoom and scrolls with pan
.time-rail__frames { position: absolute; inset: 0; pointer-events: none; }
.time-rail--vertical .time-rail__frames { background-image: linear-gradient(to bottom, #ffffff14 0 1px, transparent 1px); }
.time-rail--horizontal .time-rail__frames { background-image: linear-gradient(to right, #ffffff14 0 1px, transparent 1px); }

// Step 2: film year-label overrides
// compound selector so the perforations-are-the-marks override beats the classic
// `.time-rail--{orientation} .time-rail__tick::after` rule on specificity, not source order
.time-rail--film.time-rail--vertical .time-rail__tick::after,
.time-rail--film.time-rail--horizontal .time-rail__tick::after { display: none; }
.time-rail--film .time-rail__label { background: transparent; color: #efe9da; }
.time-rail--film .time-rail__tick--minor .time-rail__label { color: #b9b3a4; }
// years sit clear of the right sprocket column; the bolder decade/century marks
// indent a little further left so the size hierarchy reads against the strip
.time-rail--film.time-rail--vertical .time-rail__tick { padding-right: 20px; }
.time-rail--film.time-rail--vertical .time-rail__tick--decade,
.time-rail--film.time-rail--vertical .time-rail__tick--century { padding-right: 26px; }

// Step 3: responsive slim tier
@media (max-width: 640px) {
  .time-rail--film .time-rail__stock { display: none; }
  // the slim rail is narrow; pull the year indent back in so the labels still fit
  .time-rail--film.time-rail--vertical .time-rail__tick,
  .time-rail--film.time-rail--vertical .time-rail__tick--decade,
  .time-rail--film.time-rail--vertical .time-rail__tick--century { padding-right: 12px; }
}
.time-rail--film.time-rail--horizontal .time-rail__stock { display: none; }
.time-rail--horizontal .time-rail__barcode {
  left: 0; right: 0; top: 16px; height: 8px; width: auto;
  background-image: repeating-linear-gradient(90deg, #c9bd95 0 2px, transparent 2px 4px, #c9bd95 4px 5px, transparent 5px 12px, #c9bd95 12px 14px, transparent 14px 18px);
}
</style>
