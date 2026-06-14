import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock gsap (default export) and gsap/Flip. The module registers Flip on import,
// so gsap.registerPlugin must exist. Flip.from returns a timeline-like object
// whose progress() is chainable (matches GSAP's API: progress() returns the tl).
const mocks = vi.hoisted(() => {
  const timeline = { progress: vi.fn(() => timeline), kill: vi.fn() };
  return {
    timeline,
    registerPlugin: vi.fn(),
    getState: vi.fn((_selector?: unknown, _opts?: unknown) => ({ snapshot: true })),
    from: vi.fn((_state?: unknown, _vars?: unknown): unknown => timeline)
  };
});

vi.mock('gsap', () => ({ default: { registerPlugin: mocks.registerPlugin } }));
vi.mock('gsap/Flip', () => ({ Flip: { getState: mocks.getState, from: mocks.from } }));

import { captureDockMorph, DOCK_FLIP_SELECTOR } from './popupDock';
import { motionTokens } from './tokens';

function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && reduced,
    media,
    addEventListener() {},
    removeEventListener() {}
  }));
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('captureDockMorph', () => {
  it('registers the Flip plugin on import', () => {
    expect(mocks.registerPlugin).toHaveBeenCalled();
  });

  it('returns null and snapshots nothing under reduced motion', () => {
    stubMatchMedia(true);
    expect(captureDockMorph()).toBeNull();
    expect(mocks.getState).not.toHaveBeenCalled();
  });

  it('snapshots the dock cards (with borderRadius) when motion is allowed', () => {
    stubMatchMedia(false);
    const capture = captureDockMorph();
    expect(capture).not.toBeNull();
    expect(mocks.getState).toHaveBeenCalledWith(DOCK_FLIP_SELECTOR, { props: 'borderRadius' });
  });

  it('play() flies from the snapshot using the morph token and returns a finishable handle', () => {
    stubMatchMedia(false);
    const morph = captureDockMorph()!.play();
    expect(mocks.from).toHaveBeenCalledTimes(1);
    const [state, vars] = mocks.from.mock.calls[0];
    expect(state).toEqual({ snapshot: true });
    expect(vars).toMatchObject({
      duration: motionTokens.morph.duration,
      ease: motionTokens.morph.ease,
      absolute: true,
      fade: true,
      props: 'borderRadius'
    });
    morph!.finish();
    expect(mocks.timeline.progress).toHaveBeenCalledWith(1);
    expect(mocks.timeline.kill).toHaveBeenCalled();
  });

  it('play() returns null when Flip has nothing to animate', () => {
    stubMatchMedia(false);
    mocks.from.mockReturnValueOnce(null);
    expect(captureDockMorph()!.play()).toBeNull();
  });
});
