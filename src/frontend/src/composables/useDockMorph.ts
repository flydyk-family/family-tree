import { nextTick } from 'vue';
import { usePanelStore } from '../stores/panelStore';
import { captureDockMorph, type DockMorph } from '../motion/popupDock';

// Wraps the synchronous dock/undock store actions in a Flip shared-element
// morph. State-first: capture bounds, mutate the store, wait for Vue to patch
// the DOM, then fly the destination card from the source's bounds.
export function useDockMorph() {
  const panel = usePanelStore();
  let inFlight: DockMorph | null = null;

  async function morph(mutate: () => void): Promise<void> {
    // A second dock/undock completes the in-flight morph instantly first.
    inFlight?.finish();
    inFlight = null;

    const capture = captureDockMorph();
    mutate();              // synchronous, instantly correct (state-first)
    await nextTick();      // let Vue swap source out / destination in
    inFlight = capture?.play() ?? null;
  }

  return {
    undock: (id: string): Promise<void> => morph(() => panel.undock(id)),
    dock: (): Promise<void> => morph(() => panel.closeBiggerView())
  };
}
