import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => {
  const finish = vi.fn();
  const play = vi.fn(() => ({ finish }));
  const capture = { play };
  const growPlay = vi.fn(() => ({ finish }));
  const growCapture = { play: growPlay };
  return {
    finish, play, capture, captureDockMorph: vi.fn((_id: string): unknown => capture),
    growPlay, growCapture, captureGrowMorph: vi.fn((_el: Element): unknown => growCapture)
  };
});
vi.mock('../motion/popupDock', () => ({ captureDockMorph: mocks.captureDockMorph, captureGrowMorph: mocks.captureGrowMorph }));

import { useDockMorph } from './useDockMorph';
import { usePanelStore } from '../stores/panelStore';

beforeEach(() => { setActivePinia(createPinia()); });
afterEach(() => { vi.clearAllMocks(); });

describe('useDockMorph', () => {
  it('undock: captures with the id, mutates synchronously, plays after the tick', async () => {
    const panel = usePanelStore();
    panel.openPerson('p1');
    const undockSpy = vi.spyOn(panel, 'undock');
    const { undock } = useDockMorph();

    const done = undock('p1');
    expect(mocks.captureDockMorph).toHaveBeenCalledWith('p1');
    expect(undockSpy).toHaveBeenCalledWith('p1');
    expect(panel.biggerViewId).toBe('p1');
    expect(mocks.play).not.toHaveBeenCalled();

    await done;
    expect(mocks.play).toHaveBeenCalledTimes(1);
  });

  it('dock: captures with the CURRENT biggerViewId (read before mutate), then plays', async () => {
    const panel = usePanelStore();
    panel.openPerson('p1');
    panel.openBiggerView('p1');
    const { dock } = useDockMorph();

    await dock();
    expect(mocks.captureDockMorph).toHaveBeenCalledWith('p1');
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

  it('dock with no open popup does not capture', async () => {
    const { dock } = useDockMorph();
    await dock();
    expect(mocks.captureDockMorph).not.toHaveBeenCalled();
  });

  it('openFrom: captures from the source element, opens the bigger view, plays after the tick', async () => {
    const panel = usePanelStore();
    panel.openPerson('p1');
    const openSpy = vi.spyOn(panel, 'openBiggerView');
    const source = document.createElement('div');
    const { openFrom } = useDockMorph();

    const done = openFrom('p1', source);
    expect(mocks.captureGrowMorph).toHaveBeenCalledWith(source);
    expect(openSpy).toHaveBeenCalledWith('p1');
    expect(panel.biggerViewId).toBe('p1');
    expect(mocks.growPlay).not.toHaveBeenCalled();

    await done;
    expect(mocks.growPlay).toHaveBeenCalledWith('p1');
  });

  it('openFrom: a second open finishes the in-flight morph first', async () => {
    const panel = usePanelStore();
    panel.openPerson('p1');
    const { openFrom } = useDockMorph();
    await openFrom('p1', document.createElement('div'));
    expect(mocks.finish).not.toHaveBeenCalled();
    await openFrom('p1', document.createElement('div'));
    expect(mocks.finish).toHaveBeenCalledTimes(1);
  });

  it('openFrom: with no source element it still opens, never plays', async () => {
    const panel = usePanelStore();
    panel.openPerson('p1');
    const { openFrom } = useDockMorph();
    await openFrom('p1', null);
    expect(panel.biggerViewId).toBe('p1');
    expect(mocks.captureGrowMorph).not.toHaveBeenCalled();
    expect(mocks.growPlay).not.toHaveBeenCalled();
  });

  it('openFrom: under reduced motion (capture null) it still opens, never plays', async () => {
    mocks.captureGrowMorph.mockReturnValueOnce(null);
    const panel = usePanelStore();
    panel.openPerson('p1');
    const { openFrom } = useDockMorph();
    await openFrom('p1', document.createElement('div'));
    expect(panel.biggerViewId).toBe('p1');
    expect(mocks.growPlay).not.toHaveBeenCalled();
  });
});
