import { onUnmounted, ref, type Ref } from 'vue';

/** Shared mobile breakpoint: narrow width OR short height (narrow desktops + short screens). */
export const MOBILE_MEDIA_QUERY = '(max-width: 1199.98px), (max-height: 559.98px)';

/** Slim phones (≤ 640 px wide): default to the horizontal oak layout. */
export const SLIM_MEDIA_QUERY = '(max-width: 640px)';

/** Narrow desktop (wider than mobile, but tight for an inline search field). */
export const NARROW_DESKTOP_MEDIA_QUERY = '(min-width: 1200px) and (max-width: 1499.98px)';

/**
 * Reactive wrapper around window.matchMedia. Returns a ref that tracks whether
 * the query currently matches. Safe when matchMedia is unavailable (returns a
 * ref that stays false).
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  if (typeof matchMedia !== 'function') {
    return matches;
  }
  const mql = matchMedia(query);
  matches.value = mql.matches;
  const onChange = (e: { matches: boolean }) => {
    matches.value = e.matches;
  };
  mql.addEventListener('change', onChange);
  onUnmounted(() => mql.removeEventListener('change', onChange));
  return matches;
}
