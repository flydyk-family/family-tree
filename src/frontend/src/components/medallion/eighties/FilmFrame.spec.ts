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
  it('renders the seeded tiny scratch only when the id carries one', () => {
    // p-0 hashes to a tiny scratch, p-1 does not (seeded, deterministic)
    expect(mount(FilmFrame, { props: { node: node({ id: 'p-0' }, { id: 'p-0' }) } })
      .find('[data-test="tiny-scratch"]').exists()).toBe(true);
    expect(mount(FilmFrame, { props: { node: node({ id: 'p-1' }, { id: 'p-1' }) } })
      .find('[data-test="tiny-scratch"]').exists()).toBe(false);
  });
  it('omits the years chip when the person has no birth/death years', () => {
    const w = mount(FilmFrame, { props: { node: node({}, { birthYear: null, deathYear: null }) } });
    expect(w.find('[data-test="lifespan"]').exists()).toBe(false);
  });
  it('tags the film frame as an e80-card (no tilt variable)', () => {
    const w = mount(FilmFrame, { props: { node: node() } });
    const root = w.find('.film');
    expect(root.classes()).toContain('e80-card');
    expect(root.attributes('style') || '').not.toContain('--hover-tilt');
  });
  it('renders a short name on one line and a long three-part name on two', () => {
    const short = mount(FilmFrame, { props: { node: node() } });
    expect(short.findAll('.film__name tspan')).toHaveLength(1);
    const long = mount(FilmFrame, { props: { node: node({}, {
      givenName: { ru: 'Аляксандр Іванавіч', be: null, en: 'Aleksandr Ivanovich' },
      surname: { ru: 'Кавальскі', be: null, en: 'Kowalski' }
    }) } });
    expect(long.findAll('.film__name tspan')).toHaveLength(2);
  });
});
