import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import GelatinPrint from './GelatinPrint.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import type { LayoutNode } from '../../../layout/treeLayout';
import type { PersonSummary } from '../../../types/family';
import { hoverTilt } from './hoverTilt';

function person(o: Partial<PersonSummary> = {}): PersonSummary {
  return { id: 'p1', givenName: { ru: 'Стэфан', be: null, en: 'Stefan' }, surname: { ru: 'Карскі', be: null, en: 'Karski' },
    maidenName: null, sex: 'male', birthYear: 1908, deathYear: 1979, vocation: 'other',
    portrait: 's-1.jpg', portraitVideo: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false, ...o };
}
function node(o: Partial<LayoutNode> = {}, p: Partial<PersonSummary> = {}): LayoutNode {
  const ps = person(p);
  return { id: ps.id, person: ps, x: 0, y: 0, year: 1908, role: 'branch', generation: 0, ...o };
}
beforeEach(() => { setActivePinia(createPinia()); useLocaleStore().setLocale('en'); });

describe('GelatinPrint', () => {
  it('renders the B&W portrait, name and years', () => {
    const w = mount(GelatinPrint, { props: { node: node() } });
    expect(w.find('[data-test="portrait"]').attributes('href')).toBe('/media/portraits/s-1.jpg');
    expect(w.find('[data-test="lifespan"]').text()).toBe('1908–1979');
  });
  it('shows the selection edge when selected', () => {
    const w = mount(GelatinPrint, { props: { node: node(), selected: true } });
    expect(w.find('[data-test="sel-edge"]').exists()).toBe(true);
  });
  it('omits the years chip when the person has no birth/death years', () => {
    const w = mount(GelatinPrint, { props: { node: node({}, { birthYear: null, deathYear: null }) } });
    expect(w.find('[data-test="lifespan"]').exists()).toBe(false);
  });
  it('tags the card for hover and sets the seeded tilt variable', () => {
    const w = mount(GelatinPrint, { props: { node: node({ id: 'p-5' }, { id: 'p-5' }) } });
    const root = w.find('.gel');
    expect(root.classes()).toContain('e80-card');
    expect(root.attributes('style') || '').toContain(`--hover-tilt: ${hoverTilt('p-5').angleDeg}deg`);
  });
});
