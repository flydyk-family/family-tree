// src/frontend/src/motion/entrance.spec.ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { Viewport } from '../interactions/panZoom';
import type { EntranceCues } from './entranceCues';
import { playEntrance } from './entrance';

const mocks = vi.hoisted(() => {
  const timeline = {
    to: vi.fn(function (this: unknown) { return this; }),
    progress: vi.fn(),
    kill: vi.fn()
  };
  return {
    timeline,
    timelineFactory: vi.fn(() => timeline),
    set: vi.fn(),
    killTweensOf: vi.fn()
  };
});
vi.mock('gsap', () => ({
  default: { timeline: mocks.timelineFactory, set: mocks.set, killTweensOf: mocks.killTweensOf }
}));

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: media.includes('prefers-reduced-motion') && matches,
    media,
    addEventListener() {},
    removeEventListener() {}
  }));
}

const cues: EntranceCues = {
  rideK: 0.8,
  rideX: 40,
  dawnX: 0,
  phases: [
    { generation: -1, nodeIds: ['gp'], drawLinkIds: [], fadeLinkIds: [], bandY: 800, cameraY: -340, year: 1850, start: 0, duration: 0.6 },
    { generation: 0, nodeIds: ['fo'], drawLinkIds: ['d:gp->fo'], fadeLinkIds: [], bandY: 400, cameraY: -20, year: 1910, start: 0.6, duration: 0.6 }
  ],
  strata: [
    { year: 1850, label: '1850', y: 820, side: 'right', rideX: 860, finalX: 1020, start: 0 },
    { year: 1910, label: '1910', y: 420, side: 'left', rideX: -60, finalX: -180, start: 0.6 }
  ],
  finale: { x: 10, y: -5, k: 0.6 },
  finaleStart: 1.2,
  finaleDuration: 0.8,
  total: 2
};

const fakeSvg = { querySelectorAll: () => [] } as unknown as SVGSVGElement;

beforeEach(() => {
  mocks.timelineFactory.mockClear();
  mocks.timeline.to.mockClear();
  mocks.timeline.progress.mockClear();
  mocks.timeline.kill.mockClear();
  mocks.set.mockClear();
  mocks.killTweensOf.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('playEntrance', () => {
  it('under reduced motion: jumps to the finale, reports done, builds no timeline', () => {
    stubMatchMedia(true);
    const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
    const onDone = vi.fn();
    const handle = playEntrance({ svg: fakeSvg, viewport, cues, onDone });
    expect(handle).toBeNull();
    expect(viewport.value).toEqual(cues.finale);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mocks.timelineFactory).not.toHaveBeenCalled();
  });

  it('starts the camera at the oldest band and finishes on the finale via onComplete', () => {
    stubMatchMedia(false);
    const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
    const onDone = vi.fn();
    const handle = playEntrance({ svg: fakeSvg, viewport, cues, onDone });
    expect(handle).not.toBeNull();
    // camera snapped to the ride start before the timeline runs
    expect(viewport.value).toEqual({ x: cues.rideX, y: cues.phases[0].cameraY, k: cues.rideK });
    // camera beats: one tween per phase + the step-back
    const allToCalls = mocks.timeline.to.mock.calls as unknown[][];
    const cameraTweens = allToCalls.filter(call => call[0] && typeof call[0] === 'object' && 'k' in (call[0] as object));
    expect(cameraTweens).toHaveLength(cues.phases.length + 1);
    // completing the timeline lands exactly on the finale and reports done
    const factoryCalls = mocks.timelineFactory.mock.calls as unknown[][];
    const config = factoryCalls[0][0] as { onComplete: () => void };
    config.onComplete();
    expect(viewport.value).toEqual(cues.finale);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('skip() renders the end state immediately', () => {
    stubMatchMedia(false);
    const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
    const handle = playEntrance({ svg: fakeSvg, viewport, cues, onDone: vi.fn() })!;
    handle.skip();
    expect(mocks.timeline.progress).toHaveBeenCalledWith(1, false);
    expect(mocks.timeline.kill).toHaveBeenCalled();
  });
});
