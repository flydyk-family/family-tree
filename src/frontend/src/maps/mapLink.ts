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

/** The Maps link to show a visitor for a residence row, best form first:
 *
 *  1. **place ID + name** — `?api=1&query=<name>&query_place_id=<id>`, the supported
 *     Maps URL form that pins one exact place. Labelled, auto-framed, unambiguous —
 *     a duplicate name (the many "Александровка"s) can't resolve to the wrong one.
 *  2. **coordinates** — `/maps/place/<lat>,<lng>/@<lat>,<lng>,13z`: Maps reverse-
 *     geocodes and pins the exact point at locality zoom. Older picker saves.
 *  3. **name only** — `?api=1&query=<name>`, all a seed row's data allows.
 *  4. the stored `mapUrl` verbatim.
 *
 *  The stored `mapUrl` also gates the link: no `mapUrl` → no link at all.
 *  See [docs/reference/features/search-and-navigation.md] for the full matrix. */
export function residenceMapHref(
  placeLabel: string | null | undefined,
  lat: number | null,
  lng: number | null,
  storedMapUrl: string | null,
  placeId: string | null
): string | null {
  if (!storedMapUrl) {
    return null;
  }
  const label = placeLabel?.trim();
  if (placeId && label) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}&query_place_id=${encodeURIComponent(placeId)}`;
  }
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/place/${lat},${lng}/@${lat},${lng},${LOCALITY_ZOOM}z`;
  }
  if (!label) {
    return storedMapUrl;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
}
