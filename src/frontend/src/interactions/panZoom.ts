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

// How the content scale is chosen against the viewport:
//  - 'contain' fits BOTH axes (the whole bounds are visible, letterboxed).
//  - 'height'  fits the VERTICAL axis only and lets the content overflow
//    horizontally (still centred).
//  - 'width'   fits the HORIZONTAL axis only and lets the content overflow
//    vertically (still centred).
// Single-axis fits keep cards legible on a small screen: a focus box whose long
// axis far exceeds the viewport would otherwise letterbox to an unreadable scale.
// Fitting the SHORT (time/generation) axis shows every tier at a readable size
// and lets the wider sibling axis overflow (pannable) instead of shrinking.
export type FitMode = 'contain' | 'height' | 'width';

// Center the content bounds in the viewport with uniform padding on all sides.
// `maxScale` caps how far the content may be enlarged — without it, a small
// content region (e.g. the focused 2-generation band) would be blown up to fill
// a large display and over-zoom; capping keeps cards at most their natural size.
// `focal` anchors the OVERFLOWING axis of a single-axis fit. When 'height' mode
// lets the content spill horizontally (or 'width' mode vertically), the spilling
// axis is centred on `focal` instead of the bounds midpoint — so a chosen point
// (e.g. the root, which can sit far from the family's horizontal centre) stays in
// view rather than being pushed off-screen. The fitted axis always stays centred
// on the bounds. Ignored in 'contain' mode (nothing overflows).
export function fitToBounds(
  bounds: Bounds,
  size: Size,
  padding: number,
  maxScale = Infinity,
  mode: FitMode = 'contain',
  focal?: Point
): Viewport {
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  const availableWidth = size.width - padding * 2;
  const availableHeight = size.height - padding * 2;
  if (contentWidth <= 0 || contentHeight <= 0 || availableWidth <= 0 || availableHeight <= 0) {
    return { ...IDENTITY };
  }
  const widthFit = availableWidth / contentWidth;
  const heightFit = availableHeight / contentHeight;
  const k = mode === 'height'
    ? Math.min(heightFit, maxScale)
    : mode === 'width'
      ? Math.min(widthFit, maxScale)
      : Math.min(widthFit, heightFit, maxScale);
  const boundsCenterX = (bounds.minX + bounds.maxX) / 2;
  const boundsCenterY = (bounds.minY + bounds.maxY) / 2;
  // 'height' fits Y and overflows X → anchor X on focal; 'width' is the mirror.
  // Only anchor when the content actually overflows that axis — when it fits, the
  // bounds midpoint shows everything, and anchoring could needlessly push an edge
  // out of view.
  const anchorX = mode === 'height' && focal && contentWidth * k > size.width;
  const anchorY = mode === 'width' && focal && contentHeight * k > size.height;
  const centerX = anchorX ? focal.x : boundsCenterX;
  const centerY = anchorY ? focal.y : boundsCenterY;
  return {
    x: size.width / 2 - centerX * k,
    y: size.height / 2 - centerY * k,
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
