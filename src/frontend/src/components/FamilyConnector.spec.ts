import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FamilyConnector from './FamilyConnector.vue';
import type { FamilyUnion, LayoutNode } from '../layout/treeLayout';

function node(id: string, x: number, y: number, generation = 0): LayoutNode {
  return {
    id, x, y, year: 1900 + generation * 30, generation, role: 'branch',
    person: {
      id, givenName: { ru: id, be: null, en: id }, surname: { ru: 'X', be: null, en: 'X' },
      maidenName: null, sex: 'male', birthYear: 1900, deathYear: null, vocation: 'other',
      portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
      marriedIntoFamily: false, isDefaultRoot: false
    }
  };
}

const nodeById = new Map<string, LayoutNode>([
  ['p1', node('p1', 0, 0, 0)],
  ['p2', node('p2', 100, 0, 0)],
  ['c1', node('c1', 20, 200, 1)],
  ['c2', node('c2', 80, 220, 1)]
]);
const union: FamilyUnion = { id: 'u', parentIds: ['p1', 'p2'], childIds: ['c1', 'c2'], generation: 1 };

describe('FamilyConnector', () => {
  it('renders a descent branch core per descent segment with the child-generation draw hook', () => {
    const w = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: false } });
    const cores = w.findAll('path.branch__core[data-test="branch"]');
    // 2 parent stubs + trunk + bus bar + 2 child stubs = 6 descent segments
    expect(cores).toHaveLength(6);
    cores.forEach(c => expect(c.attributes('data-entrance-draw')).toBe('1'));
  });

  it('renders a couple bar that fades with the later partner generation', () => {
    const w = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: false } });
    const couple = w.find('path.branch__couple');
    expect(couple.exists()).toBe(true);
    expect(couple.attributes('data-entrance-fade')).toBe('0');
  });

  it('renders a marriage and a branch junction bead', () => {
    const w = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: false } });
    expect(w.findAll('path.oak__junction[data-test="junction"]')).toHaveLength(2);
  });

  it('adds rope shadow + twist overlays in the film theme', () => {
    const plain = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: false } });
    expect(plain.find('path.rope__twist-hi').exists()).toBe(false);
    const film = mount(FamilyConnector, { props: { union, nodeById, axis: 'y', film: true } });
    expect(film.find('path.rope__shadow').exists()).toBe(true);
    expect(film.find('path.rope__twist-hi').exists()).toBe(true);
    expect(film.find('path.rope__twist-lo').exists()).toBe(true);
  });

  it('skips absent nodes without crashing', () => {
    const sparse: FamilyUnion = { id: 'u2', parentIds: ['p1', 'ghost'], childIds: ['c1'], generation: 1 };
    const w = mount(FamilyConnector, { props: { union: sparse, nodeById, axis: 'y', film: false } });
    // one present parent → no couple bar
    expect(w.find('path.branch__couple').exists()).toBe(false);
    expect(w.findAll('path.branch__core[data-test="branch"]').length).toBeGreaterThan(0);
  });
});
