import { seededRandom } from './seed';

export interface DustSpeck { x: number; y: number; dark: boolean }
/** A short vertical hairline scratch, as fractions of the image box. */
export interface TinyScratch { x: number; y0: number; y1: number }
export interface Abrasion { scratchX: number | null; dust: DustSpeck[]; tinyScratch: TinyScratch | null }

/** Stable, light wear marks for a person — one scratch + 2–3 dust specks, as
 *  fractions of the image box (0..1). Seeded from the id so it never changes. */
export function abrasionFor(id: string): Abrasion {
  const rand = seededRandom(id);
  // the long scratch shows on ~30% of cards
  const scratchX = rand() < 0.3 ? 0.2 + rand() * 0.6 : null;
  const count = 2 + Math.floor(rand() * 2); // 2 or 3
  const dust: DustSpeck[] = [];
  for (let i = 0; i < count; i++) {
    dust.push({ x: rand(), y: rand(), dark: rand() > 0.5 });
  }
  // ~50% of cards also carry a short secondary hairline scratch.
  let tinyScratch: TinyScratch | null = null;
  if (rand() > 0.5) {
    const x = 0.15 + rand() * 0.7;
    const y0 = 0.12 + rand() * 0.4;
    const y1 = Math.min(0.92, y0 + 0.16 + rand() * 0.18);
    tinyScratch = { x, y0, y1 };
  }
  return { scratchX, dust, tinyScratch };
}
