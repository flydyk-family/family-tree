import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { capturePaint, tweenFromPaint } from './stateTween';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('gsap', () => ({ default: { from } }));

// jsdom's CSS engine doesn't reliably compute SVG paint properties, so the
// tests pin getComputedStyle directly instead of relying on inline styles.
function stubComputedPaint(paint: Record<string, string>): void {
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (prop: string) => paint[prop] ?? ''
  }));
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && matches,
    media,
    addEventListener() {},
    removeEventListener() {}
  }));
}

beforeEach(() => from.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe('stateTween', () => {
  it('captures the computed paint of each element', () => {
    stubComputedPaint({ fill: 'rgb(10, 20, 30)', stroke: 'rgb(40, 50, 60)', 'stroke-width': '3.4px' });
    const el = document.createElement('div');
    const [snapshot] = capturePaint([el]);
    expect(snapshot.el).toBe(el);
    expect(snapshot.vars).toEqual({
      fill: 'rgb(10, 20, 30)',
      stroke: 'rgb(40, 50, 60)',
      strokeWidth: '3.4px'
    });
  });

  it('tweens FROM the captured paint with the feedback token and clears inline props after', () => {
    stubComputedPaint({ stroke: 'rgb(1, 2, 3)' });
    stubMatchMedia(false);
    const el = document.createElement('div');
    const snapshots = capturePaint([el]);
    tweenFromPaint(snapshots);
    expect(from).toHaveBeenCalledTimes(1);
    const [target, vars] = from.mock.calls[0] as [Element, Record<string, unknown>];
    expect(target).toBe(el);
    expect(vars).toMatchObject({
      stroke: 'rgb(1, 2, 3)',
      duration: 0.3,
      ease: 'power1.out',
      overwrite: 'auto',
      clearProps: 'fill,stroke,strokeWidth'
    });
  });

  it('does nothing under prefers-reduced-motion (classes already show the end state)', () => {
    stubComputedPaint({ stroke: 'rgb(1, 2, 3)' });
    stubMatchMedia(true);
    const el = document.createElement('div');
    tweenFromPaint(capturePaint([el]));
    expect(from).not.toHaveBeenCalled();
  });
});
