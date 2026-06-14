import { nextTick } from 'vue';
import { usePanelStore } from '../stores/panelStore';
import { captureDockMorph, type DockMorph } from '../motion/popupDock';

// Wraps the synchronous dock/undock store actions in a deterministic FLIP morph.
// State-first: capture the morphing card's bounds, mutate the store, wait for
// Vue to patch the DOM, then fly the destination from the source's bounds.
export function useDockMorph() {
  const panel = usePanelStore();
  let inFlight: DockMorph | null = null;

  async function morph(id: string | null, mutate: () => void): Promise<void> {
    // A second dock/undock completes the in-flight morph instantly first.
    inFlight?.finish();
    inFlight = null;

    const capture = id ? captureDockMorph(id) : null;
    mutate();              // synchronous, instantly correct (state-first)
    await nextTick();      // let Vue swap source out / destination in
    inFlight = capture?.play() ?? null;
  }

  return {
    undock: (id: string): Promise<void> => morph(id, () => panel.undock(id)),
    // Read biggerViewId BEFORE mutating — that's the card being docked.
    dock: (): Promise<void> => morph(panel.biggerViewId, () => panel.closeBiggerView())
  };
}
