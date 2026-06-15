export type FitsPredicate = (start: number, end: number) => boolean;
export interface PageRange { start: number; end: number; }

// Greedy pagination: each page is the largest [start, end) prefix of the
// remaining tokens that still fits, located by binary search. Always advances by
// at least one token, so a single token too tall for the box still gets its own
// page instead of looping forever. `fits(start, end)` is supplied by the caller
// (a DOM measurer in the component; a synthetic capacity in tests).
export function paginate(tokenCount: number, fits: FitsPredicate): PageRange[] {
  const pages: PageRange[] = [];
  let start = 0;
  while (start < tokenCount) {
    let lo = start + 1;
    let hi = tokenCount;
    let best = start + 1; // guarantee progress
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (fits(start, mid)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    pages.push({ start, end: best });
    start = best;
  }
  return pages;
}
