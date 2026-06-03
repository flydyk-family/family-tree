import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import OakTree from './OakTree.vue';
import { buildLayout } from '../layout/treeLayout';
import { useLocaleStore } from '../stores/localeStore';
import type { FamilyGraph } from '../types/family';

const graph: FamilyGraph = {
  people: [
    { id: 'a', givenName: { ru: 'Анна', be: null, en: 'Anna' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'male', birthYear: 1850, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true },
    { id: 'b', givenName: { ru: 'Борис', be: null, en: 'Boris' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'female', birthYear: 1880, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: 'a' }, marriedIntoFamily: false, isDefaultRoot: false }
  ],
  unions: [{ id: 'u', partnerIds: ['a'], marriageYear: null, childIds: ['b'] }]
};

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('OakTree', () => {
  it('renders an svg with a node element per person and a branch per descent link', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="node"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-test="branch"]').length).toBeGreaterThanOrEqual(1);
  });

  it('renders localized node names and updates when the locale changes', async () => {
    const store = useLocaleStore();
    store.setLocale('en');
    expect(store.currentLocale).toBe('en');
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    const names = () => wrapper.findAll('.oak__name').map(node => node.text());
    expect(names()).toContain('Anna');

    store.setLocale('ru');
    await wrapper.vm.$nextTick();

    expect(names()).toContain('Анна');
  });
});
