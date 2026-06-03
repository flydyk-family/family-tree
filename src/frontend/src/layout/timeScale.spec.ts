import { describe, it, expect } from 'vitest';
import { createTimeScale, axisTicks } from './timeScale';

describe('createTimeScale', () => {
  it('maps the newest year to the top (y=0) and oldest to the bottom', () => {
    const scale = createTimeScale([1800, 1900, 2000], 10, 0);

    expect(scale.minYear).toBe(1800);
    expect(scale.maxYear).toBe(2000);
    expect(scale.yForYear(2000)).toBe(0);
    expect(scale.yForYear(1800)).toBe(scale.height);
    expect(scale.yForYear(1900)).toBeLessThan(scale.yForYear(1800));
  });

  it('falls back to a default span when no years are given', () => {
    const scale = createTimeScale([], 10, 0);
    expect(scale.height).toBeGreaterThan(0);
  });
});

describe('axisTicks', () => {
  it('produces ticks on step boundaries within the scale', () => {
    const scale = createTimeScale([1810, 1990], 8, 0);
    const ticks = axisTicks(scale, 50);

    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every(tick => tick.year % 50 === 0)).toBe(true);
    expect(ticks.every(tick => tick.year >= scale.minYear && tick.year <= scale.maxYear)).toBe(true);
    expect(ticks[0].label).toBe(String(ticks[0].year));
  });
});
