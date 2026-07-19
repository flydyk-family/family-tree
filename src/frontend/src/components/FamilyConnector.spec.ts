import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FamilyConnector from './FamilyConnector.vue';
import type { FamilyUnion, LayoutNode } from '../layout/treeLayout';

function node(id: string, x: number, y: number, generation = 0): LayoutNode {
  return {
    id, x, y, year: 1900 + generation * 30, generation, role: 'branch',
    person: {
      id, givenName: { ru: id, be: null, en: id }, surname: { ru: 'X', be: null, en: 'X' },
      maidenName: null, middleName: null, sex: 'male', birthYear: 1900, deathYear: null, vocation: 'other',
      portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
      marriedIntoFamily: false, isDefaultRoot: false
    }
  };
}

const nodeById = new Map<string, LayoutNode>([
  ['p1', node('p1', 0, 0, 0)],
  ['p2', node('p2', 100, 40, 0)],
  ['c1', node('c1', 20, 200, 1)],
  ['c2', node('c2', 80, 240, 1)]
]);
const union: FamilyUnion = { id: 'u', parentIds: ['p1', 'p2'], childIds: ['c1', 'c2'], generation: 1 };

describe('FamilyConnector', () => {
  it('renders one branch core per curve (2 spouse + 2 child) with the family draw hook', () => {
    const w = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: false } });
    const cores = w.findAll('path.branch__core[data-test="branch"]');
    expect(cores).toHaveLength(4);
    cores.forEach(c => {
      expect(c.attributes('data-entrance-draw')).toBe('1');
      expect(c.attributes('data-link-id')).toBe('u');
    });
  });

  it('uses the sagging quadratic curve in both themes', () => {
    const classic = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: false } });
    expect(classic.find('path.branch__core').attributes('d')).toContain('Q');
    const film = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: true } });
    expect(film.find('path.branch__core').attributes('d')).toContain('Q');
  });

  it('adds rope shadow + twist overlays per curve only in the Film theme', () => {
    const classic = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: false } });
    expect(classic.find('path.rope__twist-hi').exists()).toBe(false);
    expect(classic.find('path.rope__shadow').exists()).toBe(false);
    const film = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: true } });
    // 4 curves → 4 shadows + 4 hi-twists + 4 lo-twists
    expect(film.findAll('path.rope__shadow')).toHaveLength(4);
    expect(film.findAll('path.rope__twist-hi')).toHaveLength(4);
    expect(film.findAll('path.rope__twist-lo')).toHaveLength(4);
    film.findAll('path.rope__twist-hi').forEach(t => expect(t.attributes('data-entrance-fade')).toBe('1'));
  });

  it('marks the spouse curves (not the child curves) so Film can emphasise the couple bond', () => {
    const w = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: true } });
    const cores = w.findAll('path.branch__core[data-test="branch"]');
    const spouseCores = cores.filter(c => c.classes().includes('is-spouse'));
    const childCores = cores.filter(c => !c.classes().includes('is-spouse'));
    expect(spouseCores).toHaveLength(2); // the two spouse → hub curves
    expect(childCores).toHaveLength(2); // the two hub → child curves
    // the spouse rope layers also carry the marker so they thicken together
    expect(w.findAll('path.rope__shadow.is-spouse')).toHaveLength(2);
    expect(w.findAll('path.rope__twist-hi.is-spouse')).toHaveLength(2);
  });

  it('renders no junction marker (curves simply converge at the hub)', () => {
    const w = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: false } });
    expect(w.find('[data-test="junction"]').exists()).toBe(false);
  });

  it('skips absent nodes: a single present parent yields one spouse curve', () => {
    const sparse: FamilyUnion = { id: 'u2', parentIds: ['p1', 'ghost'], childIds: ['c1'], generation: 1 };
    const w = mount(FamilyConnector, { props: { union: sparse, nodeById, axis: 'y', film: false } });
    // 1 present parent + 1 present child = 2 curves
    expect(w.findAll('path.branch__core[data-test="branch"]')).toHaveLength(2);
  });
});
