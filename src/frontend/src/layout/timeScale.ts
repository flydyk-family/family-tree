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

export function axisTicks(scale: TimeScale, step = 25): AxisTick[] {
  const first = Math.ceil(scale.minYear / step) * step;
  const ticks: AxisTick[] = [];
  for (let year = first; year <= scale.maxYear; year += step) {
    ticks.push({ year, y: scale.yForYear(year), label: String(year) });
  }
  return ticks;
}
