import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fadeIn } from './fade';

const { fromTo, set } = vi.hoisted(() => ({ fromTo: vi.fn(), set: vi.fn() }));
vi.mock('gsap', () => ({ default: { fromTo, set } }));

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && matches,
    media,
    addEventListener() {},
    removeEventListener() {}
  }));
}

beforeEach(() => {
  fromTo.mockReset();
  set.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('fadeIn', () => {
  it('fades the element in with the fade token', () => {
    stubMatchMedia(false);
    const el = document.createElement('div');
    fadeIn(el);
    expect(fromTo).toHaveBeenCalledWith(
      el,
      { opacity: 0 },
      expect.objectContaining({ opacity: 1, duration: 0.15, ease: 'power1.out' })
    );
    expect(set).not.toHaveBeenCalled();
  });

  it('sets opacity instantly under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    const el = document.createElement('div');
    fadeIn(el);
    expect(set).toHaveBeenCalledWith(el, { opacity: 1 });
    expect(fromTo).not.toHaveBeenCalled();
  });
});
