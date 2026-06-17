import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import EdgePrintFrame from './EdgePrintFrame.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import type { LayoutNode } from '../../../layout/treeLayout';
import type { PersonSummary } from '../../../types/family';

function person(o: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id: 'p1', givenName: { ru: 'Антон', be: null, en: 'Anton' }, surname: { ru: 'Карскі', be: null, en: 'Karski' },
    maidenName: null, sex: 'male', birthYear: 1995, deathYear: null, vocation: 'other',
    portrait: 'p-1.jpg', portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false, ...o
  };
}
function node(o: Partial<LayoutNode> = {}, p: Partial<PersonSummary> = {}): LayoutNode {
  const ps = person(p);
  return { id: ps.id, person: ps, x: 0, y: 0, year: ps.birthYear ?? 1995, role: 'branch', generation: 0, ...o };
}

beforeEach(() => {
  setActivePinia(createPinia());
  useLocaleStore().setLocale('en');
});

describe('EdgePrintFrame', () => {
  it('renders the portrait, name and years', () => {
    const w = mount(EdgePrintFrame, { props: { node: node() } });
    expect(w.find('[data-test="portrait"]').attributes('href')).toBe('/media/portraits/p-1.jpg');
    expect(w.find('[data-test="card-name"]').text()).toBe('Anton Karski');
    expect(w.find('[data-test="lifespan"]').text()).toBe('1995–');
  });
  it('has no sprocket holes and carries corner frame numbers', () => {
    const w = mount(EdgePrintFrame, { props: { node: node() } });
    expect(w.find('[data-test="perf-holes"]').exists()).toBe(false);
    expect(w.find('[data-test="edge-corners"]').exists()).toBe(true);
  });
  it('lightens the celluloid body for a search match', () => {
    const plain = mount(EdgePrintFrame, { props: { node: node() } });
    const match = mount(EdgePrintFrame, { props: { node: node(), match: true } });
    expect(plain.find('[data-test="edge-body"]').attributes('fill')).toBe('var(--celluloid)');
    expect(match.find('[data-test="edge-body"]').attributes('fill')).toBe('#1b1d21');
  });
  it('shows the selection edge when selected', () => {
    const w = mount(EdgePrintFrame, { props: { node: node(), selected: true } });
    expect(w.find('[data-test="sel-edge"]').exists()).toBe(true);
  });
});
