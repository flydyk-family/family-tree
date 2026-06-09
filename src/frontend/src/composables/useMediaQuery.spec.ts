import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMediaQuery } from './useMediaQuery';

let listeners: Array<(e: { matches: boolean }) => void>;
let current: boolean;

beforeEach(() => {
  listeners = [];
  current = false;
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: current,
    media: q,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
    removeEventListener: () => {}
  }));
});

describe('useMediaQuery', () => {
  it('returns the initial match state', () => {
    current = true;
    const matches = useMediaQuery('(max-width: 767.98px)');
    expect(matches.value).toBe(true);
  });

  it('updates when the media query changes', () => {
    const matches = useMediaQuery('(max-width: 767.98px)');
    expect(matches.value).toBe(false);
    listeners.forEach(cb => cb({ matches: true }));
    expect(matches.value).toBe(true);
  });

  it('defaults to false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const matches = useMediaQuery('(max-width: 767.98px)');
    expect(matches.value).toBe(false);
  });
});
