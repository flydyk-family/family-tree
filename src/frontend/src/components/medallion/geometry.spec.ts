import { describe, it, expect } from 'vitest';
import { frameGeom } from './geometry';

describe('frameGeom', () => {
  it('keeps the owner-tuned 1362:1648 frame ratio', () => {
    const g = frameGeom('trunk');
    expect(g.h / g.w).toBeCloseTo(1648 / 1362, 3);
  });

  it('positions the frame so the oval centre sits on the node origin (0,0)', () => {
    const g = frameGeom('branch');
    // oval centre = frame top-left + (49.8% w, 42% h)
    expect(g.frameX + 0.498 * g.w).toBeCloseTo(0, 6);
    expect(g.frameY + 0.42 * g.h).toBeCloseTo(0, 6);
  });

  it('derives the oval radii from the locked 30%/35% clip', () => {
    const g = frameGeom('trunk');
    expect(g.ovalRx).toBeCloseTo(0.30 * g.w, 6);
    expect(g.ovalRy).toBeCloseTo(0.35 * g.h, 6);
  });

  it('zooms the portrait out for smaller roles (trunk 80% > leaf 60%)', () => {
    expect(frameGeom('trunk').portraitZoom).toBe(0.80);
    expect(frameGeom('branch').portraitZoom).toBe(0.70);
    expect(frameGeom('leaf').portraitZoom).toBe(0.60);
  });

  it('scales trunk larger than leaf', () => {
    expect(frameGeom('trunk').w).toBeGreaterThan(frameGeom('leaf').w);
  });
});
