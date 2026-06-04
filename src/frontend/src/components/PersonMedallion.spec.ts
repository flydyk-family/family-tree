import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PersonMedallion from './PersonMedallion.vue';
import { useLocaleStore } from '../stores/localeStore';
import type { LayoutNode } from '../layout/treeLayout';
import type { PersonSummary } from '../types/family';

function person(overrides: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id: 'p1',
    givenName: { ru: 'Анна', be: null, en: 'Anna' },
    surname: { ru: 'Икс', be: null, en: 'X' },
    maidenName: null,
    sex: 'female',
    birthYear: 1850,
    deathYear: 1916,
    vocation: 'other',
    portrait: null,
    parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false,
    isDefaultRoot: false,
    ...overrides
  };
}

function node(nodeOverrides: Partial<LayoutNode> = {}, personOverrides: Partial<PersonSummary> = {}): LayoutNode {
  const p = person(personOverrides);
  return {
    id: p.id,
    person: p,
    x: 0,
    y: 0,
    year: p.birthYear ?? 1900,
    role: 'branch',
    generation: 0,
    ...nodeOverrides
  };
}

function mountNode(n: LayoutNode, selected = false) {
  return mount(PersonMedallion, { props: { node: n, selected } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
});

describe('PersonMedallion', () => {
  it('renders an oval medallion, not a circle', () => {
    const wrapper = mountNode(node());
    expect(wrapper.find('ellipse.oak__medallion--fill').exists()).toBe(true);
    expect(wrapper.find('circle').exists()).toBe(false);
  });

  it('shows the initial of the localized name when there is no portrait', () => {
    const wrapper = mountNode(node());
    expect(wrapper.find('.oak__initials').text()).toBe('A');
    expect(wrapper.find('[data-test="portrait"]').exists()).toBe(false);
  });

  it('renders a portrait image from the assets path when a portrait exists', () => {
    const wrapper = mountNode(node({}, { portrait: 'p-0001.jpg' }));
    const image = wrapper.find('[data-test="portrait"]');
    expect(image.exists()).toBe(true);
    expect(image.attributes('href')).toBe('/assets/portraits/p-0001.jpg');
    expect(wrapper.find('.oak__initials').exists()).toBe(false);
  });

  it('uses the engraved (modern) frame for births in 1950 or later', () => {
    const wrapper = mountNode(node({}, { birthYear: 1980 }));
    expect(wrapper.find('.oak__medallion--fill').attributes('data-era')).toBe('modern');
    expect(wrapper.find('.oak__rule-inner').exists()).toBe(true);
  });

  it('uses the gilt (classic) frame for births before 1950', () => {
    const wrapper = mountNode(node({}, { birthYear: 1900 }));
    expect(wrapper.find('.oak__medallion--fill').attributes('data-era')).toBe('classic');
    expect(wrapper.find('.oak__gilt-band').exists()).toBe(true);
  });

  it('falls back to the layout year for the frame era when birth year is unknown', () => {
    const wrapper = mountNode(node({ year: 1980 }, { birthYear: null }));
    expect(wrapper.find('.oak__medallion--fill').attributes('data-era')).toBe('modern');
  });

  it('renders the birth–death label below the medallion', () => {
    const wrapper = mountNode(node({}, { birthYear: 1850, deathYear: 1916 }));
    expect(wrapper.find('[data-test="lifespan"]').text()).toBe('1850–1916');
  });

  it('marks the medallion selected when the selected prop is set', () => {
    const wrapper = mountNode(node(), true);
    expect(wrapper.find('.oak__medallion--selected').exists()).toBe(true);
  });

  it('treats the exact year 1950 as the modern era (the cutoff is inclusive)', () => {
    const wrapper = mountNode(node({}, { birthYear: 1950 }));
    expect(wrapper.find('.oak__medallion--fill').attributes('data-era')).toBe('modern');
  });

  it('renders no initials glyph when the name is empty', () => {
    const wrapper = mountNode(node({}, { givenName: { ru: null, be: null, en: null } }));
    expect(wrapper.find('.oak__initials').exists()).toBe(false);
  });
});
