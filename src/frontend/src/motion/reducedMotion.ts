const QUERY = '(prefers-reduced-motion: reduce)';

// Queried lazily on EVERY call (no module-level caching): tests stub
// `matchMedia` per-case, and the OS setting can change while the app is open.
// A reactive variant can join here when the ceremony PR needs one (YAGNI now).
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(QUERY).matches;
}
