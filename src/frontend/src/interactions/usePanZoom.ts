import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import {
  DEFAULT_LIMITS,
  IDENTITY,
  centerOn,
  fitToBounds,
  panBy,
  pinchZoom,
  zoomAt,
  type Bounds,
  type FitMode,
  type Point,
  type ScaleLimits,
  type Viewport
} from './panZoom';
import { glideTo, type CameraGlide } from '../motion/camera';

interface UsePanZoomOptions {
  boundsRef: Ref<Bounds | null>;
  initialBoundsRef?: Ref<Bounds | null>;
  padding?: number;
  limits?: ScaleLimits;
  maxScale?: number;
  // When true, focus fits favour readability over completeness: the box's short
  // (time/generation) axis is fitted and the sibling axis overflows, instead of
  // letterboxing the whole box to an unreadable scale. Set on compact screens.
  compactRef?: Ref<boolean>;
  // The point to keep in view on the overflowing axis of a single-axis initial
  // fit (the default-root person). Without it a compact fit centres the family's
  // midpoint and can push the root off-screen. Only used when compactRef is set.
  initialFocalRef?: Ref<Point | null>;
}

const DRAG_THRESHOLD = 4; // px of movement before a press counts as a drag
const WHEEL_STEP = 0.0015; // zoom sensitivity per wheel delta unit

export function usePanZoom(options: UsePanZoomOptions) {
  const padding = options.padding ?? 60;
  const limits = options.limits ?? DEFAULT_LIMITS;
  const svgRef = ref<SVGSVGElement | null>(null);
  const viewport = ref<Viewport>({ ...IDENTITY });
  const dragMoved = ref(false);
  const userAdjusted = ref(false);
  // True only while a real pan gesture is in flight. The view binds a class on it
  // so it can shed expensive paint (e.g. the per-card film-grain blend) and
  // composite the viewport during the drag, then restore full fidelity on release.
  const isPanning = ref(false);

  let dragging = false;
  let lastPointer = { x: 0, y: 0 };
  let downAt = { x: 0, y: 0 };
  let activePointerId: number | null = null;
  let captured = false;
  const activeTouches = new Map<number, { x: number; y: number }>();
  let pinchPrevDistance = 0;

  // Pointer-drag pan is coalesced to one viewport update per animation frame:
  // high-rate mice/trackpads fire several pointermove events per frame, and each
  // viewport write triggers a full SVG repaint AND a TimeRail re-render. Batching
  // the accumulated delta into a single rAF-driven update caps that to one per
  // frame (a big win on the dense film tree, worst at fine zoom). Touch/pinch and
  // wheel stay synchronous — they're not the high-rate case.
  let pendingPanDx = 0;
  let pendingPanDy = 0;
  let panFrame: number | null = null;
  const canRaf = typeof requestAnimationFrame === 'function';

  function flushPan(): void {
    panFrame = null;
    if (pendingPanDx === 0 && pendingPanDy === 0) {
      return;
    }
    const dx = pendingPanDx;
    const dy = pendingPanDy;
    pendingPanDx = 0;
    pendingPanDy = 0;
    viewport.value = panBy(viewport.value, dx, dy);
  }

  function queuePan(dx: number, dy: number): void {
    pendingPanDx += dx;
    pendingPanDy += dy;
    if (!canRaf) {
      flushPan(); // environments without rAF (some tests) apply immediately
      return;
    }
    if (panFrame == null) {
      panFrame = requestAnimationFrame(flushPan);
    }
  }

  // Wheel/pinch zoom has no explicit "end" event, so flag the gesture active and
  // clear it after a short idle (long enough to span a scroll/pinch burst). Drives
  // the same paint-shedding the view applies while panning.
  let interactionEndTimer: ReturnType<typeof setTimeout> | null = null;
  function markInteracting(): void {
    isPanning.value = true;
    if (interactionEndTimer != null) {
      clearTimeout(interactionEndTimer);
    }
    interactionEndTimer = setTimeout(() => {
      interactionEndTimer = null;
      if (!dragging && activeTouches.size === 0) {
        isPanning.value = false;
      }
    }, 200);
  }

  // The zoom-out floor must be low enough to fit the whole tree. fitToBounds
  // ignores the scale limits, so a tree too large to fit at the configured min
  // renders BELOW it on the initial fit — then the first zoom snaps up to the min
  // (a visible jump). Lower the effective min to the full-bounds fit scale.
  function activeLimits(): ScaleLimits {
    const bounds = options.boundsRef.value;
    const rect = rectOf();
    let floor = limits.min;
    if (bounds && rect) {
      const cw = bounds.maxX - bounds.minX;
      const ch = bounds.maxY - bounds.minY;
      const aw = rect.width - padding * 2;
      const ah = rect.height - padding * 2;
      if (cw > 0 && ch > 0 && aw > 0 && ah > 0) {
        floor = Math.min(limits.min, aw / cw, ah / ch);
      }
    }
    return { min: floor, max: limits.max };
  }

  let glide: CameraGlide | null = null;
  // True from the moment a reorient is requested until its glide ends — covers the
  // gap before the (deferred) glide starts, during which the orientation reflow
  // fires the ResizeObserver. Keeps the auto re-fit from snapping mid-reorient.
  let cameraBusy = false;

  function cancelGlide(): void {
    glide?.kill();
    glide = null;
    cameraBusy = false;
  }

  // Glide the camera to `target`. Counts as a user adjustment so a later
  // resize won't undo a search jump. Instant under prefers-reduced-motion
  // (the camera engine handles that check).
  function animateTo(target: Viewport): void {
    cancelGlide();
    userAdjusted.value = true;
    // Null the handle when the glide finishes so the auto re-fit (suppressed
    // while a glide is in flight) resumes afterwards.
    glide = glideTo(viewport, target, { onComplete: () => { glide = null; } });
  }

  // Centre a content-space point in the SVG (the search "go to person" move).
  function centerOnPoint(point: Point): void {
    const rect = rectOf();
    if (!rect) {
      return;
    }
    animateTo(centerOn(point, { width: rect.width, height: rect.height }, viewport.value.k));
  }

  // The content-space point currently under the viewport centre (inverse of the
  // pan/zoom transform). Used to find what the user is looking at before a reorient.
  function viewportCenterContent(): Point | null {
    const rect = rectOf();
    const k = viewport.value.k;
    if (!rect || k === 0) {
      return null;
    }
    return {
      x: (rect.width / 2 - viewport.value.x) / k,
      y: (rect.height / 2 - viewport.value.y) / k
    };
  }

  // Glide so `point` sits at the viewport centre WITHOUT changing zoom — used to
  // keep the focal person framed across an orientation flip (preserve the area).
  function recenterOn(point: Point, durationSec = 0): void {
    const rect = rectOf();
    if (!rect) {
      return;
    }
    cancelGlide();
    userAdjusted.value = true;
    const k = viewport.value.k; // preserve the current zoom exactly
    const target: Viewport = { x: rect.width / 2 - point.x * k, y: rect.height / 2 - point.y * k, k };
    // glideTo snaps viewport to the target itself when duration <= 0 / reduced motion.
    glide = glideTo(viewport, target, { duration: durationSec, onComplete: () => { glide = null; } });
  }

  const transform = computed(
    () => `translate(${viewport.value.x},${viewport.value.y}) scale(${viewport.value.k})`
  );

  function rectOf(): DOMRect | null {
    return svgRef.value?.getBoundingClientRect() ?? null;
  }

  function toLocal(clientX: number, clientY: number) {
    const rect = rectOf();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: clientX, y: clientY };
  }

  // Choose how a focus box is fitted. On a roomy (desktop) screen, 'contain' —
  // the whole box is visible. On a compact screen 'contain' would shrink a wide
  // family to unreadable cards, so fit the box's SHORTER axis instead (the
  // time/generation axis — three tiers, far narrower than the sibling spread)
  // and let the longer sibling axis overflow. This keeps every tier visible at a
  // legible size regardless of orientation, and the orientation logic already
  // puts that short axis along the long screen edge.
  function familyFitMode(bounds: Bounds): FitMode {
    if (!options.compactRef?.value) {
      return 'contain';
    }
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    if (contentWidth <= 0 || contentHeight <= 0) {
      return 'contain';
    }
    return contentHeight <= contentWidth ? 'height' : 'width';
  }

  function fit(): void {
    // A fit is an authoritative reposition — never let a stale glide overwrite it.
    cancelGlide();
    const rect = rectOf();
    const bounds = options.initialBoundsRef?.value ?? options.boundsRef.value;
    if (!rect || !bounds) {
      return;
    }
    const size = { width: rect.width, height: rect.height };
    const focal = options.initialFocalRef?.value ?? undefined;
    viewport.value = fitToBounds(bounds, size, padding, options.maxScale ?? Infinity, familyFitMode(bounds), focal);
  }

  // Animated fit to an EXPLICIT bounds (the morph passes the new orientation's
  // focus band). durationSec <= 0 (or reduced motion, handled in glideTo) snaps.
  // The glide is deferred one tick: an orientation flip moves the time rail and
  // resizes the SVG, and the target must use the POST-reflow dimensions — reading
  // the rect synchronously here would frame the old size and snap at the end.
  function animateFitTo(bounds: Bounds, durationSec: number, focal?: Point): void {
    cancelGlide();
    cameraBusy = true; // suppress the auto re-fit through the reflow + glide
    void nextTick(() => {
      if (!cameraBusy) {
        return; // a pan/zoom (cancelGlide) pre-empted the reorient
      }
      const rect = rectOf();
      if (!rect) {
        cameraBusy = false;
        return;
      }
      const size = { width: rect.width, height: rect.height };
      const target = fitToBounds(bounds, size, padding, options.maxScale ?? Infinity, familyFitMode(bounds), focal);
      glide = glideTo(viewport, target, { duration: durationSec, onComplete: () => { glide = null; cameraBusy = false; } });
      if (!glide) {
        cameraBusy = false; // snapped instantly (duration <= 0 / reduced motion)
      }
    });
  }

  function onWheel(event: WheelEvent): void {
    cancelGlide();
    event.preventDefault();
    userAdjusted.value = true;
    markInteracting();
    const factor = Math.exp(-event.deltaY * WHEEL_STEP);
    viewport.value = zoomAt(viewport.value, factor, toLocal(event.clientX, event.clientY), activeLimits());
  }

  function onPointerDown(event: PointerEvent): void {
    cancelGlide();
    if (event.button !== 0) {
      return;
    }
    dragging = true;
    dragMoved.value = false;
    captured = false;
    activePointerId = event.pointerId ?? null;
    downAt = { x: event.clientX, y: event.clientY };
    lastPointer = downAt;
    // NOTE: do NOT capture the pointer here. Capturing on press retargets the
    // subsequent `click` to the SVG, so a click on a child node never fires its
    // own handler — that breaks node selection. Capture only once a real drag
    // begins (see onPointerMove), so a plain click still reaches the node.
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) {
      return;
    }
    event.preventDefault();
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    if (Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > DRAG_THRESHOLD) {
      dragMoved.value = true;
      userAdjusted.value = true;
      isPanning.value = true;
      // It's a real drag now (not a click), so capture the pointer to keep
      // tracking even if it leaves the SVG. Guarded for synthetic/no-capture envs.
      if (!captured && activePointerId != null) {
        svgRef.value?.setPointerCapture(activePointerId);
        captured = true;
      }
    }
    queuePan(dx, dy);
  }

  function onPointerUp(_event: PointerEvent): void {
    // The browser implicitly releases pointer capture on pointerup.
    dragging = false;
    captured = false;
    activePointerId = null;
    isPanning.value = false;
    // Apply any delta still pending for this frame so the drag ends exactly where
    // the pointer left off (and the final position is settled synchronously).
    if (panFrame != null) {
      cancelAnimationFrame(panFrame);
      panFrame = null;
    }
    flushPan();
  }

  function touchPoints(touches: TouchList) {
    return Array.from(touches).map(touch => ({
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY
    }));
  }

  function onTouchStart(event: TouchEvent): void {
    cancelGlide();
    activeTouches.clear();
    for (const point of touchPoints(event.touches)) {
      activeTouches.set(point.id, { x: point.x, y: point.y });
    }
    if (activeTouches.size === 2) {
      const [a, b] = [...activeTouches.values()];
      pinchPrevDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  function onTouchMove(event: TouchEvent): void {
    event.preventDefault();
    userAdjusted.value = true;
    isPanning.value = true;
    const points = touchPoints(event.touches);
    if (points.length === 1) {
      const previous = activeTouches.get(points[0].id);
      if (previous) {
        viewport.value = panBy(viewport.value, points[0].x - previous.x, points[0].y - previous.y);
      }
      activeTouches.set(points[0].id, { x: points[0].x, y: points[0].y });
      return;
    }
    if (points.length >= 2) {
      const [a, b] = points;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const midpoint = toLocal((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (pinchPrevDistance > 0) {
        viewport.value = pinchZoom(viewport.value, pinchPrevDistance, distance, midpoint, activeLimits());
      }
      pinchPrevDistance = distance;
      activeTouches.set(a.id, { x: a.x, y: a.y });
      activeTouches.set(b.id, { x: b.x, y: b.y });
    }
  }

  function onTouchEnd(event: TouchEvent): void {
    activeTouches.clear();
    for (const point of touchPoints(event.touches)) {
      activeTouches.set(point.id, { x: point.x, y: point.y });
    }
    pinchPrevDistance = 0;
    if (activeTouches.size === 0) {
      isPanning.value = false;
    }
  }

  let observer: ResizeObserver | null = null;
  onMounted(() => {
    fit();
    if (typeof ResizeObserver !== 'undefined' && svgRef.value) {
      observer = new ResizeObserver(() => {
        // A layout-switch flip repositions the time rail, resizing the SVG mid-
        // morph; while a reorient owns the camera the auto re-fit must stand down,
        // or it cancels the glide and snaps.
        if (!userAdjusted.value && !glide && !cameraBusy) {
          fit();
        }
      });
      observer.observe(svgRef.value);
    }
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    cancelGlide();
    if (panFrame != null) {
      cancelAnimationFrame(panFrame);
      panFrame = null;
    }
    if (interactionEndTimer != null) {
      clearTimeout(interactionEndTimer);
      interactionEndTimer = null;
    }
  });

  // Re-fit when the rendered tree changes, unless the user has taken control or a
  // reorient owns the camera (a layout morph blends the bounds every frame and
  // drives the camera itself via animateFitTo).
  watch(
    () => options.boundsRef.value,
    () => {
      if (!userAdjusted.value && !glide && !cameraBusy) {
        fit();
      }
    }
  );

  // Binding contract: bind onWheel and onTouchMove to NON-passive listeners
  // (Vue: use the `.prevent` modifier on touchmove) and set `touch-action: none`
  // on the bound element so native scroll/zoom doesn't fight these handlers.
  return {
    fit,
    animateFitTo,
    svgRef,
    viewport,
    transform,
    dragMoved,
    isPanning,
    centerOnPoint,
    viewportCenterContent,
    recenterOn,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd
  };
}
