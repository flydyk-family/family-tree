export interface DustSpeck { x: number; y: number; dark: boolean }
export interface Abrasion { scratchX: number; dust: DustSpeck[] }

/** Tiny deterministic string hash → 32-bit seed. */
function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — deterministic, fast, good enough for cosmetic placement. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable, light wear marks for a person — one scratch + 2–3 dust specks, as
 *  fractions of the image box (0..1). Seeded from the id so it never changes. */
export function abrasionFor(id: string): Abrasion {
  const rand = mulberry32(hashSeed(id));
  const scratchX = 0.2 + rand() * 0.6;
  const count = 2 + Math.floor(rand() * 2); // 2 or 3
  const dust: DustSpeck[] = [];
  for (let i = 0; i < count; i++) {
    dust.push({ x: rand(), y: rand(), dark: rand() > 0.5 });
  }
  return { scratchX, dust };
}
