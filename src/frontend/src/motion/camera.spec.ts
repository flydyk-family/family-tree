import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { Viewport } from '../interactions/panZoom';
import { glideTo } from './camera';

// vi.mock is hoisted above const initialisers — vi.hoisted keeps the mock fn
// alive when the factory runs during the subject's import.
const { to } = vi.hoisted(() => ({ to: vi.fn() }));
vi.mock('gsap', () => ({ default: { to } }));

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && matches,
    media,
    addEventListener() {},
    removeEventListener() {}
  }));
}

beforeEach(() => {
  to.mockReset().mockReturnValue({ kill: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe('glideTo', () => {
  const target: Viewport = { x: 100, y: -40, k: 1.5 };

  it('snaps instantly and returns null under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
    expect(glideTo(viewport, target)).toBeNull();
    expect(viewport.value).toEqual(target);
    expect(to).not.toHaveBeenCalled();
  });

  it('tweens a proxy with the glide token and syncs the ref on every update', () => {
    stubMatchMedia(false);
    const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
    const tween = glideTo(viewport, target);
    expect(tween).not.toBeNull();
    const [proxy, vars] = to.mock.calls[0] as [
      Viewport,
      { x: number; y: number; k: number; duration: number; ease: string; onUpdate: () => void }
    ];
    expect(vars).toMatchObject({ x: 100, y: -40, k: 1.5, duration: 0.35, ease: 'power2.inOut' });
    proxy.x = 50;
    proxy.y = -20;
    proxy.k = 1.25;
    vars.onUpdate();
    expect(viewport.value).toEqual({ x: 50, y: -20, k: 1.25 });
  });

  it('snaps when an explicit non-positive duration is requested', () => {
    stubMatchMedia(false);
    const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
    expect(glideTo(viewport, target, { duration: 0 })).toBeNull();
    expect(viewport.value).toEqual(target);
    expect(to).not.toHaveBeenCalled();
  });
});
