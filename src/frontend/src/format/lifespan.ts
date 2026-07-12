import type { LifeEvent } from '../types/family';

const pad = (value: number): string => String(value).padStart(2, '0');

// Locale-neutral date for one life event. Renders the fullest form the data
// supports: "19.03.1916" (day.month.year), "12.2018" (month.year), or "1809"
// (year only). Approximate dates keep a leading tilde.
export function formatEventDate(event: LifeEvent | null): string {
  return eventDate(event);
}

function eventDate(event: LifeEvent | null): string {
  if (!event || event.year == null) {
    return '';
  }
  const prefix = event.approx ? '~' : '';
  if (event.month != null && event.day != null) {
    return `${prefix}${pad(event.day)}.${pad(event.month)}.${event.year}`;
  }
  if (event.month != null) {
    return `${prefix}${pad(event.month)}.${event.year}`;
  }
  return `${prefix}${event.year}`;
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

// Locale-neutral lifespan from LifeEvent objects, using the fullest date each
// event supports: "01.01.1861–19.03.1916", "1809–13.02.1852", "~1762–~1828",
// "12.2018–" (living, month known), "–1900" (unknown birth), or "" when nothing
// is known.
export function formatLifespan(birth: LifeEvent | null, death: LifeEvent | null): string {
  return join(eventDate(birth), eventDate(death));
}

// Same locale-neutral shape from bare year numbers (PersonSummary carries no
// approx flag, so there is no leading tilde).
export function formatYearSpan(birthYear: number | null, deathYear: number | null): string {
  return join(plainYear(birthYear), plainYear(deathYear));
}
