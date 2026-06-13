// src/frontend/src/motion/entranceCues.ts
import type { TreeLayout, LayoutNode } from '../layout/treeLayout';
import { fitToBounds, type Size, type Viewport } from '../interactions/panZoom';
import type { Orientation } from '../stores/uiStore';
import { motionTokens } from './tokens';

// The ceremony plays along a TIME axis and a CROSS axis. Vertical orientation
// climbs the Y axis (oldest at the bottom); horizontal pans the X axis (oldest
// at the left). 'y' / 'x' name the world axis that time runs along.
export type TimeAxis = 'x' | 'y';

export interface GenerationPhase {
  generation: number;
  nodeIds: string[];
  drawLinkIds: string[]; // descent links whose target is born in this phase
  fadeLinkIds: string[]; // dashed union links — dashoffset drawing can't coexist with a dash pattern
  bandPrimary: number;   // world coord on the TIME axis the camera centres on (and the glow rides)
  camera: { x: number; y: number }; // full viewport translate for that band (cross centred)
  year: number;          // median birth year of the band — the stratum label
  start: number;         // seconds from ceremony start
  duration: number;
}

export interface Stratum {
  generation: number;
  year: number;
  label: string;
  linePos: number;        // world coord on the TIME axis (the era line sits here)
  side: 'start' | 'end';  // which CROSS-axis edge the numeral anchors to
  crossRide: number;      // world coord on the CROSS axis while riding (numeral whole in window)
  crossFinal: number;     // world coord on the CROSS axis after the step-back (numeral at the edge)
  start: number;
}

export interface EntranceCues {
  axis: TimeAxis;
  rideK: number;
  dawnCross: number; // CROSS-axis centre of the tree (the trunk centreline the glow rides along)
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
const FINALE_GENERATIONS = 4; // the step-back settles on the most recent generations,
                              // not the whole tree (which can span centuries)
const STRATUM_MARGIN = 72; // screen px between a numeral anchor and the frame edge
const MIN_TRAVEL_RATIO = 1.8; // ride zoom makes the tree at least this many viewport
                              // lengths along the time axis, so there is always travel
// A medallion's portrait reaches a little above/left of its node centre; its
// scroll cartouche hangs well below. Card extents the clamp must keep on-screen
// so the root card is fully framed at the start.
const CARD_OVERHANG_ABOVE = 60;
const CARD_OVERHANG_BELOW = 160;
const CARD_OVERHANG_SIDE = 110; // scroll half-width, used on the horizontal time axis

// Pure cue sheet: every number the entrance timeline needs, derived from the
// (already orientation-projected) layout and the viewport size. No DOM, no gsap.
export function buildEntranceCues(
  layout: TreeLayout,
  size: Size,
  orientation: Orientation = 'vertical'
): EntranceCues | null {
  const axis: TimeAxis = orientation === 'vertical' ? 'y' : 'x';
  // Along the time axis the camera travels; across it the tree is fitted.
  const viewportPrimary = axis === 'y' ? size.height : size.width;
  const viewportCross = axis === 'y' ? size.width : size.height;
  // The cross axis is the one we fit, so it must clear the two padding gutters.
  if (layout.nodes.length === 0 || viewportCross <= PADDING * 2 || viewportPrimary <= 0) {
    return null;
  }

  const primaryOf = (node: LayoutNode): number => (axis === 'y' ? node.y : node.x);
  const primaryMin = axis === 'y' ? layout.bounds.minY : layout.bounds.minX;
  const primaryMax = axis === 'y' ? layout.bounds.maxY : layout.bounds.maxX;
  const crossMin = axis === 'y' ? layout.bounds.minX : layout.bounds.minY;
  const crossMax = axis === 'y' ? layout.bounds.maxX : layout.bounds.maxY;
  const primarySize = primaryMax - primaryMin;
  const crossSize = crossMax - crossMin;

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

  // Ride zoom: fit the tree across the cross axis, but never so small that the
  // whole tree fits along the time axis — there must be travel. Capped at natural
  // card size. On narrow screens the tree ends up larger than the frame across
  // the cross axis (centred, no cross-tracking); its full breadth is revealed by
  // the step-back finale.
  const kFit = (viewportCross - PADDING * 2) / Math.max(1, crossSize);
  const kTravel = (MIN_TRAVEL_RATIO * viewportPrimary) / Math.max(1, primarySize);
  const rideK = Math.min(MAX_RIDE_K, Math.max(kFit, kTravel));

  const crossCenter = (crossMin + crossMax) / 2;
  const crossTranslateRide = viewportCross / 2 - crossCenter * rideK;

  // Clamp band centring to the CARD extent (not just node centres) so the
  // root card at the far end of the time axis is fully framed at the start.
  const halfWindow = viewportPrimary / 2 / rideK;
  const padWorld = PADDING / rideK;
  const overhangAtMin = axis === 'y' ? CARD_OVERHANG_ABOVE : CARD_OVERHANG_SIDE;
  const overhangAtMax = axis === 'y' ? CARD_OVERHANG_BELOW : CARD_OVERHANG_SIDE;
  const contentMin = primaryMin - overhangAtMin;
  const contentMax = primaryMax + overhangAtMax;
  const pMin = contentMin - padWorld + halfWindow;
  const pMax = contentMax + padWorld - halfWindow;
  const clampPrimary = (p: number): number =>
    pMin > pMax
      ? (contentMin + contentMax) / 2 // window longer than the tree — no travel
      : Math.min(Math.max(p, pMin), pMax);

  // Place the camera so the cross axis is centred and `primary` sits at the
  // centre of the time axis on screen.
  const cameraFor = (primary: number): { x: number; y: number } => {
    const along = viewportPrimary / 2 - clampPrimary(primary) * rideK;
    return axis === 'y'
      ? { x: crossTranslateRide, y: along }
      : { x: along, y: crossTranslateRide };
  };

  const phaseDuration = Math.min(
    MAX_PHASE,
    Math.max(MIN_PHASE, (motionTokens.ceremony.duration - FINALE_DURATION) / generations.length)
  );

  const phases: GenerationPhase[] = generations.map((generation, i) => {
    const row = byGeneration.get(generation)!;
    const bandPrimary = row.reduce((sum, node) => sum + primaryOf(node), 0) / row.length;
    const years = row.map(node => node.year).sort((a, b) => a - b);
    const year = years[Math.floor(years.length / 2)];
    return {
      generation,
      nodeIds: row.map(node => node.id),
      drawLinkIds: drawByGen.get(generation) ?? [],
      fadeLinkIds: fadeByGen.get(generation) ?? [],
      bandPrimary,
      camera: cameraFor(bandPrimary),
      year,
      start: i * phaseDuration,
      duration: phaseDuration
    };
  });

  // The step-back no longer pulls all the way out to the whole tree; it settles
  // on the most recent FINALE_GENERATIONS, framed with the cards' overhang so no
  // medallion is clipped. (With fewer generations than that, it frames them all.)
  const recentGens = new Set(generations.slice(-FINALE_GENERATIONS));
  const recentNodes = layout.nodes.filter(node => recentGens.has(node.generation));
  const finaleBounds =
    recentNodes.length > 0
      ? recentNodes.reduce(
          (bounds, node) => ({
            minX: Math.min(bounds.minX, node.x - CARD_OVERHANG_SIDE),
            maxX: Math.max(bounds.maxX, node.x + CARD_OVERHANG_SIDE),
            minY: Math.min(bounds.minY, node.y - CARD_OVERHANG_ABOVE),
            maxY: Math.max(bounds.maxY, node.y + CARD_OVERHANG_BELOW)
          }),
          { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
        )
      : layout.bounds;
  const finale = fitToBounds(finaleBounds, size, PADDING, MAX_RIDE_K);
  const crossTranslateFinale = axis === 'y' ? finale.x : finale.y;
  // The era line position on the time axis: vertical uses the time scale; the
  // horizontal projection lays nodes at (year - minYear) * pxPerYear (see projection.ts).
  const linePosFor = (year: number): number =>
    axis === 'y' ? layout.scale.yForYear(year) : (year - layout.scale.minYear) * layout.scale.pxPerYear;
  // World cross coord that lands `STRATUM_MARGIN` from a given screen edge.
  const crossAtEdge = (side: 'start' | 'end', translate: number, k: number): number =>
    ((side === 'end' ? viewportCross - STRATUM_MARGIN : STRATUM_MARGIN) - translate) / k;

  const strata: Stratum[] = phases.map((phase, i) => {
    const side: 'start' | 'end' = i % 2 === 0 ? 'end' : 'start';
    return {
      generation: phase.generation,
      year: phase.year,
      label: String(phase.year),
      linePos: linePosFor(phase.year),
      side,
      crossRide: crossAtEdge(side, crossTranslateRide, rideK),
      crossFinal: crossAtEdge(side, crossTranslateFinale, finale.k),
      start: phase.start
    };
  });

  const finaleStart = generations.length * phaseDuration;
  return {
    axis,
    rideK,
    dawnCross: crossCenter,
    phases,
    strata,
    finale,
    finaleStart,
    finaleDuration: FINALE_DURATION,
    total: finaleStart + FINALE_DURATION
  };
}
