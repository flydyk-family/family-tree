import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defineComponent, ref, h, nextTick } from 'vue';
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

let resizeCb: (() => void) | null = null;
beforeEach(() => {
  resizeCb = null;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    constructor(cb: () => void) { resizeCb = cb; }
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

  it('coalesces multiple pointer-move deltas into a single viewport update per animation frame', () => {
    const raf = vi.fn((_cb: FrameRequestCallback): number => 1);
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    try {
      const { pz } = host(null);
      pz.onPointerDown({ clientX: 100, clientY: 100, button: 0, preventDefault() {} } as PointerEvent);
      pz.onPointerMove({ clientX: 130, clientY: 100, preventDefault() {} } as PointerEvent); // dx 30
      pz.onPointerMove({ clientX: 150, clientY: 100, preventDefault() {} } as PointerEvent); // dx 20
      // deferred: viewport unchanged, exactly one frame scheduled for both moves
      expect(pz.viewport.value.x).toBe(0);
      expect(raf).toHaveBeenCalledTimes(1);
      // the frame applies the summed delta once
      raf.mock.calls[0][0](0);
      expect(pz.viewport.value.x).toBe(50);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('flags isPanning only while a real drag is in flight', () => {
    const { pz } = host(null);
    expect(pz.isPanning.value).toBe(false);
    pz.onPointerDown({ clientX: 100, clientY: 100, button: 0, preventDefault() {} } as PointerEvent);
    expect(pz.isPanning.value).toBe(false); // a plain press is not yet a pan
    pz.onPointerMove({ clientX: 140, clientY: 100, preventDefault() {} } as PointerEvent); // past threshold
    expect(pz.isPanning.value).toBe(true);
    pz.onPointerUp({} as PointerEvent);
    expect(pz.isPanning.value).toBe(false);
  });

  it('zooms toward the cursor on wheel', () => {
    const { pz } = host(null);
    const before = pz.viewport.value.k;
    pz.onWheel({ deltaY: -100, clientX: 400, clientY: 300, preventDefault() {} } as WheelEvent);
    expect(pz.viewport.value.k).toBeGreaterThan(before);
  });

  it('lets a tree too large for the default min zoom out below it, without snapping on first zoom', () => {
    const { pz } = host({ minX: 0, maxX: 10000, minY: 0, maxY: 10000 });
    (pz.svgRef.value as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      () => ({ width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;
    pz.fit(); // (200-80)/10000 = 0.012, far below the default min of 0.2
    const fitK = pz.viewport.value.k;
    expect(fitK).toBeCloseTo(0.012);
    // a first zoom must stay near the fit scale, NOT snap up to the default min (the bug)
    pz.onWheel({ deltaY: -10, clientX: 100, clientY: 100, preventDefault() {} } as WheelEvent);
    expect(pz.viewport.value.k).toBeGreaterThan(fitK);
    expect(pz.viewport.value.k).toBeLessThan(0.05);
  });

  it('flags isPanning during wheel zoom so the view can shed paint, clearing after idle', () => {
    vi.useFakeTimers();
    try {
      const { pz } = host(null);
      pz.onWheel({ deltaY: -100, clientX: 100, clientY: 100, preventDefault() {} } as WheelEvent);
      expect(pz.isPanning.value).toBe(true);
      vi.advanceTimersByTime(250);
      expect(pz.isPanning.value).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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

  it('reports the content point under the viewport centre (inverse transform)', () => {
    const { pz } = host(null);
    (pz.svgRef.value as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      () => ({ width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;
    pz.viewport.value = { x: 50, y: 0, k: 2 };
    expect(pz.viewportCenterContent()).toEqual({ x: 25, y: 50 });
  });

  it('recenterOn frames a point at the viewport centre without changing zoom', () => {
    const { pz } = host(null);
    (pz.svgRef.value as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      () => ({ width: 200, height: 200, left: 0, top: 0, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;
    pz.viewport.value = { x: 0, y: 0, k: 2 };
    pz.recenterOn({ x: 25, y: 50 }, 0); // snap (duration 0)
    expect(pz.viewport.value).toEqual({ x: 50, y: 0, k: 2 }); // centred, zoom (k=2) preserved
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

  it('a resize during a reorient does NOT re-fit — before the glide starts or during it', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    const { pz } = host({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    stubRect(pz, 200, 200);
    pz.fit();
    const framed = { ...pz.viewport.value };

    // The layout-switch morph requests a reorient; the orientation flip repositions
    // the time rail and resizes the SVG.
    pz.animateFitTo({ minX: 0, maxX: 50, minY: 0, maxY: 50 }, 0.7);
    stubRect(pz, 400, 400);

    // Before the (deferred) glide starts, the cameraBusy flag must already suppress it.
    resizeCb?.();
    expect(pz.viewport.value).toEqual(framed);

    // And once the glide is in flight, it stays suppressed.
    await nextTick();
    resizeCb?.();
    expect(pz.viewport.value).toEqual(framed);
    vi.unstubAllGlobals();
  });

  it('a bounds change during a camera glide does NOT re-fit', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    const boundsRef = ref<Bounds | null>({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    let pz!: ReturnType<typeof usePanZoom>;
    mount(defineComponent({ setup() { pz = usePanZoom({ boundsRef, padding: 40 }); return () => h('svg', { ref: pz.svgRef }); } }));
    stubRect(pz, 200, 200);
    pz.fit();
    const framed = { ...pz.viewport.value };

    pz.animateFitTo({ minX: 0, maxX: 50, minY: 0, maxY: 50 }, 0.7);
    boundsRef.value = { minX: 0, maxX: 400, minY: 0, maxY: 400 }; // a blended-bounds frame
    await nextTick();

    expect(pz.viewport.value).toEqual(framed);
    vi.unstubAllGlobals();
  });

  it('resumes the auto re-fit once the camera glide completes', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    const { pz } = host({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    stubRect(pz, 200, 200);
    pz.fit();
    const framed = { ...pz.viewport.value };

    pz.animateFitTo({ minX: 0, maxX: 50, minY: 0, maxY: 50 }, 0.7);
    await nextTick(); // the glide is deferred a tick so it frames the post-reflow size
    // Complete the glide (gsap is mocked): fire the onComplete glideTo handed to gsap.to.
    const vars = to.mock.calls[to.mock.calls.length - 1][1] as { onComplete?: () => void };
    vars.onComplete?.();

    stubRect(pz, 400, 400);
    resizeCb?.();
    expect(pz.viewport.value).not.toEqual(framed); // glide done → auto re-fit resumes
    vi.unstubAllGlobals();
  });

  it('frames the glide target from the post-reflow dimensions, not the call-time ones', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    const { pz } = host({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    stubRect(pz, 200, 200);

    // The orientation flip resizes the SVG (rail moves side→bottom); animateFitTo is
    // called BEFORE that reflow, so it must read the rect a tick later — once the new
    // dimensions are in effect — or the camera ends mis-framed and the auto-fit snaps.
    pz.animateFitTo({ minX: 0, maxX: 50, minY: 0, maxY: 50 }, 0.7);
    stubRect(pz, 400, 400); // the reflow lands after the synchronous call
    await nextTick();

    // fitToBounds({0..50}, 400×400, pad 40): k = (400-80)/50 = 6.4; centre 25 → x = 200-160 = 40
    const [, vars] = to.mock.calls[to.mock.calls.length - 1] as [unknown, { x: number; y: number; k: number }];
    expect(vars).toMatchObject({ x: 40, y: 40, k: 6.4 });
    vi.unstubAllGlobals();
  });

  it('a snap reorient (duration 0) clears cameraBusy so the auto re-fit resumes', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    const { pz } = host({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    stubRect(pz, 200, 200);

    pz.animateFitTo({ minX: 0, maxX: 50, minY: 0, maxY: 50 }, 0); // instant switch (reduced motion / responsive)
    await nextTick();                                            // glideTo snaps, returns null → cameraBusy cleared
    const snapped = { ...pz.viewport.value };

    stubRect(pz, 400, 400);
    resizeCb?.();
    expect(pz.viewport.value).not.toEqual(snapped); // not stuck busy → re-fits
    vi.unstubAllGlobals();
  });

  it('a pan before the deferred glide pre-empts the reorient', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    const { pz } = host({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    stubRect(pz, 200, 200);

    pz.animateFitTo({ minX: 0, maxX: 50, minY: 0, maxY: 50 }, 0.7);
    to.mockClear();
    pz.onPointerDown({ clientX: 10, clientY: 10, button: 0, preventDefault() {} } as PointerEvent); // cancelGlide → cameraBusy false
    await nextTick();
    expect(to).not.toHaveBeenCalled(); // deferred glide saw !cameraBusy and bailed
    vi.unstubAllGlobals();
  });

  it('bails the deferred glide if the svg is gone', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    const { pz } = host({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    stubRect(pz, 200, 200);

    pz.animateFitTo({ minX: 0, maxX: 50, minY: 0, maxY: 50 }, 0.7);
    to.mockClear();
    pz.svgRef.value = null; // unmounted before the deferred glide runs → rectOf() is null
    await nextTick();
    expect(to).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
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

  // ---- Compact-screen focus fit (single-axis) + root focal anchoring ----
  function compactHost(
    box: Bounds,
    focal: { x: number; y: number } | null,
    compact = true
  ): ReturnType<typeof usePanZoom> {
    const api: { current?: ReturnType<typeof usePanZoom> } = {};
    const Comp = defineComponent({
      setup() {
        const boundsRef = ref<Bounds | null>(box);
        const initialBoundsRef = ref<Bounds | null>(box);
        const initialFocalRef = ref<{ x: number; y: number } | null>(focal);
        const compactRef = ref(compact);
        const pz = usePanZoom({ boundsRef, initialBoundsRef, initialFocalRef, compactRef, padding: 0 });
        api.current = pz;
        return () => h('svg', { ref: pz.svgRef });
      }
    });
    mount(Comp);
    return api.current!;
  }

  it('compact fit uses height-mode for a wide box and anchors the overflow (X) axis on the focal point', () => {
    const pz = compactHost({ minX: 0, maxX: 400, minY: 0, maxY: 100 }, { x: 50, y: 50 });
    stubRect(pz, 200, 400); // portrait viewport
    pz.fit();
    // contentH(100) ≤ contentW(400) → 'height'; k = 400/100 = 4; X overflows
    // (1600 > 200) → centred on focal.x=50; Y on the bounds midpoint (50).
    expect(pz.viewport.value).toEqual({ x: 200 / 2 - 50 * 4, y: 400 / 2 - 50 * 4, k: 4 });
  });

  it('compact fit uses width-mode for a tall box and anchors the overflow (Y) axis on the focal point', () => {
    const pz = compactHost({ minX: 0, maxX: 100, minY: 0, maxY: 400 }, { x: 50, y: 50 });
    stubRect(pz, 400, 200); // landscape viewport
    pz.fit();
    // contentH(400) > contentW(100) → 'width'; k = 400/100 = 4; Y overflows
    // (1600 > 200) → centred on focal.y=50; X on the bounds midpoint (50).
    expect(pz.viewport.value).toEqual({ x: 400 / 2 - 50 * 4, y: 200 / 2 - 50 * 4, k: 4 });
  });

  it('compact fit falls back to contain when the box is degenerate (no width)', () => {
    const pz = compactHost({ minX: 0, maxX: 0, minY: 0, maxY: 100 }, { x: 0, y: 50 });
    stubRect(pz, 200, 200);
    pz.fit();
    // zero-width content → familyFitMode returns 'contain', fitToBounds → identity
    expect(pz.viewport.value).toEqual({ x: 0, y: 0, k: 1 });
  });

  it('non-compact fit ignores the focal point and contains the whole box', () => {
    const pz = compactHost({ minX: 0, maxX: 400, minY: 0, maxY: 100 }, { x: 50, y: 50 }, false);
    stubRect(pz, 200, 400);
    pz.fit();
    // 'contain': k = min(200/400, 400/100) = 0.5; centred on the bounds midpoints
    expect(pz.viewport.value).toEqual({ x: 200 / 2 - 200 * 0.5, y: 400 / 2 - 50 * 0.5, k: 0.5 });
  });

  it('animateFitTo threads the focal point into a compact glide target', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    const pz = compactHost({ minX: 0, maxX: 400, minY: 0, maxY: 100 }, { x: 50, y: 50 });
    stubRect(pz, 200, 400);
    pz.animateFitTo({ minX: 0, maxX: 400, minY: 0, maxY: 100 }, 0.7, { x: 50, y: 50 });
    await nextTick();
    const [, vars] = to.mock.calls[to.mock.calls.length - 1] as [unknown, { x: number; y: number; k: number }];
    expect(vars).toMatchObject({ x: -100, y: 0, k: 4 }); // focal-anchored height fit
    vi.unstubAllGlobals();
  });

  // ---- Interaction/cleanup edge paths (rAF, idle timer, unmeasured rect) ----
  it('applies a pan immediately when requestAnimationFrame is unavailable', () => {
    vi.stubGlobal('requestAnimationFrame', undefined); // force the no-rAF flush path
    try {
      const { pz } = host(null);
      pz.onPointerDown({ clientX: 0, clientY: 0, button: 0, preventDefault() {} } as PointerEvent);
      pz.onPointerMove({ clientX: 50, clientY: 20, preventDefault() {} } as PointerEvent); // > threshold
      expect(pz.viewport.value).toEqual({ x: 50, y: 20, k: 1 }); // flushed synchronously
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('re-marking interaction (a second wheel event) resets the idle timer', () => {
    vi.useFakeTimers();
    const { pz } = host({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    stubRect(pz);
    pz.onWheel({ deltaY: -10, clientX: 10, clientY: 10, preventDefault() {} } as WheelEvent);
    expect(pz.isPanning.value).toBe(true);
    pz.onWheel({ deltaY: -10, clientX: 10, clientY: 10, preventDefault() {} } as WheelEvent); // clears the prior timer
    vi.advanceTimersByTime(2000);
    expect(pz.isPanning.value).toBe(false);
    vi.useRealTimers();
  });

  it('viewportCenterContent returns null when the svg is unmeasured', () => {
    const { pz } = host(null);
    pz.svgRef.value = null;
    expect(pz.viewportCenterContent()).toBeNull();
  });

  it('recenterOn is a no-op when the svg is unmeasured', () => {
    const { pz } = host(null);
    pz.svgRef.value = null;
    pz.recenterOn({ x: 10, y: 20 });
    expect(pz.viewport.value).toEqual({ x: 0, y: 0, k: 1 });
  });

  it('clears isPanning when the last touch lifts', () => {
    const { pz } = host(null);
    pz.onTouchEnd({ touches: [] } as unknown as TouchEvent);
    expect(pz.isPanning.value).toBe(false);
  });

  it('cancels a pending pan frame and idle timer on unmount', () => {
    // NB: do NOT use fake timers here — vitest's fake timers also replace
    // requestAnimationFrame/cancelAnimationFrame, clobbering the stubs below.
    const raf = vi.fn((): number => 7);
    const caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', caf);
    try {
      const { wrapper, pz } = host({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
      stubRect(pz);
      pz.onWheel({ deltaY: -10, clientX: 5, clientY: 5, preventDefault() {} } as WheelEvent); // arms the idle timer
      pz.onPointerDown({ clientX: 0, clientY: 0, button: 0, preventDefault() {} } as PointerEvent);
      pz.onPointerMove({ clientX: 50, clientY: 0, preventDefault() {} } as PointerEvent); // schedules a pan frame (id 7)
      wrapper.unmount();
      expect(caf).toHaveBeenCalledWith(7); // pending pan frame cancelled
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
