import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import {
  DEFAULT_LIMITS,
  IDENTITY,
  fitToBounds,
  panBy,
  pinchZoom,
  zoomAt,
  type Bounds,
  type ScaleLimits,
  type Viewport
} from './panZoom';

interface UsePanZoomOptions {
  boundsRef: Ref<Bounds | null>;
  padding?: number;
  limits?: ScaleLimits;
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
  const activeTouches = new Map<number, { x: number; y: number }>();
  let pinchPrevDistance = 0;

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
    const rect = rectOf();
    if (!rect || !options.boundsRef.value) {
      return;
    }
    viewport.value = fitToBounds(options.boundsRef.value, { width: rect.width, height: rect.height }, padding);
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    userAdjusted.value = true;
    const factor = Math.exp(-event.deltaY * WHEEL_STEP);
    viewport.value = zoomAt(viewport.value, factor, toLocal(event.clientX, event.clientY), limits);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    dragging = true;
    dragMoved.value = false;
    downAt = { x: event.clientX, y: event.clientY };
    lastPointer = downAt;
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
    }
    viewport.value = panBy(viewport.value, dx, dy);
  }

  function onPointerUp(_event: PointerEvent): void {
    dragging = false;
  }

  function touchPoints(touches: TouchList) {
    return Array.from(touches).map(touch => ({
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY
    }));
  }

  function onTouchStart(event: TouchEvent): void {
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
  onBeforeUnmount(() => observer?.disconnect());

  // Re-fit when the rendered tree changes, unless the user has taken control.
  watch(
    () => options.boundsRef.value,
    () => {
      if (!userAdjusted.value) {
        fit();
      }
    }
  );

  return {
    svgRef,
    viewport,
    transform,
    dragMoved,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd
  };
}
