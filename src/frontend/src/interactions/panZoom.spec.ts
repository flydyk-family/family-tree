import { describe, it, expect } from 'vitest';
import { IDENTITY, clampScale, panBy, zoomAt, pinchZoom, fitToBounds } from './panZoom';

describe('clampScale', () => {
  it('clamps below the minimum and above the maximum', () => {
    expect(clampScale(0.05, { min: 0.2, max: 5 })).toBe(0.2);
    expect(clampScale(99, { min: 0.2, max: 5 })).toBe(5);
    expect(clampScale(1, { min: 0.2, max: 5 })).toBe(1);
  });
});

describe('panBy', () => {
  it('translates without changing scale', () => {
    expect(panBy({ x: 10, y: 20, k: 2 }, 5, -3)).toEqual({ x: 15, y: 17, k: 2 });
  });
});

describe('zoomAt', () => {
  it('keeps the pivot point stationary while scaling', () => {
    const start = { ...IDENTITY };
    const next = zoomAt(start, 2, { x: 100, y: 50 }, { min: 0.2, max: 5 });
    expect(next.k).toBe(2);
    expect((100 - start.x) / start.k).toBeCloseTo((100 - next.x) / next.k);
    expect((50 - start.y) / start.k).toBeCloseTo((50 - next.y) / next.k);
  });

  it('respects scale limits and adjusts translation by the realized ratio', () => {
    const next = zoomAt({ x: 0, y: 0, k: 4 }, 10, { x: 0, y: 0 }, { min: 0.2, max: 5 });
    expect(next.k).toBe(5);
  });

  it('uses the clamped scale ratio for translation when zooming past the max', () => {
    const start = { x: 30, y: 10, k: 4 };
    const limits = { min: 0.2, max: 5 };
    const next = zoomAt(start, 10, { x: 80, y: 60 }, limits);
    expect(next.k).toBe(5); // clamped from 40
    const ratio = 5 / 4;
    expect(next.x).toBeCloseTo(80 - (80 - 30) * ratio);
    expect(next.y).toBeCloseTo(60 - (60 - 10) * ratio);
  });
});

describe('pinchZoom', () => {
  it('scales by the distance ratio about the midpoint', () => {
    const next = pinchZoom({ ...IDENTITY }, 100, 200, { x: 0, y: 0 }, { min: 0.2, max: 5 });
    expect(next.k).toBe(2);
  });

  it('returns the viewport unchanged when the previous distance is non-positive', () => {
    const vp = { x: 5, y: 6, k: 1.5 };
    expect(pinchZoom(vp, 0, 200, { x: 0, y: 0 }, { min: 0.2, max: 5 })).toEqual(vp);
  });
});

describe('fitToBounds', () => {
  it('centers and scales content to fit the viewport with padding', () => {
    const bounds = { minX: 0, maxX: 100, minY: 0, maxY: 50 };
    const vp = fitToBounds(bounds, { width: 240, height: 140 }, 20);
    expect(vp.k).toBe(2);
    expect(vp.x).toBe(20);
    expect(vp.y).toBe(20);
  });

  it('returns identity when the viewport or content has no size', () => {
    expect(fitToBounds({ minX: 0, maxX: 0, minY: 0, maxY: 0 }, { width: 100, height: 100 }, 10)).toEqual(IDENTITY);
    expect(fitToBounds({ minX: 0, maxX: 10, minY: 0, maxY: 10 }, { width: 0, height: 0 }, 10)).toEqual(IDENTITY);
  });
});
