import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

const mocks = vi.hoisted(() => {
  const tween = { progress: vi.fn(() => tween), kill: vi.fn() };
  return { tween, to: vi.fn(() => mocks.tween) };
});
vi.mock('gsap', () => ({ default: { to: mocks.to } }));

import { useLayoutMorph } from './useLayoutMorph';
import { projectLayout } from '../layout/projection';
import type { TreeLayout } from '../layout/treeLayout';
import type { Point } from '../interactions/panZoom';

// Full CameraHandle mock. `center: null` (default) means "nothing framed yet",
// so the morph falls back to fitting the default-root family (animateFitTo).
function cam(animateFitTo = vi.fn(), center: Point | null = null) {
  return { animateFitTo, viewportCenterContent: () => center, recenterOn: vi.fn() };
}

function baseLayoutFixture(): TreeLayout {
  const nodes = [
    { id: 'a', generation: -1, x: -100, y: 0, year: 1872, role: 'root' as const, person: { id: 'a' } as never },
    { id: 'b', generation: 0, x: 0, y: 100, year: 1900, role: 'trunk' as const, person: { id: 'b' } as never }
  ];
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  return { nodes, links: [], scale: { minYear: 1872, maxYear: 1900, pxPerYear: 14 } as never, bounds, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}

function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') && reduced, media: q, addEventListener() {}, removeEventListener() {} }));
}

let scope: ReturnType<typeof effectScope>;
function run(fn: () => unknown) { scope = effectScope(); return scope.run(fn); }

beforeEach(() => stubMatchMedia(false));
afterEach(() => { scope?.stop(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('useLayoutMorph', () => {
  it('runs one layoutSwitch tween on an explicit toggle and glides the camera', async () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    const orientationExplicit = ref(true);
    const animateFitTo = vi.fn();
    const oak = ref(cam(animateFitTo));

    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit, oak }));
    orientation.value = 'horizontal';
    await nextTick();

    expect(mocks.to).toHaveBeenCalledTimes(1);
    expect((mocks.to.mock.calls[0] as unknown[])[1]).toMatchObject({ t: 1, ease: 'none' });
    expect(animateFitTo).toHaveBeenCalledTimes(1);
    expect((animateFitTo.mock.calls[0] as unknown[])[1]).toBeGreaterThan(0); // glide duration
  });

  it('preserves the focal person on an explicit flip — recenters its new position, no default fit', async () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    const animateFitTo = vi.fn();
    const recenterOn = vi.fn();
    // viewport centre sits on node 'b' in the current (vertical) layout
    const bVertical = projectLayout(base.value!, 'vertical').nodes.find(n => n.id === 'b')!;
    const oak = ref({ animateFitTo, viewportCenterContent: () => ({ x: bVertical.x, y: bVertical.y }), recenterOn });

    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak }));
    orientation.value = 'horizontal';
    await nextTick();

    const bHorizontal = projectLayout(base.value!, 'horizontal').nodes.find(n => n.id === 'b')!;
    expect(recenterOn).toHaveBeenCalledTimes(1);
    expect((recenterOn.mock.calls[0] as unknown[])[0]).toEqual({ x: bHorizontal.x, y: bHorizontal.y });
    expect(animateFitTo).not.toHaveBeenCalled(); // preserved, not re-fit to a default band
  });

  it('does NOT tween on a responsive (non-explicit) change but still re-fits instantly', async () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    const orientationExplicit = ref(false);
    const animateFitTo = vi.fn();
    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit, oak: ref(cam(animateFitTo)) }));

    orientation.value = 'horizontal';
    await nextTick();

    expect(mocks.to).not.toHaveBeenCalled();
    expect(animateFitTo).toHaveBeenCalledTimes(1);
    expect((animateFitTo.mock.calls[0] as unknown[])[1]).toBe(0); // snap (duration 0)
  });

  it('passes the default-root focal point to the responsive re-fit', async () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    // mark the first node as the default root so defaultRootFocal returns a point
    (base.value!.nodes[0].person as unknown as { isDefaultRoot: boolean }).isDefaultRoot = true;
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    const animateFitTo = vi.fn();
    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(false), oak: ref(cam(animateFitTo)) }));

    orientation.value = 'horizontal';
    await nextTick();

    expect(animateFitTo).toHaveBeenCalledTimes(1);
    // 3rd arg is the projected root position (the focal anchor), not undefined
    const focal = (animateFitTo.mock.calls[0] as unknown[])[2];
    expect(focal).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it('snaps (no tween) under reduced motion', async () => {
    stubMatchMedia(true);
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak: ref(cam()) }));

    orientation.value = 'horizontal';
    await nextTick();

    expect(mocks.to).not.toHaveBeenCalled();
  });

  it('finishes an in-flight morph before starting the next (rapid toggle)', async () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak: ref(cam()) }));

    orientation.value = 'horizontal';
    await nextTick();
    orientation.value = 'vertical';
    await nextTick();

    expect(mocks.tween.progress).toHaveBeenCalledWith(1);
    expect(mocks.tween.kill).toHaveBeenCalled();
    expect(mocks.to).toHaveBeenCalledTimes(2);
  });

  it('displayLayout equals the settled projection when idle', () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('horizontal');
    const out = run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak: ref(cam()) })) as ReturnType<typeof useLayoutMorph>;
    expect(out.displayLayout.value).toEqual(projectLayout(base.value!, 'horizontal'));
  });

  it('onUpdate drives progress to a blended displayLayout; onComplete settles it', async () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    const out = run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak: ref(cam()) })) as ReturnType<typeof useLayoutMorph>;
    orientation.value = 'horizontal';
    await nextTick();

    const [proxy, cfg] = mocks.to.mock.calls[0] as unknown as [{ t: number }, { onUpdate: () => void; onComplete: () => void }];
    proxy.t = 0.5;
    cfg.onUpdate();
    expect(out.morphProgress.value).toBe(0.5);
    // mid-morph the display is a blend, not yet the settled horizontal projection
    expect(out.displayLayout.value).not.toEqual(projectLayout(base.value!, 'horizontal'));

    cfg.onComplete();
    expect(out.morphing.value).toBe(false);
    expect(out.displayLayout.value).toEqual(projectLayout(base.value!, 'horizontal'));
  });

  it('branchOrientation holds the OLD orientation through the first half, then flips', async () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    const out = run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak: ref(cam()) })) as ReturnType<typeof useLayoutMorph>;
    orientation.value = 'horizontal';
    await nextTick();

    const [proxy, cfg] = mocks.to.mock.calls[0] as unknown as [{ t: number }, { onUpdate: () => void }];
    proxy.t = 0.3; cfg.onUpdate();
    expect(out.branchOrientation.value).toBe('vertical');   // old form while fading out
    proxy.t = 0.7; cfg.onUpdate();
    expect(out.branchOrientation.value).toBe('horizontal');  // new form past the hidden midpoint
  });

  it('does nothing when orientation changes while the base layout is null', async () => {
    const base = ref<TreeLayout | null>(null);
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    const animateFitTo = vi.fn();
    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak: ref(cam(animateFitTo)) }));
    orientation.value = 'horizontal';
    await nextTick();

    expect(mocks.to).not.toHaveBeenCalled();
    expect(animateFitTo).not.toHaveBeenCalled();
  });

  it('onInterrupt clears morphing so displayLayout never sticks on a blend', async () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    const out = run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak: ref(cam()) })) as ReturnType<typeof useLayoutMorph>;
    orientation.value = 'horizontal';
    await nextTick();

    const [, cfg] = mocks.to.mock.calls[0] as unknown as [unknown, { onInterrupt: () => void }];
    cfg.onInterrupt();
    expect(out.morphing.value).toBe(false);
    expect(out.displayLayout.value).toEqual(projectLayout(base.value!, 'horizontal'));
  });
});
