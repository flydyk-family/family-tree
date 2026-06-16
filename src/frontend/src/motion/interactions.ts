import gsap from 'gsap';
import { prefersReducedMotion } from './reducedMotion';

// Personality A (calm, no overshoot). Hover values echo the parent motion spec
// §4: scale 1.03, 250 ms in / 300 ms out.
const HOVER_SCALE = 1.03;
const HOVER_IN = 0.25;
const HOVER_OUT = 0.3;

// Lift a medallion card group on pointer hover and settle it back on leave.
// Scales about the card's own centre (composes with the node's layout
// translate, which lives on the parent group). No-op under reduced motion —
// the resting state is the only state.
//
// Deliberately a pure transform — NO `filter` brighten: GSAP interpolating a
// CSS filter from the element's unset (`none`) state flashes through
// `brightness(0)` for a frame, reading as a black blink over the dark portrait
// mount. A scalar transform is GPU-composited and never re-rasterizes.
export function hoverLift(card: Element | null, lifted: boolean): void {
  if (!card || prefersReducedMotion()) {
    return;
  }
  gsap.to(card, {
    scale: lifted ? HOVER_SCALE : 1,
    transformOrigin: 'center center',
    duration: lifted ? HOVER_IN : HOVER_OUT,
    ease: 'power1.out',
    overwrite: 'auto'
  });
}
