export interface MotionToken {
  duration: number; // seconds (GSAP convention)
  ease: string;
}

// The app's single timing language ("Ceremonial unfurl" personality: calm,
// no overshoot). Durations in seconds because every consumer is a GSAP tween;
// applyMotionTokensToRoot mirrors them as ms for any CSS that needs them.
export const motionTokens = {
  fade: { duration: 0.15, ease: 'power1.out' },
  feedback: { duration: 0.3, ease: 'power1.out' },
  glide: { duration: 0.35, ease: 'power2.inOut' },
  cascade: { duration: 0.4, ease: 'power1.out' },
  morph: { duration: 0.45, ease: 'power2.inOut' },
  layoutSwitch: { duration: 0.7, ease: 'power2.inOut' },
  ceremony: { duration: 4, ease: 'power2.inOut' }
} as const satisfies Record<string, MotionToken>;

export function applyMotionTokensToRoot(root: HTMLElement = document.documentElement): void {
  for (const [name, token] of Object.entries(motionTokens)) {
    const kebab = name.replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`);
    root.style.setProperty(`--motion-${kebab}-ms`, `${Math.round(token.duration * 1000)}ms`);
  }
}
