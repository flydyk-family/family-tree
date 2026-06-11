export interface Viewport {
  x: number;
  y: number;
  k: number;
}

export interface ScaleLimits {
  min: number;
  max: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Size {
  width: number;
  height: number;
}

export const IDENTITY: Viewport = { x: 0, y: 0, k: 1 };
export const DEFAULT_LIMITS: ScaleLimits = { min: 0.2, max: 6 };

export function clampScale(k: number, limits: ScaleLimits): number {
  return Math.min(limits.max, Math.max(limits.min, k));
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { x: vp.x + dx, y: vp.y + dy, k: vp.k };
}

// Scale by `factor` while keeping the screen-space `pivot` over the same content point.
export function zoomAt(vp: Viewport, factor: number, pivot: Point, limits: ScaleLimits): Viewport {
  const k = clampScale(vp.k * factor, limits);
  const ratio = k / vp.k;
  return {
    x: pivot.x - (pivot.x - vp.x) * ratio,
    y: pivot.y - (pivot.y - vp.y) * ratio,
    k
  };
}

// Pinch: scale by the ratio of finger distances about their midpoint.
export function pinchZoom(
  vp: Viewport,
  prevDistance: number,
  nextDistance: number,
  midpoint: Point,
  limits: ScaleLimits
): Viewport {
  if (prevDistance <= 0) {
    return vp;
  }
  return zoomAt(vp, nextDistance / prevDistance, midpoint, limits);
}

// Center the content bounds in the viewport with uniform padding on all sides.
// `maxScale` caps how far the content may be enlarged — without it, a small
// content region (e.g. the focused 2-generation band) would be blown up to fill
// a large display and over-zoom; capping keeps cards at most their natural size.
export function fitToBounds(bounds: Bounds, size: Size, padding: number, maxScale = Infinity): Viewport {
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  const availableWidth = size.width - padding * 2;
  const availableHeight = size.height - padding * 2;
  if (contentWidth <= 0 || contentHeight <= 0 || availableWidth <= 0 || availableHeight <= 0) {
    return { ...IDENTITY };
  }
  const k = Math.min(availableWidth / contentWidth, availableHeight / contentHeight, maxScale);
  const contentCenterX = (bounds.minX + bounds.maxX) / 2;
  const contentCenterY = (bounds.minY + bounds.maxY) / 2;
  return {
    x: size.width / 2 - contentCenterX * k,
    y: size.height / 2 - contentCenterY * k,
    k
  };
}

export const READABLE_SCALE_THRESHOLD = 0.8;
export const READABLE_SCALE = 1;

// A sequenced camera command: centre the node with this id. `seq` increases on
// every request so repeating the same target still re-triggers the move.
export interface CenterRequest {
  id: string;
  seq: number;
}

// Put a content-space point at the screen centre. Below the readability
// threshold the scale is raised to natural size so the centred card is
// legible; otherwise the user's zoom is preserved and the move is pan-only.
export function centerOn(point: Point, size: Size, currentK: number): Viewport {
  const k = currentK < READABLE_SCALE_THRESHOLD ? READABLE_SCALE : currentK;
  return {
    x: size.width / 2 - point.x * k,
    y: size.height / 2 - point.y * k,
    k
  };
}
