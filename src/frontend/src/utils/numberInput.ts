/** Parses a number `<input>`'s string value to an integer, or `null` when blank or
 *  unparsable — never `NaN` and never `''`. Native number inputs (and `v-model.number`'s
 *  `looseToNumber`) return the original string on a failed parse, so a cleared field can
 *  otherwise reach app state (and a JSON payload) as `''` instead of `null`. */
export function parseIntInput(value: string): number | null {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}
