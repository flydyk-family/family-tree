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

export type FilmHoles = 'filled' | 'transparent';

/** Sprocket-hole treatment for a film-era card. Births from 1990 on get FILLED
 *  holes (lighter slots printed on the celluloid strip); earlier film-era births
 *  keep the transparent holes punched through to the canvas. Unknown year →
 *  transparent (the established default). */
export function filmHoles(birthYear: number | null): FilmHoles {
  return birthYear != null && birthYear >= 1990 ? 'filled' : 'transparent';
}
