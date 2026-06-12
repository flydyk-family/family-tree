import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import {
  DEFAULT_LIMITS,
  IDENTITY,
  centerOn,
  fitToBounds,
  panBy,
  pinchZoom,
  zoomAt,
  type Bounds,
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

  let dragging = false;
  let lastPointer = { x: 0, y: 0 };
  let downAt = { x: 0, y: 0 };
  let activePointerId: number | null = null;
  let captured = false;
  const activeTouches = new Map<number, { x: number; y: number }>();
  let pinchPrevDistance = 0;

  let glide: CameraGlide | null = null;

  function cancelGlide(): void {
    glide?.kill();
    glide = null;
  }

  // Glide the camera to `target`. Counts as a user adjustment so a later
  // resize won't undo a search jump. Instant under prefers-reduced-motion
  // (the camera engine handles that check).
  function animateTo(target: Viewport): void {
    cancelGlide();
    userAdjusted.value = true;
    glide = glideTo(viewport, target);
  }

  // Centre a content-space point in the SVG (the search "go to person" move).
  function centerOnPoint(point: Point): void {
    const rect = rectOf();
    if (!rect) {
      return;
    }
    animateTo(centerOn(point, { width: rect.width, height: rect.height }, viewport.value.k));
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

  function fit(): void {
    // A fit is an authoritative reposition — never let a stale glide overwrite it.
    cancelGlide();
    const rect = rectOf();
    const bounds = options.initialBoundsRef?.value ?? options.boundsRef.value;
    if (!rect || !bounds) {
      return;
    }
    viewport.value = fitToBounds(bounds, { width: rect.width, height: rect.height }, padding, options.maxScale ?? Infinity);
  }

  function onWheel(event: WheelEvent): void {
    cancelGlide();
    event.preventDefault();
    userAdjusted.value = true;
    const factor = Math.exp(-event.deltaY * WHEEL_STEP);
    viewport.value = zoomAt(viewport.value, factor, toLocal(event.clientX, event.clientY), limits);
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
      // It's a real drag now (not a click), so capture the pointer to keep
      // tracking even if it leaves the SVG. Guarded for synthetic/no-capture envs.
      if (!captured && activePointerId != null) {
        svgRef.value?.setPointerCapture(activePointerId);
        captured = true;
      }
    }
    viewport.value = panBy(viewport.value, dx, dy);
  }

  function onPointerUp(_event: PointerEvent): void {
    // The browser implicitly releases pointer capture on pointerup.
    dragging = false;
    captured = false;
    activePointerId = null;
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
        viewport.value = pinchZoom(viewport.value, pinchPrevDistance, distance, midpoint, limits);
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
  }

  let observer: ResizeObserver | null = null;
  onMounted(() => {
    fit();
    if (typeof ResizeObserver !== 'undefined' && svgRef.value) {
      observer = new ResizeObserver(() => {
        if (!userAdjusted.value) {
          fit();
        }
      });
      observer.observe(svgRef.value);
    }
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    cancelGlide();
  });

  // Re-fit when the rendered tree changes, unless the user has taken control.
  watch(
    () => options.boundsRef.value,
    () => {
      if (!userAdjusted.value) {
        fit();
      }
    }
  );

  // Binding contract: bind onWheel and onTouchMove to NON-passive listeners
  // (Vue: use the `.prevent` modifier on touchmove) and set `touch-action: none`
  // on the bound element so native scroll/zoom doesn't fight these handlers.
  return {
    fit,
    svgRef,
    viewport,
    transform,
    dragMoved,
    centerOnPoint,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd
  };
}
