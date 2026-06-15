import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { hoverLift } from './interactions';

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
  to.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('hoverLift', () => {
  it('lifts the card on enter — scale up + faint brighten, fast ease-in', () => {
    stubMatchMedia(false);
    const el = document.createElement('div');
    hoverLift(el, true);
    expect(to).toHaveBeenCalledWith(
      el,
      expect.objectContaining({
        scale: 1.03,
        filter: 'brightness(1.06)',
        transformOrigin: 'center center',
        duration: 0.25,
        ease: 'power1.out',
        overwrite: 'auto'
      })
    );
  });

  it('settles back to rest on leave (longer ease-out, no brighten)', () => {
    stubMatchMedia(false);
    const el = document.createElement('div');
    hoverLift(el, false);
    expect(to).toHaveBeenCalledWith(
      el,
      expect.objectContaining({ scale: 1, filter: 'brightness(1)', duration: 0.3 })
    );
  });

  it('no-ops under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    hoverLift(document.createElement('div'), true);
    expect(to).not.toHaveBeenCalled();
  });

  it('no-ops on a null element', () => {
    stubMatchMedia(false);
    hoverLift(null, true);
    expect(to).not.toHaveBeenCalled();
  });
});
