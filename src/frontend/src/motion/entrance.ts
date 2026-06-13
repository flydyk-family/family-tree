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

// Ceremony playback speed (the owner's chosen pacing): 0.35 ≈ a third of full
// speed. Scales the whole timeline uniformly, end state unchanged. Tune here.
const CEREMONY_TIME_SCALE = 0.35;

// The camera's never-stopping glide between generations. A blend of constant
// motion (so it keeps moving) and a smooth ease-in-out (so it slows as it meets
// each generation, then gathers speed gradually). Velocity at a band is
// GLIDE_FLOOR of the linear pace — low but never zero, so it slows, never stops.
const GLIDE_FLOOR = 0.5; // 0 → full stop at each band; 1 → perfectly constant speed
function glideEase(p: number): number {
  const smooth = p * p * p * (p * (p * 6 - 15) + 10); // smootherstep (zero-velocity ends)
  return GLIDE_FLOOR * p + (1 - GLIDE_FLOOR) * smooth;
}

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
  const headPos = cues.phases[0]?.bandPrimary ?? 0;   // initial glow position on the time axis
  const TAIL_LEN = 360;
  // The star leads each generation: it darts to the band in STAR_PATH_FRACTION of
  // the phase, arriving ahead of the camera, which then glides the whole phase to
  // centre that band (see glideEase) — so we meet each generation in the middle.
  const STAR_PATH_FRACTION = 0.85;
  const first = cues.phases[0]?.camera ?? { x: cues.finale.x, y: cues.finale.y };
  const camera = { x: first.x, y: first.y, k: cues.rideK };
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
    gsap.set(dawn, { opacity: 0, attr: cues.axis === 'y' ? { cy: headPos } : { cx: headPos } });
    tl.to(dawn, { opacity: 1, duration: 0.3 }, 0);
    const PULSE_DUR = 0.5;
    const pulseRepeat = Math.max(1, Math.ceil(cues.finaleStart / PULSE_DUR) - 1);
    tl.to(dawn, { attr: { r: 235 }, duration: PULSE_DUR, ease: 'power1.inOut', yoyo: true, repeat: pulseRepeat }, 0);
    tl.to(dawn, { opacity: 0, duration: 0.3 }, cues.finaleStart);
  }

  const star = sel('[data-entrance-star]');
  touched.push(...star);
  if (star.length) {
    gsap.set(star, { opacity: 0, attr: cues.axis === 'y' ? { cy: headPos } : { cx: headPos } });
    tl.to(star, { opacity: 0.95, duration: 0.3 }, 0);
    const TWINKLE_DUR = 0.4;
    const twinkleRepeat = Math.max(1, Math.ceil(cues.finaleStart / TWINKLE_DUR) - 1);
    tl.to(star, { opacity: 0.3, duration: TWINKLE_DUR, ease: 'sine.inOut', yoyo: true, repeat: twinkleRepeat }, 0.3);
    tl.to(star, { opacity: 0, duration: cues.finaleDuration }, cues.finaleStart);
  }

  const trace = sel('[data-entrance-trace]');
  touched.push(...trace);
  if (trace.length) {
    const traceStart: Record<string, number> = cues.axis === 'y' ? { y: headPos } : { x: headPos - TAIL_LEN };
    gsap.set(trace, { opacity: 0, attr: traceStart });
    tl.to(trace, { opacity: 1, duration: 0.3 }, 0);
    tl.to(trace, { opacity: 0, duration: cues.finaleDuration }, cues.finaleStart);
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
      gsap.set(stratum, cues.axis === 'y' ? { opacity: 0, y: 12 } : { opacity: 0, x: 12 });
    }
    for (const el of draws) {
      const length = pathLength(el);
      gsap.set(el, { strokeDasharray: length, strokeDashoffset: length });
    }

    // The star leads: it darts to the band early in the phase, ahead of the lens.
    const starDuration = phase.duration * STAR_PATH_FRACTION;
    const starEase = 'power1.inOut';
    if (dawn.length) {
      tl.to(dawn, { attr: cues.axis === 'y' ? { cy: phase.bandPrimary } : { cx: phase.bandPrimary }, duration: starDuration, ease: starEase }, phase.start);
    }
    if (star.length) {
      tl.to(star, { attr: cues.axis === 'y' ? { cy: phase.bandPrimary } : { cx: phase.bandPrimary }, duration: starDuration, ease: starEase }, phase.start);
    }
    if (trace.length) {
      tl.to(trace, { attr: cues.axis === 'y' ? { y: phase.bandPrimary } : { x: phase.bandPrimary - TAIL_LEN }, duration: starDuration, ease: starEase }, phase.start);
    }
    // One contiguous glide per phase, centring this band by the phase's end.
    // glideEase keeps the camera moving between generations and only slows — never
    // stops — as it meets each one. (Contiguous, no overwrite: it actually arrives,
    // so the generation lands in the centre of the frame rather than at the edge.)
    tl.to(camera, { x: phase.camera.x, y: phase.camera.y, duration: phase.duration, ease: glideEase, onUpdate: syncCamera }, phase.start);
    // The generation arrives in the CENTRE: branches draw as the camera climbs;
    // medallions, unions and the era surface as it centres the band (second half).
    const revealAt = phase.start + phase.duration * 0.55;
    if (draws.length) {
      tl.to(
        draws,
        { strokeDashoffset: 0, duration: phase.duration * 0.6, stagger: phase.duration * 0.05 },
        phase.start + phase.duration * 0.25
      );
    }
    if (fades.length) {
      tl.to(fades, { opacity: 1, duration: phase.duration * 0.35 }, revealAt);
    }
    if (nodes.length) {
      tl.to(
        nodes,
        {
          opacity: 1,
          duration: phase.duration * 0.4,
          stagger: Math.min(0.05, (phase.duration * 0.3) / Math.max(1, nodes.length))
        },
        revealAt
      );
    }
    if (stratum.length) {
      // The era surfaces from the parchment as the camera centres the level.
      tl.to(stratum, cues.axis === 'y' ? { opacity: 1, y: 0, duration: Math.min(0.5, phase.duration) } : { opacity: 1, x: 0, duration: Math.min(0.5, phase.duration) }, revealAt);
    }
  }

  // Step-back reveal: it settles on the most recent generations (not the whole
  // tree), numerals gliding out to the screen edges. It picks up contiguously
  // from the last band's glide, so the climb flows straight into the finale.
  tl.to(
    camera,
    { x: cues.finale.x, y: cues.finale.y, k: cues.finale.k, duration: cues.finaleDuration, onUpdate: syncCamera },
    cues.finaleStart
  );
  for (const stratum of cues.strata) {
    const numerals = sel(`[data-stratum-gen="${stratum.generation}"] text`);
    touched.push(...numerals);
    if (numerals.length) {
      tl.to(numerals, { attr: cues.axis === 'y' ? { x: stratum.crossFinal } : { y: stratum.crossFinal }, duration: cues.finaleDuration }, cues.finaleStart);
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
