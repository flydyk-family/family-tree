import gsap from 'gsap';
import { prefersReducedMotion } from './reducedMotion';
import { motionTokens } from './tokens';

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

const SHIMMER_SCALE = 1.03;
const GILT_FALLBACK = '#b7913f'; // --gilt in tokens.scss

function giltColor(): string {
  if (typeof getComputedStyle !== 'function') {
    return GILT_FALLBACK;
  }
  const v = getComputedStyle(document.documentElement).getPropertyValue('--gilt').trim();
  return v || GILT_FALLBACK;
}

// One-shot "comes alive" shimmer for the popup portrait ring: the border
// brightens toward gilt and the disc breathes 1.0 → 1.03 → 1.0, then returns
// (yoyo). Subtle by design. No-op under reduced motion. clearProps restores the
// exact properties the tween set (border + scale/origin) so nothing stays
// inlined — surgical, so it never disturbs an unrelated transform on the ring.
export function comesAliveShimmer(ring: Element | null): void {
  if (!ring || prefersReducedMotion()) {
    return;
  }
  gsap.to(ring, {
    borderColor: giltColor(),
    scale: SHIMMER_SCALE,
    transformOrigin: 'center center',
    duration: motionTokens.feedback.duration,
    ease: motionTokens.feedback.ease,
    repeat: 1,
    yoyo: true,
    overwrite: 'auto',
    clearProps: 'borderColor,scale,transformOrigin'
  });
}
