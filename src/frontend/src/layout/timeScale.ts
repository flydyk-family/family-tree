export interface TimeScale {
  minYear: number;
  maxYear: number;
  pxPerYear: number;
  height: number;
  yForYear(year: number): number;
}

export interface AxisTick {
  year: number;
  y: number;
  label: string;
}

export function createTimeScale(years: number[], pxPerYear = 8, padYears = 5): TimeScale {
  const valid = years.filter((year): year is number => typeof year === 'number' && !Number.isNaN(year));
  const rawMin = valid.length ? Math.min(...valid) : 1700;
  const rawMax = valid.length ? Math.max(...valid) : 2000;
  const minYear = rawMin - padYears;
  const maxYear = rawMax + padYears;
  const height = (maxYear - minYear) * pxPerYear;
  return {
    minYear,
    maxYear,
    pxPerYear,
    height,
    yForYear(year: number): number {
      return (maxYear - year) * pxPerYear;
    }
  };
}

// "Nice" year steps the axis can snap to, coarse → fine.
const NICE_STEPS = [1, 2, 5, 10, 25, 50, 100, 200, 500];

// Smallest nice step whose on-screen spacing (step * pxPerYear) is at least minSpacingPx.
// `pxPerYear` is the *effective* on-screen value: scale.pxPerYear * zoom (k).
export function chooseTickStep(pxPerYear: number, minSpacingPx = 24): number {
  for (const step of NICE_STEPS) {
    if (step * pxPerYear >= minSpacingPx) {
      return step;
    }
  }
  return NICE_STEPS[NICE_STEPS.length - 1];
}

// Year ticks positioned in screen space using the SAME vertical transform the oak
// applies — translate(_, viewportY) scale(k): screenY = viewportY + scale.yForYear(year) * k.
// Tick density adapts to the zoom level so labels stay readable and never overlap.
export function viewportTicks(scale: TimeScale, viewportY: number, k: number, minSpacingPx = 24): AxisTick[] {
  const step = chooseTickStep(scale.pxPerYear * k, minSpacingPx);
  const first = Math.ceil(scale.minYear / step) * step;
  const ticks: AxisTick[] = [];
  for (let year = first; year <= scale.maxYear; year += step) {
    ticks.push({ year, y: viewportY + scale.yForYear(year) * k, label: String(year) });
  }
  return ticks;
}
