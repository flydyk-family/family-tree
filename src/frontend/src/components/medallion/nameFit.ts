// One-line name font size (px) so `name` roughly fits `maxWidth` px in Cinzel.
// Cinzel glyphs average ~0.58em wide; clamp to a legible band relative to the
// banner width. Tuned against the live oak in Task 9.
const CAP_F = 0.1116;  // trunk "7.6cqw" feel, +20%
const FLOOR_F = 0.0672; // the "4.6cqw" floor, +20%
const AVG_GLYPH = 0.58;

export function nameFontSize(name: string, maxWidth: number): number {
  const len = Math.max(1, name.length);
  const byWidth = maxWidth / (len * AVG_GLYPH);
  return Math.max(maxWidth * FLOOR_F, Math.min(maxWidth * CAP_F, byWidth));
}
