// Pre-rasterized WebP frames (baked from the editable frame-*.svg source by
// scripts/gen-medallion-frame-rasters.mjs). The medallion draws each frame as a
// per-node <image>; a VECTOR svg there forces the browser to re-rasterize ~90KB of
// paths at the new scale on every pan/zoom frame (×232 images on a 116-person tree
// → ~1fps). A bitmap is decoded once and GPU-scaled, keeping classic-theme pan/zoom
// smooth (~1fps → ~50fps measured). The .svg files stay the source of truth —
// rerun the raster script after editing them.
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
