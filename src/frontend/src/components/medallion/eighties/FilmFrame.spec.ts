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
  it('punches transparent sprocket holes through the strips via a mask', () => {
    const w = mount(FilmFrame, { props: { node: node() } });
    // the strips are masked; the holes are black (cut out) in that mask
    expect(w.find('[data-test="perf-strips"]').attributes('mask')).toContain('film-holes-');
    expect(w.find('[data-test="perf-holes"]').attributes('fill')).toBe('#000');
  });
  it('keeps the holes transparent regardless of search match (the white frame is the cue)', () => {
    const plain = mount(FilmFrame, { props: { node: node() } });
    const match = mount(FilmFrame, { props: { node: node(), match: true } });
    expect(plain.find('[data-test="perf-holes"]').attributes('fill')).toBe('#000');
    expect(match.find('[data-test="perf-holes"]').attributes('fill')).toBe('#000');
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
  it('renders an edge-fade backing band behind the name', () => {
    const w = mount(FilmFrame, { props: { node: node() } });
    const band = w.find('rect.e80-name-bg');
    expect(band.exists()).toBe(true);
    expect(band.attributes('fill')).toBe('url(#e80-name-fade)');
  });
  it('draws a white match frame only when matched', () => {
    expect(mount(FilmFrame, { props: { node: node() } }).find('[data-test="match-frame"]').exists()).toBe(false);
    const m = mount(FilmFrame, { props: { node: node(), match: true } });
    const frame = m.find('[data-test="match-frame"]');
    expect(frame.exists()).toBe(true);
    expect(frame.attributes('fill')).toBeUndefined(); // fill:none via CSS class
    expect(frame.classes()).toContain('e80-match-frame');
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
