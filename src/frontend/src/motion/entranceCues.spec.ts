// src/frontend/src/motion/entranceCues.spec.ts
import { describe, it, expect } from 'vitest';
import { buildLayout } from '../layout/treeLayout';
import { projectLayout } from '../layout/projection';
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
    birthPlace: null,
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
  const cues = buildEntranceCues(layout, SIZE)!; // default vertical

  it('defaults to the vertical (y) time axis', () => {
    expect(cues).not.toBeNull();
    expect(cues.axis).toBe('y');
  });

  it('orders phases oldest generation first and assigns every node exactly once', () => {
    const gens = cues.phases.map(p => p.generation);
    expect(gens).toEqual([...gens].sort((a, b) => a - b));
    const ids = cues.phases.flatMap(p => p.nodeIds).sort();
    expect(ids).toEqual(layout.nodes.map(n => n.id).sort());
  });

  it('buckets each union descent draw by its generation and the couple fade by the later partner', () => {
    const genOf = new Map(layout.nodes.map(n => [n.id, n.generation]));
    const byId = new Map(layout.unions.map(u => [u.id, u]));
    for (const phase of cues.phases) {
      for (const id of phase.drawLinkIds) {
        const u = byId.get(id.replace(/:d$/, ''))!;
        expect(u.generation).toBe(phase.generation);
      }
      for (const id of phase.fadeLinkIds) {
        const u = byId.get(id.replace(/:u$/, ''))!;
        const partnerGen = Math.max(...u.parentIds.map(pid => genOf.get(pid)!));
        expect(partnerGen).toBe(phase.generation);
      }
    }
    // every union with children contributes a draw id; every 2-parent union a fade id
    const draws = cues.phases.flatMap(p => p.drawLinkIds).sort();
    const expectedDraws = layout.unions.filter(u => u.childIds.length).map(u => `${u.id}:d`).sort();
    expect(draws).toEqual(expectedDraws);
    const fades = cues.phases.flatMap(p => p.fadeLinkIds).sort();
    const expectedFades = layout.unions.filter(u => u.parentIds.length >= 2).map(u => `${u.id}:u`).sort();
    expect(fades).toEqual(expectedFades);
  });

  it('rides at fit-width zoom capped at natural size, the cross (x) translate fixed for the climb', () => {
    const kFit = (SIZE.width - 120) / layout.width;
    const kTravel = (1.8 * SIZE.height) / layout.height;
    expect(cues.rideK).toBeCloseTo(Math.min(1, Math.max(kFit, kTravel)), 6);
    // vertical: camera.x is the fixed cross translate, identical across phases; camera.y climbs
    const centerX = (layout.bounds.minX + layout.bounds.maxX) / 2;
    const expectedFixedX = SIZE.width / 2 - centerX * cues.rideK;
    for (const phase of cues.phases) {
      expect(phase.camera.x).toBeCloseTo(expectedFixedX, 6);
    }
    expect(new Set(cues.phases.map(p => Math.round(p.camera.y))).size).toBeGreaterThan(1);
  });

  it('guarantees travel on a narrow viewport (zooms past fit-width)', () => {
    // Narrow + short enough that pure fit-width stays below natural size, so the
    // travel floor (kTravel) demonstrably raises rideK above it.
    const narrow = { width: 280, height: 400 };
    const c = buildEntranceCues(layout, narrow)!;
    const fitWidthK = (narrow.width - 120) / layout.width;
    const travelK = (1.8 * narrow.height) / layout.height;
    expect(c.rideK).toBeGreaterThan(fitWidthK);
    expect(c.rideK).toBeCloseTo(Math.min(1, Math.max(fitWidthK, travelK)), 6);
    expect(new Set(c.phases.map(p => Math.round(p.camera.y))).size).toBeGreaterThan(1);
  });

  it('keeps each phase duration within the calm band and the seed-scale total under six seconds', () => {
    for (const phase of cues.phases) {
      expect(phase.duration).toBeGreaterThanOrEqual(0.45);
      expect(phase.duration).toBeLessThanOrEqual(0.9);
    }
    expect(cues.total).toBeLessThan(6);
    expect(cues.finaleStart).toBeCloseTo(cues.phases.length * cues.phases[0].duration, 6);
  });

  it('places one stratum per phase, alternating sides, the numeral whole inside the ride window', () => {
    expect(cues.strata).toHaveLength(cues.phases.length);
    cues.strata.forEach((stratum, i) => {
      expect(stratum.generation).toBe(cues.phases[i].generation);
      expect(stratum.side).toBe(i % 2 === 0 ? 'end' : 'start');
      // vertical: the cross axis is X; the fixed cross translate is the phases' camera.x
      const fixedX = cues.phases[0].camera.x;
      const rideScreenX = stratum.crossRide * cues.rideK + fixedX;
      expect(rideScreenX).toBeCloseTo(stratum.side === 'end' ? SIZE.width - 72 : 72, 4);
      const finalScreenX = stratum.crossFinal * cues.finale.k + cues.finale.x;
      expect(finalScreenX).toBeCloseTo(stratum.side === 'end' ? SIZE.width - 72 : 72, 4);
      expect(stratum.linePos).toBeCloseTo(layout.scale.yForYear(stratum.year), 6);
    });
  });

  it('ends framed on the most recent generations, not the whole tree', () => {
    // A deep, six-generation chain (1820 → 1970) so "last four" is a strict subset.
    const deepGraph: FamilyGraph = {
      people: [
        person('g0', 1820),
        person('g1', 1850, { fatherId: 'g0' }),
        person('g2', 1880, { fatherId: 'g1' }),
        person('g3', 1910, { fatherId: 'g2' }),
        person('g4', 1940, { fatherId: 'g3' }),
        person('g5', 1970, { fatherId: 'g4' })
      ],
      unions: [
        { id: 'u0', partnerIds: ['g0'], marriageYear: null, childIds: ['g1'] },
        { id: 'u1', partnerIds: ['g1'], marriageYear: null, childIds: ['g2'] },
        { id: 'u2', partnerIds: ['g2'], marriageYear: null, childIds: ['g3'] },
        { id: 'u3', partnerIds: ['g3'], marriageYear: null, childIds: ['g4'] },
        { id: 'u4', partnerIds: ['g4'], marriageYear: null, childIds: ['g5'] }
      ]
    };
    const deepLayout = buildLayout(deepGraph, { focusId: 'g5' });
    const c = buildEntranceCues(deepLayout, SIZE)!;
    expect(c.phases.length).toBeGreaterThan(4);
    expect(c.finale.k).toBeGreaterThan(0);
    expect(c.finale.k).toBeLessThanOrEqual(1);

    // The decisive proof it is NOT the whole tree: the newest band is framed on
    // screen while the oldest generation is scrolled out of the finale view.
    const screenY = (band: number): number => band * c.finale.k + c.finale.y;
    const newest = c.phases[c.phases.length - 1].bandPrimary;
    const oldest = c.phases[0].bandPrimary;
    expect(screenY(newest)).toBeGreaterThanOrEqual(0);
    expect(screenY(newest)).toBeLessThanOrEqual(SIZE.height);
    expect(screenY(oldest) < 0 || screenY(oldest) > SIZE.height).toBe(true);
  });

  it('frames the whole tree when it has four generations or fewer', () => {
    // With only three generations, "last four" is every generation — but the
    // finale still pads by the cards' overhang, so it never clips a medallion.
    expect(cues.finale.k).toBeLessThanOrEqual(fitToBounds(layout.bounds, SIZE, 60, 1).k);
    expect(cues.finale.k).toBeGreaterThan(0);
  });

  it('anchors the glow on the tree cross-axis centre line', () => {
    expect(cues.dawnCross).toBeCloseTo((layout.bounds.minX + layout.bounds.maxX) / 2, 6);
  });

  it('returns null for an empty layout or a degenerate viewport', () => {
    expect(buildEntranceCues({ ...layout, nodes: [] }, SIZE)).toBeNull();
    expect(buildEntranceCues(layout, { width: 0, height: 600 })).toBeNull();
    expect(buildEntranceCues(layout, { width: 100, height: 600 })).toBeNull();
  });

  describe('horizontal orientation', () => {
    const hLayout = projectLayout(layout, 'horizontal');
    const hCues = buildEntranceCues(hLayout, SIZE, 'horizontal')!;

    it('uses the x time axis and pans (camera.x varies, camera.y fixed)', () => {
      expect(hCues.axis).toBe('x');
      const kFit = (SIZE.height - 120) / hLayout.height;
      const kTravel = (1.8 * SIZE.width) / hLayout.width;
      expect(hCues.rideK).toBeCloseTo(Math.min(1, Math.max(kFit, kTravel)), 6);
      const centerY = (hLayout.bounds.minY + hLayout.bounds.maxY) / 2;
      const expectedFixedY = SIZE.height / 2 - centerY * hCues.rideK;
      for (const phase of hCues.phases) {
        expect(phase.camera.y).toBeCloseTo(expectedFixedY, 6);
      }
      expect(new Set(hCues.phases.map(p => Math.round(p.camera.x))).size).toBeGreaterThan(1);
    });

    it('lays the era line on the time (x) axis and anchors numerals to the top/bottom edges', () => {
      expect(hCues.dawnCross).toBeCloseTo((hLayout.bounds.minY + hLayout.bounds.maxY) / 2, 6);
      hCues.strata.forEach((stratum, i) => {
        expect(stratum.side).toBe(i % 2 === 0 ? 'end' : 'start');
        // horizontal: era line sits at the time-axis x = (year - minYear) * pxPerYear
        expect(stratum.linePos).toBeCloseTo((stratum.year - hLayout.scale.minYear) * hLayout.scale.pxPerYear, 6);
        // numeral cross coord is Y; the fixed cross translate is the phases' camera.y
        const fixedY = hCues.phases[0].camera.y;
        const rideScreenY = stratum.crossRide * hCues.rideK + fixedY;
        expect(rideScreenY).toBeCloseTo(stratum.side === 'end' ? SIZE.height - 72 : 72, 4);
      });
    });
  });

  // When two unions land in the same generation bucket, the second accumulates
  // into the existing list rather than starting a new one.
  describe('with two couples sharing a generation', () => {
    const root = person('root', 1850);
    const c1 = person('c1', 1875, { fatherId: 'root' });
    const c2 = person('c2', 1877, { fatherId: 'root' });
    const s1 = person('s1', 1876);
    const s2 = person('s2', 1878);
    const gc1 = person('gc1', 1900, { fatherId: 'c1', motherId: 's1' });
    const gc2 = person('gc2', 1902, { fatherId: 'c2', motherId: 's2' });
    const twoCouples: FamilyGraph = {
      people: [root, c1, c2, s1, s2, gc1, gc2],
      unions: [
        { id: 'r', partnerIds: ['root'], marriageYear: null, childIds: ['c1', 'c2'] },
        { id: 'a', partnerIds: ['c1', 's1'], marriageYear: null, childIds: ['gc1'] },
        { id: 'b', partnerIds: ['c2', 's2'], marriageYear: null, childIds: ['gc2'] }
      ]
    };
    const layout = buildLayout(twoCouples, { focusId: 'root' });
    const cues = buildEntranceCues(layout, SIZE)!;

    it('buckets both couples\' descent draws into the grandchild generation', () => {
      const gen = layout.nodes.find(n => n.id === 'gc1')!.generation;
      const phase = cues.phases.find(p => p.generation === gen)!;
      expect(phase.drawLinkIds.sort()).toEqual(['a:d', 'b:d']);
    });

    it('buckets both couples\' fades into the parents\' generation', () => {
      const gen = layout.nodes.find(n => n.id === 'c1')!.generation;
      const phase = cues.phases.find(p => p.generation === gen)!;
      expect(phase.fadeLinkIds.sort()).toEqual(['a:u', 'b:u']);
    });
  });
});
