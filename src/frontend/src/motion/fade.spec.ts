import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fadeIn, fadeTo, setOpacity } from './fade';

const { fromTo, set, to } = vi.hoisted(() => ({ fromTo: vi.fn(), set: vi.fn(), to: vi.fn() }));
vi.mock('gsap', () => ({ default: { fromTo, set, to } }));

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
  to.mockReset();
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

describe('fadeTo', () => {
  it('tweens opacity with the feedback token', () => {
    stubMatchMedia(false);
    const el = document.createElement('div');
    fadeTo(el, 1);
    expect(to).toHaveBeenCalledWith(
      el,
      expect.objectContaining({ opacity: 1, duration: 0.3, ease: 'power1.out', overwrite: 'auto' })
    );
    expect(set).not.toHaveBeenCalled();
  });

  it('sets opacity instantly under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    const el = document.createElement('div');
    fadeTo(el, 0);
    expect(set).toHaveBeenCalledWith(el, { opacity: 0 });
    expect(to).not.toHaveBeenCalled();
  });

  it('no-ops on a null element', () => {
    stubMatchMedia(false);
    fadeTo(null, 1);
    expect(to).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});

describe('setOpacity', () => {
  it('sets opacity immediately with no tween', () => {
    const el = document.createElement('div');
    setOpacity(el, 0);
    expect(set).toHaveBeenCalledWith(el, { opacity: 0 });
    expect(to).not.toHaveBeenCalled();
  });

  it('no-ops on a null element', () => {
    setOpacity(null, 1);
    expect(set).not.toHaveBeenCalled();
  });
});
