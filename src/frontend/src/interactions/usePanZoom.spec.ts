import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defineComponent, ref, h } from 'vue';
import { mount } from '@vue/test-utils';
import { usePanZoom } from './usePanZoom';
import type { Bounds } from './panZoom';

// Mock the GSAP camera engine so tests don't depend on real GSAP tweens.
const { to } = vi.hoisted(() => ({ to: vi.fn() }));
vi.mock('gsap', () => ({ default: { to } }));

function host(bounds: Bounds | null, initialBounds: Bounds | null = null) {
  const api: { current?: ReturnType<typeof usePanZoom> } = {};
  const Comp = defineComponent({
    setup() {
      const boundsRef = ref<Bounds | null>(bounds);
      const initialBoundsRef = ref<Bounds | null>(initialBounds);
      const pz = usePanZoom({ boundsRef, initialBoundsRef, padding: 40 });
      api.current = pz;
      return () => h('svg', { ref: pz.svgRef });
    }
  });
  const wrapper = mount(Comp);
  return { wrapper, pz: api.current! };
}

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  to.mockReset().mockReturnValue({ kill: vi.fn() });
});

describe('usePanZoom', () => {
  it('starts at identity transform before any interaction or measurement', () => {
    const { pz } = host(null);
    expect(pz.transform.value).toBe('translate(0,0) scale(1)');
  });

  it('pans by pointer drag delta', () => {
    const { pz } = host(null);
    pz.onPointerDown({ clientX: 100, clientY: 100, button: 0, preventDefault() {} } as PointerEvent);
    pz.onPointerMove({ clientX: 130, clientY: 90, preventDefault() {} } as PointerEvent);
    pz.onPointerUp({} as PointerEvent);
    expect(pz.viewport.value.x).toBe(30);
    expect(pz.viewport.value.y).toBe(-10);
    expect(pz.dragMoved.value).toBe(true);
  });

  it('zooms toward the cursor on wheel', () => {
    const { pz } = host(null);
    const before = pz.viewport.value.k;
    pz.onWheel({ deltaY: -100, clientX: 400, clientY: 300, preventDefault() {} } as WheelEvent);
    expect(pz.viewport.value.k).toBeGreaterThan(before);
  });

  it('does not flag a drag for a click without movement', () => {
    const { pz } = host(null);
    pz.onPointerDown({ clientX: 50, clientY: 50, button: 0, preventDefault() {} } as PointerEvent);
    pz.onPointerUp({} as PointerEvent);
    expect(pz.dragMoved.value).toBe(false);
  });

  it('captures the pointer only after a drag passes the threshold, not on a plain press', () => {
    const { pz } = host(null);
    const captureSpy = vi.fn();
    (pz.svgRef.value as unknown as { setPointerCapture: typeof captureSpy }).setPointerCapture = captureSpy;

    // A plain press must NOT capture — capturing retargets the click off the node,
    // which would break node selection (a real-browser regression unit-click can't see).
    pz.onPointerDown({ clientX: 100, clientY: 100, button: 0, pointerId: 7, preventDefault() {} } as PointerEvent);
    expect(captureSpy).not.toHaveBeenCalled();

    // Once the drag passes the threshold, capture so panning keeps tracking outside the SVG.
    pz.onPointerMove({ clientX: 140, clientY: 100, pointerId: 7, preventDefault() {} } as PointerEvent);
    expect(captureSpy).toHaveBeenCalledWith(7);
  });

  it('pans with a single touch by the finger delta', () => {
    const { pz } = host(null);
    pz.onTouchStart({ touches: [{ identifier: 1, clientX: 100, clientY: 100 }] } as unknown as TouchEvent);
    pz.onTouchMove({ touches: [{ identifier: 1, clientX: 140, clientY: 120 }], preventDefault() {} } as unknown as TouchEvent);
    expect(pz.viewport.value.x).toBe(40);
    expect(pz.viewport.value.y).toBe(20);
  });

  it('zooms with a two-finger pinch by the distance ratio', () => {
    const { pz } = host(null);
    pz.onTouchStart({
      touches: [
        { identifier: 1, clientX: 100, clientY: 100 },
        { identifier: 2, clientX: 200, clientY: 100 }
      ]
    } as unknown as TouchEvent);
    // fingers spread from 100px apart to 200px apart → factor 2 → k doubles
    pz.onTouchMove({
      touches: [
        { identifier: 1, clientX: 50, clientY: 100 },
        { identifier: 2, clientX: 250, clientY: 100 }
      ],
      preventDefault() {}
    } as unknown as TouchEvent);
    expect(pz.viewport.value.k).toBeCloseTo(2);
  });

  it('initial fit frames the provided initialBounds rather than the full bounds', () => {
    const { pz } = host(
      { minX: 0, maxX: 1000, minY: 0, maxY: 1000 },
      { minX: 0, maxX: 100, minY: 0, maxY: 100 }
    );
    (pz.svgRef.value as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      () => ({ width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;

    pz.fit();

    // fitToBounds({0..100}, {200,200}, 40): k = (200-80)/100 = 1.2; centre 50 -> x = 100 - 60 = 40
    expect(pz.viewport.value).toEqual({ x: 40, y: 40, k: 1.2 });
  });

  it('initial fit falls back to the full bounds when no initialBounds is given', () => {
    const { pz } = host({ minX: 0, maxX: 1000, minY: 0, maxY: 1000 });
    (pz.svgRef.value as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      () => ({ width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;

    pz.fit();

    expect(pz.viewport.value.k).toBeCloseTo(0.12); // (200-80)/1000
  });

  function stubRect(pz: ReturnType<typeof usePanZoom>, width = 200, height = 200): void {
    (pz.svgRef.value as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      () => ({ width, height, left: 0, top: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} }) as DOMRect;
  }

  it('centerOnPoint jumps instantly when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {}
    }));
    const { pz } = host(null);
    stubRect(pz);

    pz.centerOnPoint({ x: 30, y: 40 });

    // rect 200x200, k=1 (>= 0.8 keeps the zoom): x = 100 - 30, y = 100 - 40
    expect(pz.viewport.value).toEqual({ x: 70, y: 60, k: 1 });
    vi.unstubAllGlobals();
  });

  it('centerOnPoint delegates the glide to the GSAP camera engine', () => {
    const killSpy = vi.fn();
    to.mockReturnValue({ kill: killSpy });
    const { pz } = host(null);
    stubRect(pz);

    pz.centerOnPoint({ x: 60, y: 40 }); // target: {x: 40, y: 60, k: 1}

    expect(to).toHaveBeenCalledOnce();
    const [, vars] = to.mock.calls[0] as [unknown, { x: number; y: number; k: number }];
    expect(vars).toMatchObject({ x: 40, y: 60, k: 1 });
  });

  it('a pointer press cancels an in-flight glide', () => {
    const killSpy = vi.fn();
    to.mockReturnValue({ kill: killSpy });
    const { pz } = host(null);
    stubRect(pz);

    pz.centerOnPoint({ x: 60, y: 40 });
    pz.onPointerDown({ clientX: 10, clientY: 10, button: 0, preventDefault() {} } as PointerEvent);

    expect(killSpy).toHaveBeenCalledOnce();
  });

  it('a manual fit still repositions after a glide', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {}
    }));
    const { pz } = host({ minX: 0, maxX: 1000, minY: 0, maxY: 1000 });
    stubRect(pz);

    pz.centerOnPoint({ x: 30, y: 40 });
    const after = { ...pz.viewport.value };
    pz.fit(); // a manual fit still works…
    expect(pz.viewport.value).not.toEqual(after);
    vi.unstubAllGlobals();
  });
});
