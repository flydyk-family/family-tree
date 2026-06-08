import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatsPanel from './StatsPanel.vue';
import { i18n } from '../i18n';
import type { PersonSummary } from '../types/family';

function person(id: string, birthYear: number | null, portrait: string | null, deathYear: number | null): PersonSummary {
  return {
    id, givenName: { ru: id, be: null, en: id }, surname: { ru: 'X', be: null, en: 'X' },
    maidenName: null, sex: 'male', birthYear, deathYear, vocation: 'other', portrait,
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false
  };
}

describe('StatsPanel', () => {
  it('computes counts from the people list', () => {
    const people = [
      person('a', 1900, 'a.jpg', 1970),
      person('b', 1880, null, null),
      person('c', null, 'c.jpg', null)
    ];
    const wrapper = mount(StatsPanel, { props: { people }, global: { plugins: [i18n] } });
    expect(wrapper.get('[data-test="stat-members"]').text()).toContain('3');
    expect(wrapper.get('[data-test="stat-earliest"]').text()).toContain('1880');
    expect(wrapper.get('[data-test="stat-withPortraits"]').text()).toContain('2');
    expect(wrapper.get('[data-test="stat-living"]').text()).toContain('2');
    expect(wrapper.text()).toContain('Family Statistics');
  });

  it('shows zeros and an em dash when there are no people', () => {
    const wrapper = mount(StatsPanel, { props: { people: [] }, global: { plugins: [i18n] } });
    expect(wrapper.get('[data-test="stat-members"]').text()).toContain('0');
    expect(wrapper.get('[data-test="stat-earliest"]').text()).toContain('—');
    expect(wrapper.get('[data-test="stat-withPortraits"]').text()).toContain('0');
    expect(wrapper.get('[data-test="stat-living"]').text()).toContain('0');
  });
});
