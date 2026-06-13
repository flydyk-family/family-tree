// src/frontend/src/motion/entranceCues.ts
import type { TreeLayout, LayoutNode } from '../layout/treeLayout';
import { fitToBounds, type Size, type Viewport } from '../interactions/panZoom';
import { motionTokens } from './tokens';

export interface GenerationPhase {
  generation: number;
  nodeIds: string[];
  drawLinkIds: string[]; // descent links whose target is born in this phase
  fadeLinkIds: string[]; // dashed union links — dashoffset drawing can't coexist with a dash pattern
  bandY: number;         // world y the camera centres on
  cameraY: number;       // precomputed viewport.y for that centring (clamped to content)
  year: number;          // median birth year of the band — the stratum label
  start: number;         // seconds from ceremony start
  duration: number;
}

export interface Stratum {
  generation: number;
  year: number;
  label: string;
  y: number;
  side: 'left' | 'right';
  rideX: number;  // world x while riding (whole inside the ride window)
  finalX: number; // world x after the step-back (whole at the screen edge)
  start: number;
}

export interface EntranceCues {
  rideK: number;
  rideX: number; // constant horizontal translate for the whole climb — no sideways motion
  dawnX: number; // world x of the dawn-light glow (the tree's horizontal centre)
  phases: GenerationPhase[];
  strata: Stratum[];
  finale: Viewport;
  finaleStart: number;
  finaleDuration: number;
  total: number;
}

const PADDING = 60;        // matches usePanZoom's fit padding
const MAX_RIDE_K = 1;      // never enlarge cards past natural size
const MIN_PHASE = 0.45;    // seconds — keeps 10-generation families under ~5.3 s total
const MAX_PHASE = 0.9;
const FINALE_DURATION = 0.8;
const STRATUM_MARGIN = 72; // screen px between a numeral anchor and the frame edge

// Pure cue sheet: every number the entrance timeline needs, derived from the
// layout and the viewport size. No DOM, no gsap — fully unit-testable.
export function buildEntranceCues(layout: TreeLayout, size: Size): EntranceCues | null {
  // width must exceed the two padding gutters or the ride zoom would go negative
  if (layout.nodes.length === 0 || size.width <= PADDING * 2 || size.height <= 0) {
    return null;
  }

  const byGeneration = new Map<number, LayoutNode[]>();
  for (const node of layout.nodes) {
    const row = byGeneration.get(node.generation) ?? [];
    row.push(node);
    byGeneration.set(node.generation, row);
  }
  const generations = [...byGeneration.keys()].sort((a, b) => a - b);

  const genOf = new Map(layout.nodes.map(node => [node.id, node.generation]));
  const drawByGen = new Map<number, string[]>();
  const fadeByGen = new Map<number, string[]>();
  for (const link of layout.links) {
    // A union joins two contemporaries but may span generations; reveal it
    // only once BOTH partners are on stage. Descent reveals with the child.
    const gen =
      link.kind === 'union'
        ? Math.max(genOf.get(link.source) ?? 0, genOf.get(link.target) ?? 0)
        : genOf.get(link.target) ?? 0;
    const bucket = link.kind === 'descent' ? drawByGen : fadeByGen;
    const list = bucket.get(gen) ?? [];
    list.push(link.id);
    bucket.set(gen, list);
  }

  const rideK = Math.min(MAX_RIDE_K, (size.width - PADDING * 2) / Math.max(1, layout.width));
  const centerX = (layout.bounds.minX + layout.bounds.maxX) / 2;
  const rideX = size.width / 2 - centerX * rideK;

  // Clamp band centring so the window never overshoots the content vertically.
  const halfWindow = size.height / 2 / rideK;
  const padWorld = PADDING / rideK;
  const cyMin = layout.bounds.minY - padWorld + halfWindow;
  const cyMax = layout.bounds.maxY + padWorld - halfWindow;
  const clampCy = (cy: number): number =>
    cyMin > cyMax
      ? (layout.bounds.minY + layout.bounds.maxY) / 2 // window taller than the tree — no travel
      : Math.min(Math.max(cy, cyMin), cyMax);

  const phaseDuration = Math.min(
    MAX_PHASE,
    Math.max(MIN_PHASE, (motionTokens.ceremony.duration - FINALE_DURATION) / generations.length)
  );

  const phases: GenerationPhase[] = generations.map((generation, i) => {
    const row = byGeneration.get(generation)!;
    const bandY = row.reduce((total, node) => total + node.y, 0) / row.length;
    const years = row.map(node => node.year).sort((a, b) => a - b);
    const year = years[Math.floor(years.length / 2)];
    return {
      generation,
      nodeIds: row.map(node => node.id),
      drawLinkIds: drawByGen.get(generation) ?? [],
      fadeLinkIds: fadeByGen.get(generation) ?? [],
      bandY,
      cameraY: size.height / 2 - clampCy(bandY) * rideK,
      year,
      start: i * phaseDuration,
      duration: phaseDuration
    };
  });

  const finale = fitToBounds(layout.bounds, size, PADDING, MAX_RIDE_K);
  const strata: Stratum[] = phases.map((phase, i) => {
    const side: 'left' | 'right' = i % 2 === 0 ? 'right' : 'left';
    const edge = (margin: number, x: number, k: number): number =>
      side === 'right' ? (size.width - margin - x) / k : (margin - x) / k;
    return {
      generation: phase.generation,
      year: phase.year,
      label: String(phase.year),
      y: layout.scale.yForYear(phase.year),
      side,
      rideX: edge(STRATUM_MARGIN, rideX, rideK),
      finalX: edge(STRATUM_MARGIN, finale.x, finale.k),
      start: phase.start
    };
  });

  const finaleStart = generations.length * phaseDuration;
  return {
    rideK,
    rideX,
    dawnX: centerX,
    phases,
    strata,
    finale,
    finaleStart,
    finaleDuration: FINALE_DURATION,
    total: finaleStart + FINALE_DURATION
  };
}
