import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import CabinetCard from './CabinetCard.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import type { LayoutNode } from '../../../layout/treeLayout';
import type { PersonSummary } from '../../../types/family';

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
});
