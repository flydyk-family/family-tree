import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => {
  const finish = vi.fn();
  const play = vi.fn(() => ({ finish }));
  const capture = { play };
  return { finish, play, capture, captureDockMorph: vi.fn((_id: string): unknown => capture) };
});
vi.mock('../motion/popupDock', () => ({ captureDockMorph: mocks.captureDockMorph }));

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
});
