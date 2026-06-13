import frameGoldUrl from '../../assets/medallion/frame-gold.svg?url';
import frameSelectedUrl from '../../assets/medallion/frame-selected.svg?url';
import frameMatchUrl from '../../assets/medallion/frame-match.svg?url';

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
