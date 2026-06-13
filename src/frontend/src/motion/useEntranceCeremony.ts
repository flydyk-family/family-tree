// src/frontend/src/motion/useEntranceCeremony.ts
import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { TreeLayout } from '../layout/treeLayout';
import type { Viewport } from '../interactions/panZoom';
import { buildEntranceCues, type EntranceCues } from './entranceCues';
import { playEntrance, type EntranceHandle } from './entrance';
import { prefersReducedMotion } from './reducedMotion';

export const ENTRANCE_PLAYED_KEY = 'oak-entrance-played';

export interface EntranceOakTargets {
  svg: SVGSVGElement | null;
  viewport: Ref<Viewport>;
}

export interface UseEntranceCeremonyOptions {
  layout: Ref<TreeLayout | null>;
  orientation: Ref<'vertical' | 'horizontal'>;
  oak: Ref<{ entranceTargets(): EntranceOakTargets } | null>;
  isDeepLink: () => boolean;
  /** Injectable for tests; defaults to sessionStorage (once per browser session). */
  storage?: Storage;
}

export interface EntranceCeremony {
  cues: Ref<EntranceCues | null>;
  active: Ref<boolean>;
  canReplay: ComputedRef<boolean>;
  replay: () => void;
  skip: () => void;
}

// Owns WHEN the ceremony runs: once per session, skipped for deep links and
// horizontal orientation, replayable on demand. HOW it runs lives in
// entrance.ts; WHAT it animates comes from entranceCues.ts.
export function useEntranceCeremony(options: UseEntranceCeremonyOptions): EntranceCeremony {
  const storage = options.storage ?? sessionStorage;
  const cues = ref<EntranceCues | null>(null);
  const active = ref(false);
  let handle: EntranceHandle | null = null;

  const played = (): boolean => storage.getItem(ENTRANCE_PLAYED_KEY) === '1';
  const markPlayed = (): void => {
    try {
      storage.setItem(ENTRANCE_PLAYED_KEY, '1');
    } catch {
      // Quota/private-mode storage failure — worst case the ceremony replays
      // next load, which is harmless.
    }
  };

  function start(): void {
    const oak = options.oak.value;
    const layout = options.layout.value;
    if (!oak || !layout || active.value) {
      return;
    }
    markPlayed();
    const targets = oak.entranceTargets();
    if (!targets.svg) {
      return;
    }
    const rect = targets.svg.getBoundingClientRect();
    const built = buildEntranceCues(layout, { width: rect.width, height: rect.height }, options.orientation.value);
    if (!built) {
      return;
    }
    cues.value = built;
    active.value = true;
    // The strata layer must be in the DOM before the timeline queries it.
    void nextTick(() => {
      if (!active.value) {
        return; // view unmounted (or ceremony cancelled) between start() and this tick
      }
      handle = playEntrance({
        svg: targets.svg!,
        viewport: targets.viewport,
        cues: built,
        onDone: () => {
          active.value = false;
          cues.value = null;
          handle = null;
        }
      });
    });
  }

  // Auto-play when the oak and the layout are first ready in this session.
  watch(
    [options.oak, options.layout],
    ([oak, layout]) => {
      if (!oak || !layout || played()) {
        return;
      }
      if (options.isDeepLink()) {
        markPlayed();
        return;
      }
      start();
    },
    { flush: 'post' }
  );

  // Note: prefersReducedMotion() is re-read whenever a dependency changes; an
  // OS toggle mid-session is picked up on the next layout/orientation change.
  const canReplay = computed(
    () =>
      !active.value &&
      options.layout.value !== null &&
      !prefersReducedMotion()
  );

  return {
    cues,
    active,
    canReplay,
    replay: start,
    skip: () => handle?.skip()
  };
}
