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

  it('emits select with the person id when a node is clicked', async () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    await wrapper.findAll('[data-test="node"]')[0].trigger('click');

    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual(['a']);
  });

  it('emits select when Enter is pressed on a focused node', async () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    await wrapper.findAll('[data-test="node"]')[1].trigger('keydown.enter');

    expect(wrapper.emitted('select')![0]).toEqual(['b']);
  });

  it('marks the selected node with a modifier class', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout, selectedId: 'b' } });

    const selected = wrapper.findAll('[data-test="node"]').filter(node => node.classes('oak__node--selected'));
    expect(selected).toHaveLength(1);
  });

  it('renders an oval medallion (not a circle) per person', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    expect(wrapper.findAll('ellipse.oak__medallion--fill')).toHaveLength(2);
    expect(wrapper.findAll('circle')).toHaveLength(0);
  });

  it('keeps branches thin so the portrait medallions dominate', () => {
    // Regression guard: a full-file rewrite once reverted the PR #7 branch
    // thinning. Branch stroke-width must stay well under a medallion's width.
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    const widths = wrapper
      .findAll('[data-test="branch"]')
      .map(branch => Number(branch.attributes('stroke-width')));

    expect(widths.length).toBeGreaterThanOrEqual(1);
    for (const width of widths) {
      expect(width).toBeLessThanOrEqual(5);
    }
  });
});
