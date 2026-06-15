import { describe, it, expect } from 'vitest';
import { thumbMetrics, scrollTopFromThumbTop } from './scrollThumb';

describe('thumbMetrics', () => {
  it('is hidden when content fits the viewport', () => {
    expect(thumbMetrics(0, 200, 200, 200)).toEqual({ visible: false, height: 0, top: 0 });
  });

  it('is hidden when the track has no height', () => {
    expect(thumbMetrics(0, 600, 200, 0)).toEqual({ visible: false, height: 0, top: 0 });
  });

  it('sizes the thumb to the viewport/content ratio', () => {
    const m = thumbMetrics(0, 600, 300, 300);
    expect(m.visible).toBe(true);
    expect(m.height).toBe(150); // 300/600 * 300
    expect(m.top).toBe(0);
  });

  it('places the thumb at the bottom when scrolled to the end', () => {
    const m = thumbMetrics(300, 600, 300, 300); // maxScroll 300, maxTop 150
    expect(m.top).toBe(150);
  });

  it('clamps the thumb height to the minimum', () => {
    const m = thumbMetrics(0, 10000, 300, 300, 28);
    expect(m.height).toBe(28);
  });
});

describe('scrollTopFromThumbTop', () => {
  it('maps a thumb position back to scrollTop', () => {
    // thumbH 150, track 300 -> maxTop 150; content 600, view 300 -> maxScroll 300
    expect(scrollTopFromThumbTop(75, 150, 300, 600, 300)).toBe(150);
  });

  it('clamps past either end', () => {
    expect(scrollTopFromThumbTop(-50, 150, 300, 600, 300)).toBe(0);
    expect(scrollTopFromThumbTop(999, 150, 300, 600, 300)).toBe(300);
  });

  it('returns 0 when there is nothing to scroll', () => {
    expect(scrollTopFromThumbTop(50, 200, 200, 200, 200)).toBe(0);
  });
});
