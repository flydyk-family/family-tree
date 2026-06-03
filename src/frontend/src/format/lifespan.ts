import type { LifeEvent } from '../types/family';

function year(event: LifeEvent | null): string {
  if (!event || event.year == null) {
    return '';
  }
  return `${event.approx ? '~' : ''}${event.year}`;
}

// Locale-neutral lifespan: "1762–1828", "~1762–~1828", "1962–" (living),
// "–1900" (unknown birth), or "" when nothing is known.
export function formatLifespan(birth: LifeEvent | null, death: LifeEvent | null): string {
  const birthText = year(birth);
  const deathText = year(death);
  if (birthText === '' && deathText === '') {
    return '';
  }
  return `${birthText}–${deathText}`;
}
