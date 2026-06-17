import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import EightiesMedallion from './EightiesMedallion.vue';
import { useLocaleStore } from '../../../stores/localeStore';
import type { LayoutNode } from '../../../layout/treeLayout';
import type { PersonSummary } from '../../../types/family';

function node(birthYear: number | null): LayoutNode {
  const p: PersonSummary = { id: 'p1', givenName: { ru: 'Имя', be: null, en: 'Name' }, surname: { ru: 'Фамилия', be: null, en: 'Sur' },
    maidenName: null, sex: 'male', birthYear, deathYear: null, vocation: 'other', portrait: null, portraitVideo: null,
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false };
  return { id: p.id, person: p, x: 0, y: 0, year: birthYear ?? 1900, role: 'branch', generation: 0 };
}
beforeEach(() => { setActivePinia(createPinia()); useLocaleStore().setLocale('en'); });

describe('EightiesMedallion', () => {
  it('renders a cabinet card for a pre-1900 birth', () => {
    expect(mount(EightiesMedallion, { props: { node: node(1880) } }).find('.cab').exists()).toBe(true);
  });
  it('renders a gelatin print for a 1900–1944 birth', () => {
    expect(mount(EightiesMedallion, { props: { node: node(1920) } }).find('.gel').exists()).toBe(true);
  });
  it('renders a holed film frame for a 1945–1989 birth', () => {
    const w = mount(EightiesMedallion, { props: { node: node(1970) } });
    expect(w.find('.film').exists()).toBe(true);
    expect(w.find('.film--edge').exists()).toBe(false);
    expect(w.find('[data-test="perf-holes"]').exists()).toBe(true);
  });
  it('renders the holeless edge-print frame for a 1990+ birth', () => {
    const w = mount(EightiesMedallion, { props: { node: node(1995) } });
    expect(w.find('.film--edge').exists()).toBe(true);
    expect(w.find('[data-test="perf-holes"]').exists()).toBe(false);
    expect(w.find('[data-test="edge-corners"]').exists()).toBe(true);
  });
});
