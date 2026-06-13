// src/frontend/src/motion/entrance.ts
import gsap from 'gsap';
import type { Ref } from 'vue';
import type { Viewport } from '../interactions/panZoom';
import type { EntranceCues } from './entranceCues';
import { prefersReducedMotion } from './reducedMotion';

export interface EntranceContext {
  svg: SVGSVGElement;
  viewport: Ref<Viewport>;
  cues: EntranceCues;
  onDone: () => void;
}

export interface EntranceHandle {
  /** Render the end state immediately (interruption / tap-to-skip). */
  skip(): void;
}

const PULSE_COLOR = '#e3cf93'; // --gilt-light

// Ceremony playback speed. 0.25 = quarter-speed (the owner's chosen pacing);
// scales the whole timeline uniformly, end state unchanged. Tune here.
const CEREMONY_TIME_SCALE = 0.25;

// jsdom has no getTotalLength; a generous nominal length still draws correctly
// (overshoot only makes the draw finish marginally early).
function pathLength(el: Element): number {
  const path = el as SVGPathElement;
  return typeof path.getTotalLength === 'function' ? Math.max(1, path.getTotalLength()) : 1000;
}

// Build and start the ceremony timeline. The caller has already rendered the
// FULL tree (state first) — this only choreographs its appearance. Under
// reduced motion it applies the end state instantly and returns null.
export function playEntrance(ctx: EntranceContext): EntranceHandle | null {
  const { svg, viewport, cues, onDone } = ctx;
  if (prefersReducedMotion()) {
    viewport.value = { ...cues.finale };
    onDone();
    return null;
  }

  const sel = (query: string): Element[] => Array.from(svg.querySelectorAll(query));
  const touched: Element[] = [];
  const camera = { x: cues.rideX, y: cues.phases[0]?.cameraY ?? cues.finale.y, k: cues.rideK };
  const syncCamera = (): void => {
    viewport.value = { x: camera.x, y: camera.y, k: camera.k };
  };

  function finish(): void {
    gsap.killTweensOf(touched);
    // Clear ONLY what the ceremony animated. Never 'all': on a replay GSAP would
    // strip the nodes' layout-critical SVG transform attribute, collapsing every
    // medallion to the origin.
    gsap.set(touched, { clearProps: 'opacity,strokeDasharray,strokeDashoffset,stroke,strokeWidth' });
    viewport.value = { ...cues.finale };
    onDone();
  }

  const tl = gsap.timeline({ onComplete: finish, defaults: { ease: 'power2.inOut' } });

  // Camera to the roots before the first painted frame of the ceremony.
  syncCamera();

  // The dawn light: a soft gilt glow riding the growth front up the trunk line.
  const dawn = sel('[data-entrance-dawn]');
  touched.push(...dawn);
  if (dawn.length) {
    gsap.set(dawn, { opacity: 0, attr: { cy: cues.phases[0]?.bandY ?? 0 } });
    tl.to(dawn, { opacity: 1, duration: 0.3 }, 0);
    tl.to(dawn, { opacity: 0, duration: 0.3 }, cues.finaleStart);
  }

  for (const phase of cues.phases) {
    const nodes = sel(`[data-entrance-node="${phase.generation}"]`);
    const draws = sel(`[data-entrance-draw="${phase.generation}"]`);
    const fades = sel(`[data-entrance-fade="${phase.generation}"]`);
    const stratum = sel(`[data-stratum-gen="${phase.generation}"]`);
    touched.push(...nodes, ...draws, ...fades, ...stratum);

    // Hide everything this phase reveals (synchronous — before the browser
    // paints). Length-guarded: gsap warns on empty target arrays.
    if (nodes.length) {
      gsap.set(nodes, { opacity: 0 });
    }
    if (fades.length) {
      gsap.set(fades, { opacity: 0 });
    }
    if (stratum.length) {
      gsap.set(stratum, { opacity: 0, y: 12 });
    }
    for (const el of draws) {
      const length = pathLength(el);
      gsap.set(el, { strokeDasharray: length, strokeDashoffset: length });
    }

    // The camera climbs to the generation's band across the phase; the dawn
    // glow rides the same beat along the trunk line.
    tl.to(camera, { y: phase.cameraY, duration: phase.duration, onUpdate: syncCamera }, phase.start);
    if (dawn.length) {
      tl.to(dawn, { attr: { cy: phase.bandY }, duration: phase.duration }, phase.start);
    }
    if (draws.length) {
      tl.to(
        draws,
        { strokeDashoffset: 0, duration: phase.duration * 0.7, stagger: phase.duration * 0.05 },
        phase.start
      );
    }
    if (fades.length) {
      tl.to(fades, { opacity: 1, duration: phase.duration * 0.4 }, phase.start + phase.duration * 0.4);
    }
    if (nodes.length) {
      // Medallions settle just behind the growth front.
      tl.to(
        nodes,
        {
          opacity: 1,
          duration: phase.duration * 0.5,
          stagger: Math.min(0.05, (phase.duration * 0.3) / Math.max(1, nodes.length))
        },
        phase.start + phase.duration * 0.35
      );
    }
    if (stratum.length) {
      // The era surfaces from the parchment as the growth front arrives.
      tl.to(stratum, { opacity: 1, y: 0, duration: Math.min(0.5, phase.duration) }, phase.start);
    }
  }

  // Step-back reveal: the fitted view, numerals gliding out to the screen edges.
  tl.to(
    camera,
    { x: cues.finale.x, y: cues.finale.y, k: cues.finale.k, duration: cues.finaleDuration, onUpdate: syncCamera },
    cues.finaleStart
  );
  for (const stratum of cues.strata) {
    const numerals = sel(`[data-stratum-gen="${stratum.generation}"] text`);
    touched.push(...numerals);
    if (numerals.length) {
      tl.to(numerals, { attr: { x: stratum.finalX }, duration: cues.finaleDuration }, cues.finaleStart);
    }
  }
  // Every ring pulses gilt once — the family, complete.
  const rings = sel('.oak__gilt-band');
  touched.push(...rings);
  if (rings.length) {
    tl.to(
      rings,
      { stroke: PULSE_COLOR, strokeWidth: '+=1.5', duration: 0.18, yoyo: true, repeat: 1 },
      cues.finaleStart + cues.finaleDuration * 0.5
    );
  }

  tl.timeScale(CEREMONY_TIME_SCALE);

  return {
    skip(): void {
      tl.progress(1, false); // renders the end state and fires onComplete → finish()
      tl.kill();
    }
  };
}
