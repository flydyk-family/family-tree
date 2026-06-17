export type CardEra = 'cabinet' | 'gelatin' | 'film';

/** Picks the period-accurate photo medium for a person by birth year.
 *  Hard cutoffs (spec §5.2): <1900 cabinet · 1900–1944 gelatin · 1945+ film.
 *  Unknown birth year → film (the modern default). */
export function cardEra(birthYear: number | null): CardEra {
  if (birthYear == null) return 'film';
  if (birthYear < 1900) return 'cabinet';
  if (birthYear < 1945) return 'gelatin';
  return 'film';
}

export type FilmVariant = 'holed' | 'edgeprint';

/** Within the film era, picks the frame furniture. Births from 1990 on get the
 *  EDGE-PRINT frame (solid celluloid borders, no sprocket holes, edge text
 *  centred in the side margins, frame numbers in the corners); earlier film-era
 *  births keep the holed strip. Unknown year → holed (the established default). */
export function filmVariant(birthYear: number | null): FilmVariant {
  return birthYear != null && birthYear >= 1990 ? 'edgeprint' : 'holed';
}
