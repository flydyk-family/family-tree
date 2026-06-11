import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SearchField from './SearchField.vue';
import { i18n } from '../i18n';
import { useUiStore } from '../stores/uiStore';
import { useFamilyStore } from '../stores/familyStore';
import type { PersonSummary } from '../types/family';

function person(id: string, given: string, surname: string, birthYear: number | null): PersonSummary {
  return {
    id,
    givenName: { ru: given, be: null, en: given },
    surname: { ru: surname, be: null, en: surname },
    maidenName: null,
    sex: 'male',
    birthYear,
    deathYear: null,
    vocation: 'other',
    portrait: null,
    portraitVideo: null,
    parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false,
    isDefaultRoot: false
  };
}

beforeEach(() => { setActivePinia(createPinia()); });

describe('SearchField', () => {
  it('writes the query into the store', async () => {
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    const ui = useUiStore();
    await wrapper.get('[data-test="search-input"]').setValue('Anna');
    expect(ui.search).toBe('Anna');
  });

  it('exposes an accessible name on the input', () => {
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    expect(wrapper.get('[data-test="search-input"]').attributes('aria-label')).toBeTruthy();
  });

  it('Enter advances the search cursor only when the query is non-blank', async () => {
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    const ui = useUiStore();

    await wrapper.get('[data-test="search-input"]').trigger('keydown.enter');
    expect(ui.searchCursor).toBe(0);

    await wrapper.get('[data-test="search-input"]').setValue('an');
    await wrapper.get('[data-test="search-input"]').trigger('keydown.enter');
    expect(ui.searchCursor).toBe(1);
  });

  it('Enter keeps cycling despite the native search event re-reporting the value', async () => {
    // Real browsers fire a `search` event after Enter in a type=search input.
    // The @search handler re-sets the same query — that must not reset the cursor.
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    const ui = useUiStore();
    const input = wrapper.get('[data-test="search-input"]');

    await input.setValue('an');
    await input.trigger('keydown.enter');
    await input.trigger('search');
    expect(ui.searchCursor).toBe(1);

    await input.trigger('keydown.enter');
    await input.trigger('search');
    expect(ui.searchCursor).toBe(2);
  });

  it('shows a current/total counter for a non-blank query', async () => {
    useFamilyStore().people = [person('a', 'Anna', 'Oak', 1850), person('b', 'Boris', 'Oak', 1880)];
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    const ui = useUiStore();

    await wrapper.get('[data-test="search-input"]').setValue('oak');
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 / 2');

    ui.advanceSearchCursor();
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('2 / 2');
  });

  it('hides the counter when the query is blank', () => {
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    expect(wrapper.find('[data-test="search-count"]').exists()).toBe(false);
  });

  it('shows an Enter hint only when there is more than one match', async () => {
    useFamilyStore().people = [person('a', 'Anna', 'Oak', 1850), person('b', 'Boris', 'Oak', 1880)];
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    const input = wrapper.get('[data-test="search-input"]');

    await input.setValue('oak'); // 2 matches → hint with a localized tooltip
    const hint = wrapper.get('[data-test="search-enter-hint"]');
    expect(hint.attributes('title')).toBeTruthy();

    await input.setValue('anna'); // 1 match → no hint
    expect(wrapper.find('[data-test="search-enter-hint"]').exists()).toBe(false);

    await input.setValue(''); // blank → no hint
    expect(wrapper.find('[data-test="search-enter-hint"]').exists()).toBe(false);
  });

  it('shows 0 when nothing matches', async () => {
    useFamilyStore().people = [person('a', 'Anna', 'Oak', 1850)];
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    await wrapper.get('[data-test="search-input"]').setValue('zzz');
    const count = wrapper.get('[data-test="search-count"]');
    expect(count.text()).toBe('0');
    expect(count.classes()).toContain('search__count--empty');
  });
});
