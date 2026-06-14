import { nextTick } from 'vue';
import { usePanelStore } from '../stores/panelStore';
import { captureDockMorph, captureGrowMorph, type DockMorph } from '../motion/popupDock';

// Wraps the synchronous dock/undock/open store actions in a deterministic FLIP
// morph. State-first: capture bounds, mutate the store, wait for Vue to patch
// the DOM, then animate.
export function useDockMorph() {
  const panel = usePanelStore();
  let inFlight: DockMorph | null = null;

  async function morph(id: string | null, mutate: () => void): Promise<void> {
    inFlight?.finish();
    inFlight = null;
    const capture = id ? captureDockMorph(id) : null;
    mutate();
    await nextTick();
    inFlight = capture?.play() ?? null;
  }

  // Open the bigger view by growing it out of `sourceEl` (a clicked medallion).
  async function growFrom(id: string, sourceEl: Element | null, mutate: () => void): Promise<void> {
    inFlight?.finish();
    inFlight = null;
    const capture = sourceEl ? captureGrowMorph(sourceEl) : null;
    mutate();
    await nextTick();
    inFlight = capture?.play(id) ?? null;
  }

  return {
    undock: (id: string): Promise<void> => morph(id, () => panel.undock(id)),
    dock: (): Promise<void> => morph(panel.biggerViewId, () => panel.closeBiggerView()),
    openFrom: (id: string, sourceEl: Element | null): Promise<void> => growFrom(id, sourceEl, () => panel.openBiggerView(id))
  };
}
