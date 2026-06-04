import type { LifeEvent } from '../types/family';

function eventYear(event: LifeEvent | null): string {
  if (!event || event.year == null) {
    return '';
  }
  return `${event.approx ? '~' : ''}${event.year}`;
}

function plainYear(value: number | null): string {
  return value == null ? '' : `${value}`;
}

function join(birthText: string, deathText: string): string {
  if (birthText === '' && deathText === '') {
    return '';
  }
  return `${birthText}–${deathText}`;
}

// Locale-neutral lifespan from LifeEvent objects: "1762–1828", "~1762–~1828",
// "1962–" (living), "–1900" (unknown birth), or "" when nothing is known.
export function formatLifespan(birth: LifeEvent | null, death: LifeEvent | null): string {
  return join(eventYear(birth), eventYear(death));
}

// Same locale-neutral shape from bare year numbers (PersonSummary carries no
// approx flag, so there is no leading tilde).
export function formatYearSpan(birthYear: number | null, deathYear: number | null): string {
  return join(plainYear(birthYear), plainYear(deathYear));
}
