import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import CabinetCard from './CabinetCard.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import type { LayoutNode } from '../../../layout/treeLayout';
import type { PersonSummary } from '../../../types/family';
import { hoverTilt } from './hoverTilt';

function person(o: Partial<PersonSummary> = {}): PersonSummary {
  return { id: 'p1', givenName: { ru: 'Марыя', be: null, en: 'Maria' }, surname: { ru: 'Карская', be: null, en: 'Karskaya' },
    maidenName: null, sex: 'female', birthYear: 1861, deathYear: 1924, vocation: 'other',
    portrait: 'm-1.jpg', portraitVideo: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false, ...o };
}
function node(o: Partial<LayoutNode> = {}, p: Partial<PersonSummary> = {}): LayoutNode {
  const ps = person(p);
  return { id: ps.id, person: ps, x: 0, y: 0, year: 1861, role: 'branch', generation: 0, ...o };
}
beforeEach(() => { setActivePinia(createPinia()); useLocaleStore().setLocale('en'); });

describe('CabinetCard', () => {
  it('renders the sepia portrait, name and years', () => {
    const w = mount(CabinetCard, { props: { node: node() } });
    expect(w.find('[data-test="portrait"]').attributes('href')).toBe('/media/portraits/m-1.jpg');
    expect(w.find('[data-test="lifespan"]').text()).toBe('1861–1924');
  });
  it('shows the selection edge when selected', () => {
    const w = mount(CabinetCard, { props: { node: node(), selected: true } });
    expect(w.find('[data-test="sel-edge"]').exists()).toBe(true);
  });
  it('omits the years chip when the person has no birth/death years', () => {
    const w = mount(CabinetCard, { props: { node: node({}, { birthYear: null, deathYear: null }) } });
    expect(w.find('[data-test="lifespan"]').exists()).toBe(false);
  });
  it('tags the card for hover and sets the seeded tilt variable', () => {
    const w = mount(CabinetCard, { props: { node: node({ id: 'p-5' }, { id: 'p-5' }) } });
    const root = w.find('.cab');
    expect(root.classes()).toContain('e80-card');
    expect(root.attributes('style') || '').toContain(`--hover-tilt: ${hoverTilt('p-5').angleDeg}deg`);
  });
});
