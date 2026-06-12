import gsap from 'gsap';
import { motionTokens } from './tokens';
import { prefersReducedMotion } from './reducedMotion';

export interface PaintSnapshot {
  el: Element;
  vars: { fill?: string; stroke?: string; strokeWidth?: string };
}

// CSS classes own every visual state; these helpers only interpolate between
// them. Capture BEFORE the class flip, tween AFTER Vue has patched the DOM.
export function capturePaint(els: Iterable<Element>): PaintSnapshot[] {
  const snapshots: PaintSnapshot[] = [];
  for (const el of els) {
    const style = getComputedStyle(el);
    const vars: PaintSnapshot['vars'] = {};
    const fill = style.getPropertyValue('fill');
    const stroke = style.getPropertyValue('stroke');
    const strokeWidth = style.getPropertyValue('stroke-width');
    if (fill) {
      vars.fill = fill;
    }
    if (stroke) {
      vars.stroke = stroke;
    }
    if (strokeWidth) {
      vars.strokeWidth = strokeWidth;
    }
    snapshots.push({ el, vars });
  }
  return snapshots;
}

export function tweenFromPaint(snapshots: PaintSnapshot[]): void {
  if (prefersReducedMotion()) {
    return;
  }
  for (const { el, vars } of snapshots) {
    if (Object.keys(vars).length === 0) {
      continue;
    }
    gsap.from(el, {
      ...vars,
      duration: motionTokens.feedback.duration,
      ease: motionTokens.feedback.ease,
      overwrite: 'auto',
      // Leave no inline styles behind, or they would mask future class flips.
      clearProps: 'fill,stroke,strokeWidth'
    });
  }
}
