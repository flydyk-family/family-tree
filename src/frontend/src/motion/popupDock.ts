import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { motionTokens } from './tokens';
import { prefersReducedMotion } from './reducedMotion';

// Register Flip once, here — the single place the app touches gsap/Flip.
gsap.registerPlugin(Flip);

// Every card that can morph (the popup dialog + each person's rail panel/chip)
// carries a data-flip-id; the stats panel deliberately has none, so it is left
// out of the capture and never animates.
export const DOCK_FLIP_SELECTOR = '[data-flip-id]';

export interface DockMorph {
  // Jump to the end state immediately (used when a new morph starts mid-flight).
  finish(): void;
}

export interface DockMorphCapture {
  // Call AFTER the DOM has been mutated and patched (await nextTick): flies the
  // destination card from the source's captured bounds. Null if Flip found
  // nothing to animate.
  play(): DockMorph | null;
}

// Snapshot the current rail/popup card layout. Returns a committer, or null
// under reduced motion (the caller should just mutate state and let it snap).
export function captureDockMorph(): DockMorphCapture | null {
  if (prefersReducedMotion()) {
    return null;
  }
  const state = Flip.getState(DOCK_FLIP_SELECTOR, { props: 'borderRadius' });
  return {
    play(): DockMorph | null {
      const tl = Flip.from(state, {
        duration: motionTokens.morph.duration,
        ease: motionTokens.morph.ease,
        absolute: true,   // float the morphing cards so neighbours reflow cleanly
        fade: true,       // cross-fade the swapped (different-content) source/target
        props: 'borderRadius',
        overwrite: 'auto'
      });
      if (!tl) {
        return null;
      }
      return {
        finish(): void {
          tl.progress(1);
          tl.kill();
        }
      };
    }
  };
}
