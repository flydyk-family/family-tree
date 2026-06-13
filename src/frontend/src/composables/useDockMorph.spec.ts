import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

// Mock the motion seam so we assert orchestration, not GSAP.
const mocks = vi.hoisted(() => {
  const finish = vi.fn();
  const play = vi.fn(() => ({ finish }));
  const capture = { play };
  return { finish, play, capture, captureDockMorph: vi.fn(() => capture) };
});
vi.mock('../motion/popupDock', () => ({ captureDockMorph: mocks.captureDockMorph }));

import { useDockMorph } from './useDockMorph';
import { usePanelStore } from '../stores/panelStore';

beforeEach(() => {
  setActivePinia(createPinia());
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('useDockMorph', () => {
  it('undock: mutates the store synchronously, then plays after the DOM patch', async () => {
    const panel = usePanelStore();
    panel.openPerson('p1');
    const undockSpy = vi.spyOn(panel, 'undock');
    const { undock } = useDockMorph();

    const done = undock('p1');
    // State-first: the mutation is already applied before any await.
    expect(undockSpy).toHaveBeenCalledWith('p1');
    expect(panel.biggerViewId).toBe('p1');
    // Capture happened before the mutation; play has NOT run yet (waits a tick).
    expect(mocks.captureDockMorph).toHaveBeenCalledTimes(1);
    expect(mocks.play).not.toHaveBeenCalled();

    await done;
    expect(mocks.play).toHaveBeenCalledTimes(1);
  });

  it('dock: routes through closeBiggerView and plays', async () => {
    const panel = usePanelStore();
    panel.openPerson('p1');
    panel.openBiggerView('p1');
    const closeSpy = vi.spyOn(panel, 'closeBiggerView');
    const { dock } = useDockMorph();

    await dock();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(panel.biggerViewId).toBeNull();
    expect(mocks.play).toHaveBeenCalledTimes(1);
  });

  it('a second morph finishes the in-flight one instantly first', async () => {
    const panel = usePanelStore();
    panel.openPerson('p1');
    const { undock, dock } = useDockMorph();

    await undock('p1');
    expect(mocks.finish).not.toHaveBeenCalled();

    await dock();
    // The first morph's handle was finished before the second captured.
    expect(mocks.finish).toHaveBeenCalledTimes(1);
    expect(mocks.play).toHaveBeenCalledTimes(2);
  });

  it('under reduced motion (capture returns null) it still mutates, never plays', async () => {
    mocks.captureDockMorph.mockReturnValueOnce(null);
    const panel = usePanelStore();
    panel.openPerson('p1');
    const { undock } = useDockMorph();

    await undock('p1');
    expect(panel.biggerViewId).toBe('p1');
    expect(mocks.play).not.toHaveBeenCalled();
  });
});
