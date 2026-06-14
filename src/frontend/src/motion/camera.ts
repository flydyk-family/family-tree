import gsap from 'gsap';
import type { Ref } from 'vue';
import type { Viewport } from '../interactions/panZoom';
import { motionTokens } from './tokens';
import { prefersReducedMotion } from './reducedMotion';

export interface CameraGlide {
  kill(): void;
}

// Glide a pan/zoom viewport ref to `target`. The tween runs on a detached
// proxy and writes back through the ref each tick, so Vue reactivity stays
// the single source of truth. Returns null when it snapped instantly.
export function glideTo(
  viewport: Ref<Viewport>,
  target: Viewport,
  options?: { duration?: number; onComplete?: () => void }
): CameraGlide | null {
  const duration = options?.duration ?? motionTokens.glide.duration;
  if (duration <= 0 || prefersReducedMotion()) {
    viewport.value = { ...target };
    return null;
  }
  const proxy: Viewport = { ...viewport.value };
  return gsap.to(proxy, {
    x: target.x,
    y: target.y,
    k: target.k,
    duration,
    ease: motionTokens.glide.ease,
    overwrite: 'auto',
    onUpdate: () => {
      viewport.value = { x: proxy.x, y: proxy.y, k: proxy.k };
    },
    onComplete: options?.onComplete
  });
}
