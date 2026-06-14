import { computed, ref, watch, type Ref } from 'vue';
import gsap from 'gsap';
import type { TreeLayout } from '../layout/treeLayout';
import type { Orientation } from '../stores/uiStore';
import type { Bounds } from '../interactions/panZoom';
import { projectLayout } from '../layout/projection';
import { initialFocusBounds } from '../layout/focusBounds';
import { blendLayout } from '../motion/layoutFlip';
import { motionTokens } from '../motion/tokens';
import { prefersReducedMotion } from '../motion/reducedMotion';

// OakTree exposes this so the morph can re-frame the camera with the SVG rect.
export interface CameraHandle {
  animateFitTo(bounds: Bounds, durationSec: number): void;
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

    // Re-frame the camera: glide when animating, snap (duration 0) otherwise.
    // glideTo also snaps under reduced motion as a backstop.
    oak.value?.animateFitTo(initialFocusBounds(toLayout.nodes), motion ? motionTokens.layoutSwitch.duration : 0);

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
