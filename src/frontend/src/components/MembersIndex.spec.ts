import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import MembersIndex from './MembersIndex.vue';
import type { PersonSummary, Union } from '../types/family';

function person(id: string, given: string, extra: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id, givenName: { ru: given, be: given, en: given }, surname: { ru: 'Тест', be: 'Тэст', en: 'Test' },
    maidenName: null, sex: 'unknown', birthYear: 1950, deathYear: null, birthPlace: null, vocation: 'unknown',
    portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false, ...extra
  };
}

function surnamed(id: string, given: string, surname: string, birthYear: number): PersonSummary {
  return person(id, given, { surname: { ru: surname, be: surname, en: surname }, birthYear });
}

function placed(id: string, given: string, place: string): PersonSummary {
  return person(id, given, { birthPlace: { ru: place, be: place, en: place } });
}

function child(id: string, given: string, motherId: string | null, fatherId: string | null): PersonSummary {
  return person(id, given, { parents: { motherId, fatherId } });
}

beforeEach(() => setActivePinia(createPinia()));

function mountIndex(people: PersonSummary[], unions: Union[] = []) {
  return mount(MembersIndex, {
    props: { people, selectedId: null, unions },
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

  it('filters by the selected place', async () => {
    const wrapper = mountIndex([placed('p-1', 'Анна', 'Минск'), placed('p-2', 'Борис', 'Гродно')]);
    await wrapper.get('[data-test="filter-place"]').setValue('Гродно');
    const rows = wrapper.findAll('[data-test="member-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('Борис');
  });

  it('filters by the selected generation', async () => {
    const founder = person('p-a', 'Основатель');
    const kid = child('p-b', 'Потомок', 'p-a', null);
    const wrapper = mountIndex([founder, kid]);
    await wrapper.get('[data-test="filter-generation"]').setValue('2');
    const rows = wrapper.findAll('[data-test="member-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('Потомок');
  });

  it('includes a married-in spouse under their spouse\'s generation, not generation 1', async () => {
    const founder = person('p-a', 'Основатель');
    const kid = child('p-b', 'Потомок', 'p-a', null); // generation 2
    const spouse = person('p-s', 'Супруг', { marriedIntoFamily: true }); // no parents
    const union: Union = { id: 'u-1', partnerIds: ['p-b', 'p-s'], marriageYear: null, childIds: [] };
    const wrapper = mountIndex([founder, kid, spouse], [union]);
    await wrapper.get('[data-test="filter-generation"]').setValue('2');
    const rows = wrapper.findAll('[data-test="member-row"]');
    const names = rows.map(r => r.text());
    expect(names.some(n => n.includes('Потомок'))).toBe(true);
    expect(names.some(n => n.includes('Супруг'))).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('matches a query against the birth place when no name matches', async () => {
    const wrapper = mountIndex([placed('p-1', 'Анна', 'Витебск'), placed('p-2', 'Борис', 'Гомель')]);
    await wrapper.get('[data-test="members-search"]').setValue('Витебск');
    const rows = wrapper.findAll('[data-test="member-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('Анна');
  });

  it('collapses irregular whitespace in a place query, like the name search', async () => {
    const wrapper = mountIndex([placed('p-1', 'Анна', 'Нижний Новгород'), placed('p-2', 'Борис', 'Гомель')]);
    await wrapper.get('[data-test="members-search"]').setValue('нижний   новгород');
    const rows = wrapper.findAll('[data-test="member-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('Анна');
  });

  it('clear resets the place and generation filters along with the rest', async () => {
    const founder = placed('p-a', 'Основатель', 'Минск');
    const kid = child('p-b', 'Потомок', 'p-a', null);
    const wrapper = mountIndex([founder, kid]);
    await wrapper.get('[data-test="filter-place"]').setValue('Минск');
    expect(wrapper.findAll('[data-test="member-row"]')).toHaveLength(1);
    await wrapper.get('[data-test="filter-clear"]').trigger('click');
    expect(wrapper.findAll('[data-test="member-row"]')).toHaveLength(2);
    expect((wrapper.get('[data-test="filter-place"]').element as HTMLSelectElement).value).toBe('');
    expect((wrapper.get('[data-test="filter-generation"]').element as HTMLSelectElement).value).toBe('');
  });

  it('shows the filtered count in the footer', async () => {
    const wrapper = mountIndex([person('p-1', 'Анна'), person('p-2', 'Борис')]);
    expect(wrapper.get('.members-index__count').text()).toContain('2');
    await wrapper.get('[data-test="members-search"]').setValue('Анна');
    expect(wrapper.get('.members-index__count').text()).toContain('1');
  });
});
