import { seededRandom } from './seed';

export interface HoverTilt {
  /** Degrees, sign and magnitude stable per person. Clockwise is positive. */
  angleDeg: number;
}

/** Stable per-person hover tilt for paper photo cards (cabinet / gelatin).
 *  Magnitude ~2–4°, direction varies. Uses a distinct seed stream from the
 *  abrasion marks so the two are uncorrelated. */
export function hoverTilt(id: string): HoverTilt {
  const rand = seededRandom(`${id}#tilt`);
  const magnitude = 2 + rand() * 2;      // 2..4
  const sign = rand() < 0.5 ? -1 : 1;
  return { angleDeg: sign * magnitude };
}
