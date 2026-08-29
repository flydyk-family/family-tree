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

/** The Maps link to show a visitor for a residence row. Targets the place *name*
 *  so Maps opens on the named place (labelled, framed) rather than a tight pin;
 *  when the row has picker coordinates the name is anchored at that point so a
 *  same-named place elsewhere isn't chosen. The stored `mapUrl` gates the link
 *  (null → no link) and is the fallback when there is no usable name.
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
  const label = placeLabel?.trim();
  if (!label) {
    return storedMapUrl;
  }
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/place/${encodeURIComponent(label)}/@${lat},${lng},${LOCALITY_ZOOM}z`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
}
