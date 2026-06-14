import gsap from 'gsap';
import { motionTokens } from './tokens';
import { prefersReducedMotion } from './reducedMotion';

export interface Rect { left: number; top: number; width: number; height: number; }
export interface FlipInvert { x: number; y: number; scaleX: number; scaleY: number; }

// Pure FLIP inverse: the transform (top-left origin) that places `dest` exactly
// over where `source` was. Animating from this back to identity makes `dest`
// appear to start at the source's position and size. Zero-size dest → scale 1.
export function flipInvert(source: Rect, dest: Rect): FlipInvert {
  return {
    x: source.left - dest.left,
    y: source.top - dest.top,
    scaleX: dest.width === 0 ? 1 : source.width / dest.width,
    scaleY: dest.height === 0 ? 1 : source.height / dest.height
  };
}

export interface DockMorph { finish(): void; }
export interface DockMorphCapture { play(): DockMorph | null; }

const MORPH_START_OPACITY = 0.35;
const CLEAR = 'transform,opacity,transformOrigin';

function selector(id: string): string { return `[data-flip-id="dock-card-${id}"]`; }

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

// Snapshot the morphing card (the element currently present for `id`) plus the
// other rail cards (for reflow), BEFORE the store mutation. Returns a committer
// whose play() — called after the DOM swap (await nextTick) — flies the surviving
// element from the source rect and glides the reflowed neighbours. Null under
// reduced motion or when there is no source element.
export function captureDockMorph(id: string): DockMorphCapture | null {
  if (prefersReducedMotion()) {
    return null;
  }
  const sourceEl = document.querySelector(selector(id));
  if (!sourceEl) {
    return null;
  }
  const source = rectOf(sourceEl);
  const others = new Map<string, Rect>();
  for (const el of Array.from(document.querySelectorAll('[data-flip-id]'))) {
    const fid = el.getAttribute('data-flip-id');
    if (fid && el !== sourceEl) {
      others.set(fid, rectOf(el));
    }
  }

  return {
    play(): DockMorph | null {
      const destEl = document.querySelector(selector(id));
      if (!destEl) {
        return null;
      }
      const inv = flipInvert(source, rectOf(destEl));
      const tweens: ReturnType<typeof gsap.fromTo>[] = [];
      tweens.push(gsap.fromTo(
        destEl,
        { x: inv.x, y: inv.y, scaleX: inv.scaleX, scaleY: inv.scaleY, opacity: MORPH_START_OPACITY, transformOrigin: 'top left' },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, duration: motionTokens.morph.duration, ease: motionTokens.morph.ease, clearProps: CLEAR }
      ));

      for (const el of Array.from(document.querySelectorAll('[data-flip-id]'))) {
        const fid = el.getAttribute('data-flip-id');
        if (!fid || el === destEl) {
          continue;
        }
        const prev = others.get(fid);
        if (!prev) {
          continue;
        }
        const now = rectOf(el);
        const dx = prev.left - now.left;
        const dy = prev.top - now.top;
        if (dx === 0 && dy === 0) {
          continue;
        }
        tweens.push(gsap.from(el, { x: dx, y: dy, duration: motionTokens.morph.duration, ease: motionTokens.morph.ease, clearProps: 'transform' }));
      }

      return {
        finish(): void {
          for (const t of tweens) {
            t.progress(1).kill();
          }
        }
      };
    }
  };
}
