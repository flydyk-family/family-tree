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
