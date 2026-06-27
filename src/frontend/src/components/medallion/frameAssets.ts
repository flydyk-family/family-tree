// WebP bitmaps, NOT the source frame-*.svg: a vector in a per-node <image>
// re-rasterizes every pan/zoom frame and tanked the classic tree to ~1fps (see
// oak-tree.md). Regenerate via scripts/gen-medallion-frame-rasters.mjs.
import frameGoldUrl from '../../assets/medallion/frame-gold.webp?url';
import frameSelectedUrl from '../../assets/medallion/frame-selected.webp?url';
import frameMatchUrl from '../../assets/medallion/frame-match.webp?url';

export const frameGold = frameGoldUrl;
export const frameSelected = frameSelectedUrl;
export const frameMatch = frameMatchUrl;

// Which recoloured overlay to show over the base gold frame. Search-match
// (green-gold) wins over selected (lit gold) so found people stay distinguishable.
// Returns null when the node is plain gold.
export function overlayForState(selected: boolean, match: boolean): string | null {
  if (match) return frameMatch;
  if (selected) return frameSelected;
  return null;
}
