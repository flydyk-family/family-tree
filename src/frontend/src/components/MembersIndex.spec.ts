import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import MembersIndex from './MembersIndex.vue';
import type { PersonSummary } from '../types/family';

function person(id: string, given: string, extra: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id, givenName: { ru: given, be: given, en: given }, surname: { ru: 'Тест', be: 'Тэст', en: 'Test' },
    maidenName: null, middleName: null, sex: 'unknown', birthYear: 1950, deathYear: null, vocation: 'unknown',
    portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false, ...extra
  };
}

function surnamed(id: string, given: string, surname: string, birthYear: number): PersonSummary {
  return person(id, given, { surname: { ru: surname, be: surname, en: surname }, birthYear });
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

  it('filters by the selected surname', async () => {
    const wrapper = mountIndex([surnamed('p-1', 'Анна', 'Ковальский', 1900), surnamed('p-2', 'Борис', 'Новак', 1910)]);
    await wrapper.get('[data-test="filter-surname"]').setValue('Новак');
    const rows = wrapper.findAll('[data-test="member-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('Борис');
  });

  it('sorts by birth year when the sort mode is birth', async () => {
    const wrapper = mountIndex([surnamed('p-old', 'Старший', 'Тест', 1900), surnamed('p-young', 'Младший', 'Тест', 1980)]);
    await wrapper.get('[data-test="filter-sort"]').setValue('birth');
    const rows = wrapper.findAll('[data-test="member-row"]');
    expect(rows[0].text()).toContain('Старший');
    expect(rows[1].text()).toContain('Младший');
  });

  it('sorts by birth year by default (oldest first)', () => {
    const wrapper = mountIndex([surnamed('p-young', 'Младший', 'Тест', 1980), surnamed('p-old', 'Старший', 'Тест', 1900)]);
    const rows = wrapper.findAll('[data-test="member-row"]');
    expect(rows[0].text()).toContain('Старший');
    expect(rows[1].text()).toContain('Младший');
  });

  it('sorts by surname then given name in name mode', async () => {
    const wrapper = mountIndex([
      surnamed('p-1', 'Борис', 'Ковальская', 1900),
      surnamed('p-2', 'Анна', 'Ковальская', 1910),
      surnamed('p-3', 'Виктор', 'Новак', 1905)
    ]);
    await wrapper.get('[data-test="filter-sort"]').setValue('name');
    const rows = wrapper.findAll('[data-test="member-row"]');
    // Ковальская family first, given-name A–Z within it, then Новак.
    expect(rows[0].text()).toContain('Анна');
    expect(rows[1].text()).toContain('Борис');
    expect(rows[2].text()).toContain('Виктор');
  });

  it('shows the clear button only once a filter is active and resets on click', async () => {
    const wrapper = mountIndex([person('p-1', 'Анна'), person('p-2', 'Борис')]);
    expect(wrapper.find('[data-test="filter-clear"]').exists()).toBe(false);
    await wrapper.get('[data-test="members-search"]').setValue('Анна');
    expect(wrapper.findAll('[data-test="member-row"]')).toHaveLength(1);
    await wrapper.get('[data-test="filter-clear"]').trigger('click');
    expect(wrapper.findAll('[data-test="member-row"]')).toHaveLength(2);
    expect(wrapper.find('[data-test="filter-clear"]').exists()).toBe(false);
  });

  it('renders a name initial in the thumb when a person has no portrait', () => {
    const wrapper = mountIndex([person('p-1', 'Анна')]);
    const empty = wrapper.get('.members-index__thumb--empty');
    expect(empty.text()).toBe('А');
  });
});
