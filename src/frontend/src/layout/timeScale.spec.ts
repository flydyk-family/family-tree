import { describe, it, expect } from 'vitest';
import { createTimeScale, chooseTickStep, viewportTicks, horizontalTicks } from './timeScale';

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

describe('chooseTickStep', () => {
  it('uses coarse steps when zoomed out and finer steps as the zoom grows', () => {
    // pxPerYear ≈ scale.pxPerYear * k. Smaller (zoomed out) → larger step.
    expect(chooseTickStep(1.2, 24)).toBe(25); // a couple of centuries on screen → every 25y
    expect(chooseTickStep(4, 24)).toBe(10);
    expect(chooseTickStep(8, 24)).toBe(5);
    expect(chooseTickStep(16, 24)).toBe(2);
    expect(chooseTickStep(32, 24)).toBe(1);
  });

  it('falls back to the largest step when extremely zoomed out', () => {
    expect(chooseTickStep(0.0001, 24)).toBe(500);
  });
});

describe('viewportTicks', () => {
  it('maps each tick to screen Y via the viewport translation and scale', () => {
    const scale = createTimeScale([1800, 2000], 8, 0); // minYear 1800, maxYear 2000
    const ticks = viewportTicks(scale, 100, 2, 24);

    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every(tick => tick.y === 100 + scale.yForYear(tick.year) * 2)).toBe(true);
    // newest year sits at content y=0, so screen y = viewportY (100)
    expect(ticks.find(tick => tick.year === 2000)?.y).toBe(100);
  });

  it('produces denser ticks at higher zoom', () => {
    const scale = createTimeScale([1800, 2000], 8, 0);
    const sparse = viewportTicks(scale, 0, 0.2, 24);
    const dense = viewportTicks(scale, 0, 2, 24);

    expect(dense.length).toBeGreaterThan(sparse.length);
  });

  it('aligns ticks to step boundaries within the scale range', () => {
    const scale = createTimeScale([1810, 1990], 8, 0); // pxPerYear 8, k 1 → step 5
    const ticks = viewportTicks(scale, 0, 1, 24);

    expect(ticks.every(tick => tick.year % 5 === 0)).toBe(true);
    expect(ticks.every(tick => tick.year >= scale.minYear && tick.year <= scale.maxYear)).toBe(true);
    expect(ticks[0].label).toBe(String(ticks[0].year));
  });
});

describe('horizontalTicks', () => {
  it('maps each tick to screen X via the viewport translation and scale (older→left)', () => {
    const scale = createTimeScale([1800, 2000], 8, 0); // minYear 1800, maxYear 2000
    const ticks = horizontalTicks(scale, 100, 2, 24);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.find(t => t.year === 1800)?.x).toBe(100);
    expect(ticks.every(t => t.x === 100 + (t.year - scale.minYear) * scale.pxPerYear * 2)).toBe(true);
  });

  it('produces denser ticks at higher zoom', () => {
    const scale = createTimeScale([1800, 2000], 8, 0);
    const sparse = horizontalTicks(scale, 0, 0.2, 24);
    const dense = horizontalTicks(scale, 0, 2, 24);
    expect(dense.length).toBeGreaterThan(sparse.length);
  });

  it('never spaces consecutive ticks closer than minSpacingPx, even across step transitions', () => {
    // Sweeping the zoom finely crosses every step-down (25→10→5→2→1). Right at a
    // transition the spacing is at its tightest; it must still clear minSpacingPx
    // so the side-by-side year labels never overlap.
    const scale = createTimeScale([1762, 2026], 8, 6);
    const minSpacing = 56;
    for (let k = 0.2; k <= 6; k += 0.03) {
      const ticks = horizontalTicks(scale, 0, k, minSpacing);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i].x - ticks[i - 1].x).toBeGreaterThanOrEqual(minSpacing - 1e-6);
      }
    }
  });
});
