import { describe, it, expect, vi, afterEach } from 'vitest';
import { prefersReducedMotion } from './reducedMotion';

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && matches,
    media,
    addEventListener() {},
    removeEventListener() {}
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('prefersReducedMotion', () => {
  it('is true when the reduce media query matches', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false when the media query does not match', () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false when matchMedia is unavailable (jsdom default)', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
