import gsap from 'gsap';
import { prefersReducedMotion } from './reducedMotion';

// Personality A (calm, no overshoot). Hover values echo the parent motion spec
// §4: scale 1.03, 250 ms in / 300 ms out, with a faint frame brighten.
const HOVER_SCALE = 1.03;
const HOVER_IN = 0.25;
const HOVER_OUT = 0.3;
const HOVER_BRIGHTNESS = 1.06;

// Lift a medallion card group on pointer hover and settle it back on leave.
// Scales about the card's own centre (composes with the node's layout
// translate, which lives on the parent group). No-op under reduced motion —
// the resting state is the only state.
export function hoverLift(card: Element | null, lifted: boolean): void {
  if (!card || prefersReducedMotion()) {
    return;
  }
  gsap.to(card, {
    scale: lifted ? HOVER_SCALE : 1,
    filter: `brightness(${lifted ? HOVER_BRIGHTNESS : 1})`,
    transformOrigin: 'center center',
    duration: lifted ? HOVER_IN : HOVER_OUT,
    ease: 'power1.out',
    overwrite: 'auto'
  });
}
