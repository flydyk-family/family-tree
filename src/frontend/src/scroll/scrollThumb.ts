export interface ThumbMetrics { visible: boolean; height: number; top: number; }

// Geometry of the custom scrollbar thumb. Hidden when content fits (or the track
// is collapsed). Otherwise the thumb height is the viewport/content ratio of the
// track (floored at `minThumb`), and its top maps scrollTop onto the remaining
// track travel.
export function thumbMetrics(
  scrollTop: number,
  scrollHeight: number,
  viewHeight: number,
  trackHeight: number,
  minThumb = 28
): ThumbMetrics {
  if (scrollHeight <= viewHeight || trackHeight <= 0) {
    return { visible: false, height: 0, top: 0 };
  }
  const height = Math.max(minThumb, Math.round((viewHeight / scrollHeight) * trackHeight));
  const maxTop = Math.max(0, trackHeight - height);
  const maxScroll = scrollHeight - viewHeight;
  const top = maxScroll <= 0 ? 0 : Math.round((scrollTop / maxScroll) * maxTop);
  return { visible: true, height, top: Math.max(0, Math.min(maxTop, top)) };
}

// Inverse of the `top` mapping: the scrollTop for a thumb dragged to `thumbTop`,
// clamped to the scrollable range.
export function scrollTopFromThumbTop(
  thumbTop: number,
  thumbHeight: number,
  trackHeight: number,
  scrollHeight: number,
  viewHeight: number
): number {
  const maxTop = trackHeight - thumbHeight;
  const maxScroll = scrollHeight - viewHeight;
  if (maxTop <= 0 || maxScroll <= 0) {
    return 0;
  }
  const clampedTop = Math.max(0, Math.min(maxTop, thumbTop));
  return Math.round((clampedTop / maxTop) * maxScroll);
}
