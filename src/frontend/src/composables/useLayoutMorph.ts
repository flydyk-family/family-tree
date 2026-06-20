import { computed, ref, watch, type Ref } from 'vue';
import gsap from 'gsap';
import type { LayoutNode, TreeLayout } from '../layout/treeLayout';
import type { Orientation } from '../stores/uiStore';
import type { Bounds, Point } from '../interactions/panZoom';
import { projectLayout } from '../layout/projection';
import { defaultRootFocusBounds } from '../layout/focusBounds';
import { blendLayout } from '../motion/layoutFlip';
import { motionTokens } from '../motion/tokens';
import { prefersReducedMotion } from '../motion/reducedMotion';

// OakTree exposes this so the morph can re-frame the camera with the SVG rect.
export interface CameraHandle {
  animateFitTo(bounds: Bounds, durationSec: number): void;
  // The content point under the viewport centre (to find what's framed now).
  viewportCenterContent(): Point | null;
  // Glide a content point to the viewport centre without changing zoom.
  recenterOn(point: Point, durationSec: number): void;
}

// Nearest node to a content-space point (by squared distance).
function nearestNode(nodes: LayoutNode[], point: Point): LayoutNode | null {
  let best: LayoutNode | null = null;
  let bestDistance = Infinity;
  for (const node of nodes) {
    const distance = (node.x - point.x) ** 2 + (node.y - point.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }
  return best;
}

export interface LayoutMorphOptions {
  baseLayout: Ref<TreeLayout | null>;       // unprojected
  orientation: Ref<Orientation>;
  orientationExplicit: Ref<boolean>;        // false for responsive/first-load
  oak: Ref<CameraHandle | null>;
}

function other(o: Orientation): Orientation {
  return o === 'vertical' ? 'horizontal' : 'vertical';
}

export function useLayoutMorph(options: LayoutMorphOptions) {
  const { baseLayout, orientation, orientationExplicit, oak } = options;

  const settledLayout = computed<TreeLayout | null>(() =>
    baseLayout.value ? projectLayout(baseLayout.value, orientation.value) : null
  );

  const progress = ref(0);
  const morphing = ref(false);
  // from/to are snapshots captured at morph start; they intentionally do not
  // track baseLayout changes mid-morph (a data reload settles at onComplete).
  let from: TreeLayout | null = null;
  let to: TreeLayout | null = null;
  let inFlight: gsap.core.Tween | null = null;

  // progress(1) triggers onUpdate (writing progress.value = 1); kill() suppresses
  // onComplete, so morphing is reset by the caller, not here.
  function finishInFlight(): void {
    if (inFlight) {
      inFlight.progress(1).kill();
      inFlight = null;
    }
  }

  const displayLayout = computed<TreeLayout | null>(() => {
    if (morphing.value && from && to) {
      return blendLayout(from, to, progress.value);
    }
    return settledLayout.value;
  });

  // While fading out (first half) keep the OLD orientation's branch curve form;
  // after the hidden midpoint use the new form. orientation.value is already the
  // new value (state-first), so the old one is its opposite.
  const branchOrientation = computed<Orientation>(() =>
    morphing.value && progress.value < 0.5 ? other(orientation.value) : orientation.value
  );

  watch(orientation, (next, prev) => {
    if (!baseLayout.value) {
      return;
    }
    const toLayout = projectLayout(baseLayout.value, next);
    const motion = orientationExplicit.value && !prefersReducedMotion();
    const duration = motion ? motionTokens.layoutSwitch.duration : 0;

    // Re-frame the camera: glide when animating, snap (duration 0) otherwise.
    // On an explicit user flip, PRESERVE the focused area — keep the person the
    // user is looking at centred at the same zoom in the new orientation. The
    // focal node is found from the OLD layout + current camera (neither has moved
    // yet when this watcher runs). Fall back to framing the default-root family
    // when there's nothing framed yet (first load / responsive orientation).
    let reframed = false;
    if (orientationExplicit.value) {
      const center = oak.value?.viewportCenterContent() ?? null;
      if (center) {
        const fromLayout = projectLayout(baseLayout.value, prev);
        const focal = nearestNode(fromLayout.nodes, center);
        const moved = focal ? toLayout.nodes.find(node => node.id === focal.id) : null;
        if (moved) {
          oak.value?.recenterOn({ x: moved.x, y: moved.y }, duration);
          reframed = true;
        }
      }
    }
    if (!reframed) {
      oak.value?.animateFitTo(defaultRootFocusBounds(toLayout.nodes), duration);
    }

    finishInFlight();
    if (!motion) {
      morphing.value = false; // displayLayout falls through to settledLayout
      return;
    }
    from = projectLayout(baseLayout.value, prev);
    to = toLayout;
    progress.value = 0;
    morphing.value = true;
    const proxy = { t: 0 };
    inFlight = gsap.to(proxy, {
      t: 1,
      duration: motionTokens.layoutSwitch.duration,
      ease: 'none', // linear; per-node easing lives in layoutFlip
      onUpdate: () => { progress.value = proxy.t; },
      onComplete: () => { morphing.value = false; inFlight = null; progress.value = 0; },
      // If the tween is killed without finishInFlight re-starting one (e.g. an
      // external timeline clear), don't leave morphing stuck true.
      onInterrupt: () => { morphing.value = false; inFlight = null; progress.value = 0; }
    });
  });

  return { displayLayout, morphProgress: progress, branchOrientation, morphing };
}
