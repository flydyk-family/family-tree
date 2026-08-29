/** The keyless, cross-platform Google Maps URL for a coordinate pair (opens the Maps
 *  website / native app; not an API call). Null when either coordinate is missing. */
export function buildMapUrl(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** The Maps link to show a visitor for a residence row.
 *
 *  Always targets the residence's **place name** rather than a bare `lat,lng` pin,
 *  so Maps resolves it to the named place: the city is selected, its label is
 *  shown, and the map frames the whole city instead of zooming in tight. When the
 *  row also has coordinates (a map-picker placement), the name is anchored at that
 *  point (`/maps/place/<name>/@<lat>,<lng>,13z`) so a same-named place elsewhere
 *  can't be picked instead. Falls back to the stored `mapUrl` when there is no
 *  usable name; returns null when the row has no `mapUrl` at all (no map link). */
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
    return `https://www.google.com/maps/place/${encodeURIComponent(label)}/@${lat},${lng},13z`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
}
