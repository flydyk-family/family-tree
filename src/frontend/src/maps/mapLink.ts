/** The keyless, cross-platform Google Maps URL for a coordinate pair (opens the Maps
 *  website / native app; not an API call). Null when either coordinate is missing. */
export function buildMapUrl(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** Zoom level for a residence link that carries coordinates — roughly "whole
 *  locality" in Google Maps' `@lat,lng,Nz` scale. */
const LOCALITY_ZOOM = 13;

/** The Maps link to show a visitor for a residence row.
 *
 *  When the row has picker coordinates the link points at those coordinates
 *  (`/maps/place/<lat>,<lng>/@<lat>,<lng>,13z`): Maps reverse-geocodes the exact
 *  point, pins it, names it, and honours the zoom — so a duplicate place name
 *  (many "Александровка"s) can't send the visitor to the wrong country. A row
 *  with only a name falls back to a name search, which is all its data allows.
 *  The stored `mapUrl` gates the link (null → no link) and is the last fallback.
 *  See [docs/reference/features/search-and-navigation.md] for the full matrix. */
export function residenceMapHref(
  placeLabel: string | null | undefined,
  lat: number | null,
  lng: number | null,
  storedMapUrl: string | null
): string | null {
  if (!storedMapUrl) {
    return null;
  }
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/place/${lat},${lng}/@${lat},${lng},${LOCALITY_ZOOM}z`;
  }
  const label = placeLabel?.trim();
  if (!label) {
    return storedMapUrl;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
}
