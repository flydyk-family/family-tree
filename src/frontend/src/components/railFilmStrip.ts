import { chooseTickStep } from '../layout/timeScale';

const MIN_PITCH = 9;
const MAX_PITCH = 34;

/** Sprocket-hole pitch in screen px, tied to the current frame cell so the
 *  perforations scale with zoom but never get tiny or huge. `pxPerYear` is the
 *  scale's base; `k` the viewport zoom. */
export function sprocketPitch(pxPerYear: number, k: number): number {
  const effective = pxPerYear * k;
  const step = chooseTickStep(effective);
  const pitch = (step * effective) / 3;
  return Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
}

/** Background-position offset in [0, pitch) so the strip scrolls with the
 *  timeline as the viewport pans. */
export function sprocketOffset(viewportOffset: number, pitch: number): number {
  return ((viewportOffset % pitch) + pitch) % pitch;
}
