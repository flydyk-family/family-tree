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
