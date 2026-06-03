import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { FamilyGraph } from '../types/family';

vi.mock('../api/familyApi', () => ({ fetchFamilyGraph: vi.fn() }));
import { fetchFamilyGraph } from '../api/familyApi';
import TreeView from './TreeView.vue';

const graph: FamilyGraph = {
  people: [
    { id: 'a', givenName: 'A', surname: 'X', maidenName: null, sex: 'male', birthYear: 1850, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true },
    { id: 'b', givenName: 'B', surname: 'X', maidenName: null, sex: 'female', birthYear: 1880, deathYear: null, vocation: 'other', portrait: null, parents: { motherId: null, fatherId: 'a' }, marriedIntoFamily: false, isDefaultRoot: false }
  ],
  unions: [{ id: 'u', partnerIds: ['a'], marriageYear: null, childIds: ['b'] }]
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchFamilyGraph).mockReset();
});

describe('TreeView', () => {
  it('loads the graph and renders the oak and year axis', async () => {
    vi.mocked(fetchFamilyGraph).mockResolvedValue(graph);
    const wrapper = mount(TreeView);

    await flushPromises();

    expect(wrapper.find('.oak').exists()).toBe(true);
    expect(wrapper.find('.year-axis').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="node"]')).toHaveLength(2);
  });
});
