import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const makeTween = () => { const t: any = { progress: vi.fn(() => t), kill: vi.fn() }; return t; };
  return { makeTween, fromTo: vi.fn(() => mocks.makeTween()), from: vi.fn(() => mocks.makeTween()) };
});
vi.mock('gsap', () => ({ default: { fromTo: mocks.fromTo, from: mocks.from } }));

import { captureDockMorph, flipInvert } from './popupDock';
import { motionTokens } from './tokens';

function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && reduced,
    media, addEventListener() {}, removeEventListener() {}
  }));
}

function card(id: string, rect: { left: number; top: number; width: number; height: number }) {
  const el = document.createElement('div');
  el.setAttribute('data-flip-id', `dock-card-${id}`);
  el.getBoundingClientRect = () => ({
    left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON() {}
  }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { stubMatchMedia(false); });
afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('flipInvert', () => {
  it('is identity for equal rects', () => {
    const r = { left: 10, top: 20, width: 100, height: 50 };
    expect(flipInvert(r, r)).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  });
  it('computes top-left translate and size scale', () => {
    const source = { left: 200, top: 100, width: 60, height: 30 };
    const dest = { left: 50, top: 40, width: 120, height: 120 };
    expect(flipInvert(source, dest)).toEqual({ x: 150, y: 60, scaleX: 0.5, scaleY: 0.25 });
  });
  it('guards a zero-size destination (scale 1, no NaN)', () => {
    const source = { left: 0, top: 0, width: 80, height: 40 };
    const dest = { left: 0, top: 0, width: 0, height: 0 };
    expect(flipInvert(source, dest)).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  });
});

describe('captureDockMorph', () => {
  it('returns null under reduced motion', () => {
    stubMatchMedia(true);
    card('p1', { left: 0, top: 0, width: 10, height: 10 });
    expect(captureDockMorph('p1')).toBeNull();
    expect(mocks.fromTo).not.toHaveBeenCalled();
  });

  it('returns null when there is no source element for the id', () => {
    expect(captureDockMorph('ghost')).toBeNull();
  });

  it('flies the destination from the source rect using the morph token', () => {
    const source = card('p1', { left: 300, top: 100, width: 80, height: 40 });
    const capture = captureDockMorph('p1')!;
    source.remove();
    const dest = card('p1', { left: 100, top: 50, width: 160, height: 200 });
    capture.play();

    expect(mocks.fromTo).toHaveBeenCalledTimes(1);
    const [target, fromVars, toVars] = mocks.fromTo.mock.calls[0] as unknown as [Element, Record<string, unknown>, Record<string, unknown>];
    expect(target).toBe(dest);
    expect(fromVars).toMatchObject({ x: 200, y: 50, scaleX: 0.5, scaleY: 0.2, opacity: 0.35, transformOrigin: 'top left' });
    expect(toVars).toMatchObject({
      x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1,
      duration: motionTokens.morph.duration, ease: motionTokens.morph.ease
    });
    expect(toVars.clearProps).toContain('transform');
  });

  it('glides a neighbour card that reflowed', () => {
    card('p1', { left: 300, top: 0, width: 80, height: 40 });
    const neighbourRect = { left: 0, top: 100, width: 80, height: 40 };
    const neighbour = card('p2', neighbourRect);
    const capture = captureDockMorph('p1')!;
    document.querySelector('[data-flip-id="dock-card-p1"]')!.remove();
    card('p1', { left: 100, top: 0, width: 160, height: 200 });
    neighbourRect.top = 60;
    capture.play();

    expect(mocks.from).toHaveBeenCalledTimes(1);
    const [target, vars] = mocks.from.mock.calls[0] as unknown as [Element, Record<string, unknown>];
    expect(target).toBe(neighbour);
    expect(vars).toMatchObject({ x: 0, y: 40, duration: motionTokens.morph.duration });
  });

  it('finish() completes every tween instantly', () => {
    const source = card('p1', { left: 300, top: 0, width: 80, height: 40 });
    const capture = captureDockMorph('p1')!;
    source.remove();
    card('p1', { left: 100, top: 0, width: 160, height: 200 });
    const morph = capture.play()!;
    morph.finish();
    expect(mocks.fromTo.mock.results[0].value.progress).toHaveBeenCalledWith(1);
    expect(mocks.fromTo.mock.results[0].value.kill).toHaveBeenCalled();
  });

  it('play() returns null when the destination is missing', () => {
    const source = card('p1', { left: 0, top: 0, width: 10, height: 10 });
    const capture = captureDockMorph('p1')!;
    source.remove();
    expect(capture.play()).toBeNull();
    expect(mocks.fromTo).not.toHaveBeenCalled();
  });
});
