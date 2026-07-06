import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import MembersIndex from './MembersIndex.vue';
import type { PersonSummary } from '../types/family';

function person(id: string, given: string): PersonSummary {
  return {
    id, givenName: { ru: given, be: given, en: given }, surname: { ru: 'Тест', be: 'Тэст', en: 'Test' },
    maidenName: null, sex: 'unknown', birthYear: 1950, deathYear: null, vocation: 'unknown',
    portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false
  };
}

beforeEach(() => setActivePinia(createPinia()));

function mountIndex(people: PersonSummary[]) {
  return mount(MembersIndex, {
    props: { people, selectedId: null },
    global: { plugins: [i18n] }
  });
}

describe('MembersIndex', () => {
  it('renders a row per person', () => {
    const wrapper = mountIndex([person('p-1', 'Анна'), person('p-2', 'Борис')]);
    expect(wrapper.findAll('[data-test="member-row"]')).toHaveLength(2);
  });

  it('filters by the search query', async () => {
    const wrapper = mountIndex([person('p-1', 'Анна'), person('p-2', 'Борис')]);
    await wrapper.get('[data-test="members-search"]').setValue('Анна');
    expect(wrapper.findAll('[data-test="member-row"]')).toHaveLength(1);
  });

  it('emits select with the person id on row click', async () => {
    const wrapper = mountIndex([person('p-1', 'Анна')]);
    await wrapper.get('[data-test="member-row"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['p-1']);
  });

  it('shows the empty state when nothing matches', async () => {
    const wrapper = mountIndex([person('p-1', 'Анна')]);
    await wrapper.get('[data-test="members-search"]').setValue('zzz');
    expect(wrapper.get('[data-test="members-empty"]').isVisible()).toBe(true);
  });
});
