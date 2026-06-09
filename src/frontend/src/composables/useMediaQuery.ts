import { onUnmounted, ref, type Ref } from 'vue';

/** Shared mobile breakpoint: narrow width OR short height (landscape phones). */
export const MOBILE_MEDIA_QUERY = '(max-width: 767.98px), (max-height: 500px)';

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
