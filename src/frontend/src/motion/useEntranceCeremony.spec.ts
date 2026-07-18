// src/frontend/src/motion/useEntranceCeremony.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick, ref } from 'vue';
import { buildLayout, type TreeLayout } from '../layout/treeLayout';
import { projectLayout } from '../layout/projection';
import type { Viewport } from '../interactions/panZoom';
import { useEntranceCeremony, ENTRANCE_PLAYED_KEY } from './useEntranceCeremony';
import type { FamilyGraph, PersonSummary } from '../types/family';

const { playEntranceMock } = vi.hoisted(() => ({
  playEntranceMock: vi.fn()
}));
vi.mock('./entrance', () => ({ playEntrance: playEntranceMock }));

function person(id: string, birthYear: number, parents: Partial<PersonSummary['parents']> = {}): PersonSummary {
  return {
    id,
    givenName: { ru: id, be: null, en: id },
    surname: { ru: null, be: null, en: null },
    maidenName: null, middleName: null,
    sex: 'male',
    birthYear,
    deathYear: null,
    vocation: 'other',
    portrait: null,
    portraitVideo: null,
    parents: { motherId: null, fatherId: null, ...parents },
    marriedIntoFamily: false,
    isDefaultRoot: false
  };
}

const graph: FamilyGraph = {
  people: [person('gp', 1850), person('fo', 1910, { fatherId: 'gp' })],
  unions: [{ id: 'u1', partnerIds: ['gp'], marriageYear: null, childIds: ['fo'] }]
};

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; }
  } as Storage;
}

function fakeOak() {
  const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
  const svg = {
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 800, height: 600 })
  } as unknown as SVGSVGElement;
  return { entranceTargets: () => ({ svg, viewport }) };
}

function harness(opts: { deepLink?: boolean; orientation?: 'vertical' | 'horizontal'; storage?: Storage; initialLayout?: TreeLayout } = {}) {
  const storage = opts.storage ?? fakeStorage();
  const layout = ref<TreeLayout | null>(opts.initialLayout ?? null);
  const orientation = ref<'vertical' | 'horizontal'>(opts.orientation ?? 'vertical');
  const oak = ref<ReturnType<typeof fakeOak> | null>(null);
  const ceremony = useEntranceCeremony({
    layout,
    orientation,
    oak,
    isDeepLink: () => opts.deepLink ?? false,
    storage
  });
  return { storage, layout, orientation, oak, ceremony };
}

beforeEach(() => {
  playEntranceMock.mockReset().mockReturnValue({ skip: vi.fn() });
});

describe('useEntranceCeremony', () => {
  it('auto-plays once when oak and layout become ready, and marks the session', async () => {
    const h = harness();
    h.layout.value = buildLayout(graph, { focusId: 'fo' });
    h.oak.value = fakeOak();
    await nextTick(); // watcher (post flush)
    await nextTick(); // strata render tick before playEntrance
    expect(playEntranceMock).toHaveBeenCalledTimes(1);
    expect(h.storage.getItem(ENTRANCE_PLAYED_KEY)).toBe('1');
    expect(h.ceremony.active.value).toBe(true);
  });

  it('does not auto-play again in the same session, but replay() forces it', async () => {
    const storage = fakeStorage();
    storage.setItem(ENTRANCE_PLAYED_KEY, '1');
    const h = harness({ storage });
    h.layout.value = buildLayout(graph, { focusId: 'fo' });
    h.oak.value = fakeOak();
    await nextTick();
    await nextTick();
    expect(playEntranceMock).not.toHaveBeenCalled();
    h.ceremony.replay();
    await nextTick();
    expect(playEntranceMock).toHaveBeenCalledTimes(1);
  });

  it('a deep link marks the session played without playing', async () => {
    const h = harness({ deepLink: true });
    h.layout.value = buildLayout(graph, { focusId: 'fo' });
    h.oak.value = fakeOak();
    await nextTick();
    await nextTick();
    expect(playEntranceMock).not.toHaveBeenCalled();
    expect(h.storage.getItem(ENTRANCE_PLAYED_KEY)).toBe('1');
  });

  it('horizontal orientation plays the ceremony and offers replay', async () => {
    // Mirror the app: pass a horizontally-projected layout so buildEntranceCues
    // receives consistent coordinates for the horizontal axis.
    const baseLayout = buildLayout(graph, { focusId: 'fo' });
    const horizontalLayout = projectLayout(baseLayout, 'horizontal');
    const h = harness({ orientation: 'horizontal', initialLayout: horizontalLayout });
    h.oak.value = fakeOak();
    await nextTick(); // watcher (post flush)
    await nextTick(); // strata render tick before playEntrance
    expect(playEntranceMock).toHaveBeenCalledTimes(1);
    expect(h.storage.getItem(ENTRANCE_PLAYED_KEY)).toBe('1');
    expect(h.ceremony.active.value).toBe(true);
    // canReplay is only true once the ceremony ends; simulate done
    const ctx = playEntranceMock.mock.calls[0][0] as { onDone: () => void };
    ctx.onDone();
    expect(h.ceremony.canReplay.value).toBe(true);
  });

  it('clears active and cues when the ceremony reports done', async () => {
    const h = harness();
    h.layout.value = buildLayout(graph, { focusId: 'fo' });
    h.oak.value = fakeOak();
    await nextTick();
    await nextTick();
    const ctx = playEntranceMock.mock.calls[0][0] as { onDone: () => void };
    ctx.onDone();
    expect(h.ceremony.active.value).toBe(false);
    expect(h.ceremony.cues.value).toBeNull();
  });

  it('skip() is a safe no-op when nothing is playing', () => {
    const h = harness();
    expect(() => h.ceremony.skip()).not.toThrow();
  });

  it('does not start a second ceremony while one is already active', async () => {
    const h = harness();
    h.layout.value = buildLayout(graph, { focusId: 'fo' });
    h.oak.value = fakeOak();
    await nextTick();
    await nextTick();
    expect(playEntranceMock).toHaveBeenCalledTimes(1);
    expect(h.ceremony.active.value).toBe(true);

    h.ceremony.replay(); // start() while active → guarded no-op
    await nextTick();
    expect(playEntranceMock).toHaveBeenCalledTimes(1);
  });

  it('marks the session played but does not play when the oak exposes no svg', async () => {
    const viewport = ref<Viewport>({ x: 0, y: 0, k: 1 });
    const oakNoSvg = { entranceTargets: () => ({ svg: null, viewport }) };
    const h = harness();
    h.layout.value = buildLayout(graph, { focusId: 'fo' });
    h.oak.value = oakNoSvg as unknown as ReturnType<typeof fakeOak>;
    await nextTick();
    await nextTick();
    expect(playEntranceMock).not.toHaveBeenCalled();
    expect(h.storage.getItem(ENTRANCE_PLAYED_KEY)).toBe('1');
  });

  it('aborts before playing if the view unmounts between start and the render tick', async () => {
    const h = harness();
    h.layout.value = buildLayout(graph, { focusId: 'fo' });
    h.oak.value = fakeOak();
    await nextTick(); // post-flush watcher → start() sets active and queues the play
    expect(h.ceremony.active.value).toBe(true);
    h.ceremony.active.value = false; // simulate unmount / cancel before the play tick
    await nextTick(); // queued tick sees !active and bails out
    expect(playEntranceMock).not.toHaveBeenCalled();
  });
});
