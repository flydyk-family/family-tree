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
  it('lifts the card on enter — pure scale up, fast ease-in (no filter)', () => {
    stubMatchMedia(false);
    const el = document.createElement('div');
    hoverLift(el, true);
    expect(to).toHaveBeenCalledWith(
      el,
      expect.objectContaining({
        scale: 1.03,
        transformOrigin: 'center center',
        duration: 0.25,
        ease: 'power1.out',
        overwrite: 'auto'
      })
    );
    // No `filter` — animating brightness from `none` flashes black for a frame.
    expect(to.mock.calls[to.mock.calls.length - 1][1]).not.toHaveProperty('filter');
  });

  it('settles back to rest on leave (longer ease-out)', () => {
    stubMatchMedia(false);
    const el = document.createElement('div');
    hoverLift(el, false);
    expect(to).toHaveBeenCalledWith(
      el,
      expect.objectContaining({ scale: 1, duration: 0.3 })
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
