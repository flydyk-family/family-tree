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
const DIALOG_CLASS = 'popup__dialog';
const CLONE_Z = 80;

function selector(id: string): string { return `[data-flip-id="dock-card-${id}"]`; }

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

// The nearest scrollable ancestor (overflow-y auto|scroll), or null. Stops at
// <body> so we never touch the document's own scroll.
function scrollParent(el: Element): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === 'auto' || oy === 'scroll') {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

// A detached, top-layer clone of the dialog pinned at `rect`. Docking animates
// this instead of the real rail card, because the rail card lives inside a
// scrollable (clipping) container — a clone in the body flies unclipped.
function makeDialogClone(dialog: Element, rect: Rect): HTMLElement {
  const clone = dialog.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-flip-id');
  clone.removeAttribute('data-test');
  Object.assign(clone.style, {
    position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
    width: `${rect.width}px`, height: `${rect.height}px`, margin: '0',
    boxSizing: 'border-box', overflow: 'hidden', pointerEvents: 'none',
    zIndex: String(CLONE_Z), transformOrigin: 'top left'
  });
  return clone;
}

// Snapshot the morphing card (the element currently present for `id`) plus the
// other rail cards (for reflow), BEFORE the store mutation. Returns a committer
// whose play() — called after the DOM swap (await nextTick) — animates the morph
// and glides the reflowed neighbours. Null under reduced motion or when there is
// no source element.
export function captureDockMorph(id: string): DockMorphCapture | null {
  if (prefersReducedMotion()) {
    return null;
  }
  const sourceEl = document.querySelector(selector(id));
  if (!sourceEl) {
    return null;
  }
  const source = rectOf(sourceEl);
  // Docking: the source IS the popup dialog. It unmounts and reveals a rail card
  // that sits in a clipping container, so fly an unclipped clone of the dialog.
  const clone = sourceEl.classList.contains(DIALOG_CLASS) ? makeDialogClone(sourceEl, source) : null;

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
        clone?.remove();
        return null;
      }
      const dest = rectOf(destEl);
      const tweens: ReturnType<typeof gsap.fromTo>[] = [];

      // A reflowed card is briefly translated out of place, and a transformed
      // descendant grows a scroll container's overflow — which pops a scrollbar
      // and shakes the rail. Hide overflow for the duration on any container that
      // is not already scrolling, then restore it.
      const lockedScrollers: { el: HTMLElement; prev: string }[] = [];
      const restoreScrollers = (): void => {
        for (const lock of lockedScrollers) {
          lock.el.style.overflow = lock.prev;
        }
        lockedScrollers.length = 0;
      };

      if (clone) {
        // Dock: the dialog clone shrinks from its old rect into the rail slot and
        // fades out, while the real rail card fades in beneath it.
        document.body.appendChild(clone);
        tweens.push(gsap.to(clone, {
          x: dest.left - source.left,
          y: dest.top - source.top,
          scaleX: source.width === 0 ? 1 : dest.width / source.width,
          scaleY: source.height === 0 ? 1 : dest.height / source.height,
          opacity: 0,
          duration: motionTokens.morph.duration,
          ease: motionTokens.morph.ease,
          onComplete: () => { clone.remove(); restoreScrollers(); }
        }));
        tweens.push(gsap.fromTo(destEl,
          { opacity: 0 },
          { opacity: 1, duration: motionTokens.morph.duration, ease: motionTokens.morph.ease, clearProps: 'opacity' }
        ));
      } else {
        // Undock: the dialog flies from the rail card's rect, growing out of the slot.
        const inv = flipInvert(source, dest);
        tweens.push(gsap.fromTo(destEl,
          { x: inv.x, y: inv.y, scaleX: inv.scaleX, scaleY: inv.scaleY, opacity: MORPH_START_OPACITY, transformOrigin: 'top left' },
          { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, duration: motionTokens.morph.duration, ease: motionTokens.morph.ease, clearProps: CLEAR, onComplete: restoreScrollers }
        ));
      }

      // Neighbour reflow (both directions): any other card still present that
      // shifted glides from its old position to its new one.
      const movers: { el: Element; dx: number; dy: number }[] = [];
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
        movers.push({ el, dx, dy });
      }

      // Lock the movers' scroll containers BEFORE the tweens apply any transform,
      // and only when a container is not already scrolling (so we never strip a
      // genuinely-needed scrollbar).
      for (const mover of movers) {
        const sp = scrollParent(mover.el);
        if (sp && sp.scrollHeight <= sp.clientHeight && !lockedScrollers.some(lock => lock.el === sp)) {
          lockedScrollers.push({ el: sp, prev: sp.style.overflow });
          sp.style.overflow = 'hidden';
        }
      }
      for (const mover of movers) {
        tweens.push(gsap.from(mover.el, { x: mover.dx, y: mover.dy, duration: motionTokens.morph.duration, ease: motionTokens.morph.ease, clearProps: 'transform' }));
      }

      return {
        finish(): void {
          for (const t of tweens) {
            t.progress(1).kill();
          }
          restoreScrollers();
          clone?.remove();
        }
      };
    }
  };
}
