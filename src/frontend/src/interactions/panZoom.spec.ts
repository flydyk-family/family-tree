import { describe, it, expect } from 'vitest';
import { IDENTITY, clampScale, panBy, zoomAt, pinchZoom, fitToBounds, centerOn, READABLE_SCALE_THRESHOLD, READABLE_SCALE } from './panZoom';

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

  it('clamps the fit scale to maxScale so small content is not over-enlarged', () => {
    const bounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    // Unclamped this would fit at k = (1000 - 0) / 100 = 10; the cap holds it at 1.
    const vp = fitToBounds(bounds, { width: 1000, height: 1000 }, 0, 1);
    expect(vp.k).toBe(1);
    // content centre (50,50) stays centred: x = 1000/2 - 50*1 = 450
    expect(vp.x).toBe(450);
    expect(vp.y).toBe(450);
  });

  it("'height' mode fits the vertical extent and lets wide content overflow horizontally", () => {
    // Wide box (400×100) in a narrow portrait viewport (200×400): 'contain' would
    // letterbox to k = 200/400 = 0.5; 'height' fits the height → k = 400/100 = 4.
    const bounds = { minX: 0, maxX: 400, minY: 0, maxY: 100 };
    const size = { width: 200, height: 400 };
    expect(fitToBounds(bounds, size, 0).k).toBe(0.5);
    const vp = fitToBounds(bounds, size, 0, Infinity, 'height');
    expect(vp.k).toBe(4);
    // content centre (200,50) stays centred; the box overflows left/right of the viewport
    expect(vp.x).toBe(200 / 2 - 200 * 4); // -700
    expect(vp.y).toBe(400 / 2 - 50 * 4); // 0
  });

  it("'height' mode still respects maxScale", () => {
    const bounds = { minX: 0, maxX: 400, minY: 0, maxY: 100 };
    const vp = fitToBounds(bounds, { width: 200, height: 400 }, 0, 1, 'height');
    expect(vp.k).toBe(1);
  });

  it("'width' mode fits the horizontal extent and lets tall content overflow vertically", () => {
    // Tall box (100×400) in a wide short viewport (400×200): 'contain' would
    // letterbox to k = 200/400 = 0.5; 'width' fits the width → k = 400/100 = 4.
    const bounds = { minX: 0, maxX: 100, minY: 0, maxY: 400 };
    const size = { width: 400, height: 200 };
    expect(fitToBounds(bounds, size, 0).k).toBe(0.5);
    const vp = fitToBounds(bounds, size, 0, Infinity, 'width');
    expect(vp.k).toBe(4);
    // content centre (50,200) stays centred; the box overflows top/bottom
    expect(vp.x).toBe(400 / 2 - 50 * 4); // 0
    expect(vp.y).toBe(200 / 2 - 200 * 4); // -700
  });

  it("'height' mode anchors the overflowing X axis on the focal point", () => {
    // Wide box (400×100) at k=4 overflows the 200px width; the focal x=50 is
    // centred instead of the bounds midpoint (200), keeping that point in view.
    const bounds = { minX: 0, maxX: 400, minY: 0, maxY: 100 };
    const size = { width: 200, height: 400 };
    const anchored = fitToBounds(bounds, size, 0, Infinity, 'height', { x: 50, y: 50 });
    expect(anchored.k).toBe(4);
    expect(anchored.x).toBe(200 / 2 - 50 * 4); // -100, focal-anchored (vs -700 unanchored)
  });

  it('ignores the focal point when the content does not overflow that axis', () => {
    // 'width' fits X (k=0.5); scaled height (100*0.5=50) fits the 400 view, so no
    // vertical overflow → centre on the bounds midpoint (50), not the focal.
    const bounds = { minX: 0, maxX: 400, minY: 0, maxY: 100 };
    const vp = fitToBounds(bounds, { width: 200, height: 400 }, 0, Infinity, 'width', { x: 0, y: 0 });
    expect(vp.k).toBe(0.5);
    expect(vp.y).toBe(400 / 2 - 50 * 0.5); // 175 = bounds-mid-Y, focal ignored
  });
});

describe('centerOn', () => {
  it('puts the content point at the screen centre at the current scale', () => {
    const vp = centerOn({ x: 100, y: 50 }, { width: 800, height: 600 }, 2);
    expect(vp).toEqual({ x: 400 - 200, y: 300 - 100, k: 2 });
  });

  it('keeps the scale when at or above the readability threshold', () => {
    expect(centerOn({ x: 0, y: 0 }, { width: 100, height: 100 }, READABLE_SCALE_THRESHOLD).k).toBe(READABLE_SCALE_THRESHOLD);
    expect(centerOn({ x: 0, y: 0 }, { width: 100, height: 100 }, 3).k).toBe(3);
  });

  it('raises a low scale to natural size so the centred card is legible', () => {
    const vp = centerOn({ x: 100, y: 50 }, { width: 800, height: 600 }, 0.5);
    expect(vp.k).toBe(READABLE_SCALE);
    expect(vp.x).toBe(400 - 100 * READABLE_SCALE);
    expect(vp.y).toBe(300 - 50 * READABLE_SCALE);
  });
});
