import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import FilmFrame from './FilmFrame.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import type { LayoutNode } from '../../../layout/treeLayout';
import type { PersonSummary } from '../../../types/family';

function person(o: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id: 'p1', givenName: { ru: 'Антон', be: null, en: 'Anton' }, surname: { ru: 'Карскі', be: null, en: 'Karski' },
    maidenName: null, sex: 'male', birthYear: 1952, deathYear: 2018, vocation: 'other',
    portrait: 'p-1.jpg', portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false, ...o
  };
}
function node(o: Partial<LayoutNode> = {}, p: Partial<PersonSummary> = {}): LayoutNode {
  const ps = person(p);
  return { id: ps.id, person: ps, x: 0, y: 0, year: ps.birthYear ?? 1950, role: 'branch', generation: 0, ...o };
}

beforeEach(() => {
  setActivePinia(createPinia());
  useLocaleStore().setLocale('en');
});

describe('FilmFrame', () => {
  it('renders the portrait, name and years', () => {
    const w = mount(FilmFrame, { props: { node: node() } });
    expect(w.find('[data-test="portrait"]').attributes('href')).toBe('/media/portraits/p-1.jpg');
    expect(w.find('[data-test="card-name"]').text()).toBe('Anton Karski');
    expect(w.find('[data-test="lifespan"]').text()).toBe('1952–2018');
  });
  it('draws canvas-coloured sprocket holes (read as cut-outs) when not a match', () => {
    const w = mount(FilmFrame, { props: { node: node() } });
    // holes are solid rects filled with the canvas colour (no per-card mask)
    expect(w.find('[data-test="perf-strips"]').attributes('mask')).toBeUndefined();
    expect(w.find('[data-test="perf-holes"]').attributes('fill')).toBe('var(--canvas-bg)');
  });
  it('fills the sprockets a lighter grey (perforated) for a search match', () => {
    const w = mount(FilmFrame, { props: { node: node(), match: true } });
    expect(w.find('[data-test="perf-holes"]').attributes('fill')).toBe('var(--bark-dark)');
  });
  it('shows the selection glow + bright edge when selected', () => {
    const w = mount(FilmFrame, { props: { node: node(), selected: true } });
    expect(w.find('[data-test="sel-edge"]').exists()).toBe(true);
  });
});
