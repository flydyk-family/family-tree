import gsap from 'gsap';
import { motionTokens } from './tokens';
import { prefersReducedMotion } from './reducedMotion';

// Fade an element in from transparent. Instant under reduced motion.
export function fadeIn(el: Element): void {
  if (prefersReducedMotion()) {
    gsap.set(el, { opacity: 1 });
    return;
  }
  gsap.fromTo(
    el,
    { opacity: 0 },
    { opacity: 1, duration: motionTokens.fade.duration, ease: motionTokens.fade.ease }
  );
}

// Tween an element to a target opacity (overlay crossfade). Instant under reduced motion.
export function fadeTo(el: Element, opacity: number): void {
  if (prefersReducedMotion()) {
    gsap.set(el, { opacity });
    return;
  }
  gsap.to(el, {
    opacity,
    duration: motionTokens.feedback.duration,
    ease: motionTokens.feedback.ease,
    overwrite: 'auto'
  });
}

// Set opacity immediately (no tween) — used to seed the overlay at mount.
export function setOpacity(el: Element, opacity: number): void {
  gsap.set(el, { opacity });
}
