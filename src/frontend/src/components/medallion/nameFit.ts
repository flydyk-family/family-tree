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

export interface NameLayout {
  lines: string[];     // 1 or 2 lines
  fontSize: number;    // px
  lineHeight: number;  // px between line baselines
}

// Below this single-line size (a fraction of maxWidth, between FLOOR and CAP) a
// multi-word name is "squished" enough that wrapping to two lines reads better.
const WRAP_BELOW_F = 0.088;
const LINE_H_F = 1.05;

// Split words into two lines so the longer line is as short as possible (so the
// two-line block uses the largest font). On ties prefer more words on the top
// line (`<=`), which for the common "Given Patronymic Surname" shape drops the
// surname onto its own second line.
function balancedSplit(words: string[]): [string, string] {
  let bestAt = 1;
  let bestMax = Infinity;
  for (let i = 1; i < words.length; i++) {
    const top = words.slice(0, i).join(' ');
    const bottom = words.slice(i).join(' ');
    const longer = Math.max(top.length, bottom.length);
    if (longer <= bestMax) {
      bestMax = longer;
      bestAt = i;
    }
  }
  return [words.slice(0, bestAt).join(' '), words.slice(bestAt).join(' ')];
}

// Lay a name out on one line, or — when a multi-word name would otherwise shrink
// to a squished single line — on two balanced lines at a larger font. Two lines
// are only adopted when they actually buy a bigger font than the one-line fit.
export function fitName(name: string, maxWidth: number): NameLayout {
  const oneSize = nameFontSize(name, maxWidth);
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || oneSize >= maxWidth * WRAP_BELOW_F) {
    return { lines: [name], fontSize: oneSize, lineHeight: oneSize * LINE_H_F };
  }
  const [top, bottom] = balancedSplit(words);
  const twoSize = Math.min(nameFontSize(top, maxWidth), nameFontSize(bottom, maxWidth));
  if (twoSize <= oneSize) {
    return { lines: [name], fontSize: oneSize, lineHeight: oneSize * LINE_H_F };
  }
  return { lines: [top, bottom], fontSize: twoSize, lineHeight: twoSize * LINE_H_F };
}
