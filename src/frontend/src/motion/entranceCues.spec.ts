// src/frontend/src/motion/entranceCues.spec.ts
import { describe, it, expect } from 'vitest';
import { buildLayout } from '../layout/treeLayout';
import { fitToBounds } from '../interactions/panZoom';
import { buildEntranceCues } from './entranceCues';
import type { FamilyGraph, PersonSummary } from '../types/family';

function person(id: string, birthYear: number, parents: Partial<PersonSummary['parents']> = {}): PersonSummary {
  return {
    id,
    givenName: { ru: id, be: null, en: id },
    surname: { ru: null, be: null, en: null },
    maidenName: null,
    sex: 'male',
    birthYear,
    deathYear: null,
    vocation: 'other',
    portrait: null,
    portraitVideo: null,
    parents: { motherId: null, fatherId: null, ...parents },
    marriedIntoFamily: false,
    isDefaultRoot: false
  };
}

// Three generations: grandparent gp (1850) → parent pa (1880) + spouse sp → focus fo (1910)
const graph: FamilyGraph = {
  people: [
    person('gp', 1850),
    person('pa', 1880, { fatherId: 'gp' }),
    person('sp', 1882),
    person('fo', 1910, { fatherId: 'pa', motherId: 'sp' })
  ],
  unions: [
    { id: 'u1', partnerIds: ['gp'], marriageYear: null, childIds: ['pa'] },
    { id: 'u2', partnerIds: ['pa', 'sp'], marriageYear: null, childIds: ['fo'] }
  ]
};

const SIZE = { width: 800, height: 600 };

describe('buildEntranceCues', () => {
  const layout = buildLayout(graph, { focusId: 'fo' });
  const cues = buildEntranceCues(layout, SIZE)!;

  it('orders phases oldest generation first and assigns every node exactly once', () => {
    expect(cues).not.toBeNull();
    const gens = cues.phases.map(p => p.generation);
    expect(gens).toEqual([...gens].sort((a, b) => a - b));
    const ids = cues.phases.flatMap(p => p.nodeIds).sort();
    expect(ids).toEqual(layout.nodes.map(n => n.id).sort());
  });

  it('draws each descent link in its target generation phase and fades unions in their band', () => {
    const genOf = new Map(layout.nodes.map(n => [n.id, n.generation]));
    for (const phase of cues.phases) {
      for (const linkId of phase.drawLinkIds) {
        const link = layout.links.find(l => l.id === linkId)!;
        expect(link.kind).toBe('descent');
        expect(genOf.get(link.target)).toBe(phase.generation);
      }
      for (const linkId of phase.fadeLinkIds) {
        const link = layout.links.find(l => l.id === linkId)!;
        expect(link.kind).toBe('union');
        expect(Math.max(genOf.get(link.source)!, genOf.get(link.target)!)).toBe(phase.generation);
      }
    }
    const allLinkIds = cues.phases.flatMap(p => [...p.drawLinkIds, ...p.fadeLinkIds]).sort();
    expect(allLinkIds).toEqual(layout.links.map(l => l.id).sort());
  });

  it('rides at fit-width zoom capped at natural size, with a fixed horizontal translate', () => {
    const kWidth = (SIZE.width - 120) / layout.width;
    const kTravel = (1.8 * SIZE.height) / layout.height;
    const expectedK = Math.min(1, Math.max(kWidth, kTravel));
    expect(cues.rideK).toBeCloseTo(expectedK, 6);
    const centerX = (layout.bounds.minX + layout.bounds.maxX) / 2;
    expect(cues.rideX).toBeCloseTo(SIZE.width / 2 - centerX * cues.rideK, 6);
  });

  it('guarantees a vertical climb on a narrow viewport (zooms past fit-width)', () => {
    const narrow = { width: 320, height: 760 };
    const c = buildEntranceCues(layout, narrow)!;
    const fitWidthK = (narrow.width - 120) / layout.width;
    const travelK = (1.8 * narrow.height) / layout.height;
    // floor engaged: rideK exceeds pure fit-width
    expect(c.rideK).toBeGreaterThan(fitWidthK);
    expect(c.rideK).toBeCloseTo(Math.min(1, Math.max(fitWidthK, travelK)), 6);
    // and the camera actually travels (phase cameraYs are not all identical)
    const ys = new Set(c.phases.map(p => Math.round(p.cameraY)));
    expect(ys.size).toBeGreaterThan(1);
  });

  it('keeps each phase duration within the calm band and the seed-scale total under six seconds', () => {
    for (const phase of cues.phases) {
      expect(phase.duration).toBeGreaterThanOrEqual(0.45);
      expect(phase.duration).toBeLessThanOrEqual(0.9);
    }
    expect(cues.total).toBeLessThan(6);
    expect(cues.finaleStart).toBeCloseTo(cues.phases.length * cues.phases[0].duration, 6);
  });

  it('places one stratum per phase, alternating sides, whole inside the ride window', () => {
    expect(cues.strata).toHaveLength(cues.phases.length);
    cues.strata.forEach((stratum, i) => {
      expect(stratum.generation).toBe(cues.phases[i].generation);
      expect(stratum.side).toBe(i % 2 === 0 ? 'right' : 'left');
      const screenX = stratum.rideX * cues.rideK + cues.rideX;
      expect(screenX).toBeCloseTo(stratum.side === 'right' ? SIZE.width - 72 : 72, 4);
      const finalScreenX = stratum.finalX * cues.finale.k + cues.finale.x;
      expect(finalScreenX).toBeCloseTo(stratum.side === 'right' ? SIZE.width - 72 : 72, 4);
      expect(stratum.y).toBeCloseTo(layout.scale.yForYear(stratum.year), 6);
    });
  });

  it('ends on the standard fitted view', () => {
    expect(cues.finale).toEqual(fitToBounds(layout.bounds, SIZE, 60, 1));
  });

  it('anchors the dawn light on the tree centre line', () => {
    expect(cues.dawnX).toBeCloseTo((layout.bounds.minX + layout.bounds.maxX) / 2, 6);
  });

  it('returns null for an empty layout or a degenerate viewport', () => {
    expect(buildEntranceCues({ ...layout, nodes: [] }, SIZE)).toBeNull();
    expect(buildEntranceCues(layout, { width: 0, height: 600 })).toBeNull();
    expect(buildEntranceCues(layout, { width: 100, height: 600 })).toBeNull();
  });
});
