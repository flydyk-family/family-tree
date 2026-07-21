import type { Residence } from '../types/family';
import { buildMapUrl } from '../maps/mapLink';

/** Editable buffer for one residence row: place locales are '' (never null) so they
 *  bind cleanly to inputs. */
export interface ResidenceRow {
  place: { ru: string; be: string; en: string };
  fromYear: number | null;
  toYear: number | null;
  lat: number | null;
  lng: number | null;
  mapUrl: string | null;
}

export function seedRows(residences: Residence[]): ResidenceRow[] {
  return residences.map(r => ({
    place: { ru: r.place.ru ?? '', be: r.place.be ?? '', en: r.place.en ?? '' },
    fromYear: r.fromYear,
    toYear: r.toYear,
    lat: r.lat,
    lng: r.lng,
    mapUrl: r.mapUrl
  }));
}

export function emptyRow(): ResidenceRow {
  return { place: { ru: '', be: '', en: '' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null };
}

export function toResidences(rows: ResidenceRow[]): Residence[] {
  const norm = (s: string): string | null => (s.trim() === '' ? null : s.trim());
  return rows.map(row => ({
    place: { ru: norm(row.place.ru), be: norm(row.place.be), en: norm(row.place.en) },
    fromYear: row.fromYear,
    toYear: row.toYear,
    lat: row.lat,
    lng: row.lng,
    // Prefer a fresh keyless link from coords; keep any existing one when coords absent.
    mapUrl: buildMapUrl(row.lat, row.lng) ?? row.mapUrl
  }));
}
