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
    const oak = ref({ animateFitTo });

    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit, oak }));
    orientation.value = 'horizontal';
    await nextTick();

    expect(mocks.to).toHaveBeenCalledTimes(1);
    expect((mocks.to.mock.calls[0] as unknown[])[1]).toMatchObject({ t: 1, ease: 'none' });
    expect(animateFitTo).toHaveBeenCalledTimes(1);
    expect((animateFitTo.mock.calls[0] as unknown[])[1]).toBeGreaterThan(0); // glide duration
  });

  it('does NOT tween on a responsive (non-explicit) change but still re-fits instantly', async () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    const orientationExplicit = ref(false);
    const animateFitTo = vi.fn();
    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit, oak: ref({ animateFitTo }) }));

    orientation.value = 'horizontal';
    await nextTick();

    expect(mocks.to).not.toHaveBeenCalled();
    expect(animateFitTo).toHaveBeenCalledWith(expect.anything(), 0); // snap
  });

  it('snaps (no tween) under reduced motion', async () => {
    stubMatchMedia(true);
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak: ref({ animateFitTo: vi.fn() }) }));

    orientation.value = 'horizontal';
    await nextTick();

    expect(mocks.to).not.toHaveBeenCalled();
  });

  it('finishes an in-flight morph before starting the next (rapid toggle)', async () => {
    const base = ref<TreeLayout | null>(baseLayoutFixture());
    const orientation = ref<'vertical' | 'horizontal'>('vertical');
    run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak: ref({ animateFitTo: vi.fn() }) }));

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
    const out = run(() => useLayoutMorph({ baseLayout: base, orientation, orientationExplicit: ref(true), oak: ref({ animateFitTo: vi.fn() }) })) as ReturnType<typeof useLayoutMorph>;
    expect(out.displayLayout.value).toEqual(projectLayout(base.value!, 'horizontal'));
  });
});
