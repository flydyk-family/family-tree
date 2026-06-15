import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PersonMedallion from './PersonMedallion.vue';
import { useLocaleStore } from '../stores/localeStore';
import { frameGold, frameSelected, frameMatch } from './medallion/frameAssets';
import type { LayoutNode } from '../layout/treeLayout';
import type { PersonSummary } from '../types/family';

const { fadeToMock, setOpacityMock } = vi.hoisted(() => ({ fadeToMock: vi.fn(), setOpacityMock: vi.fn() }));
vi.mock('../motion/fade', () => ({ fadeTo: fadeToMock, setOpacity: setOpacityMock, fadeIn: vi.fn() }));

function person(overrides: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id: 'p1',
    givenName: { ru: 'Анна', be: null, en: 'Anna' },
    surname: { ru: 'Икс', be: null, en: 'X' },
    maidenName: null, sex: 'female', birthYear: 1850, deathYear: 1916,
    vocation: 'other', portrait: null, portraitVideo: null,
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false,
    ...overrides
  };
}
function node(nodeOverrides: Partial<LayoutNode> = {}, personOverrides: Partial<PersonSummary> = {}): LayoutNode {
  const p = person(personOverrides);
  return { id: p.id, person: p, x: 0, y: 0, year: p.birthYear ?? 1900, role: 'branch', generation: 0, ...nodeOverrides };
}
function mountNode(n: LayoutNode, props: Record<string, unknown> = {}) {
  return mount(PersonMedallion, { props: { node: n, ...props } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  fadeToMock.mockReset();
  setOpacityMock.mockReset();
});

describe('PersonMedallion', () => {
  it('draws the base gold frame and a dark portrait mount', () => {
    const wrapper = mountNode(node());
    expect(wrapper.find('image.oak__frame').attributes('href')).toBe(frameGold);
    expect(wrapper.find('ellipse.oak__mount').exists()).toBe(true);
    expect(wrapper.find('circle').exists()).toBe(false);
  });

  it('renders a portrait image from the media path when a portrait exists', () => {
    const wrapper = mountNode(node({}, { portrait: 'p-0001.jpg' }));
    const image = wrapper.find('[data-test="portrait"]');
    expect(image.exists()).toBe(true);
    expect(image.attributes('href')).toBe('/media/portraits/p-0001.jpg');
    expect(wrapper.find('.oak__initial').exists()).toBe(false);
  });

  it('falls back to the given-name initial when there is no portrait', () => {
    const wrapper = mountNode(node());
    expect(wrapper.find('.oak__initial').text()).toBe('A');
    expect(wrapper.find('[data-test="portrait"]').exists()).toBe(false);
  });

  it('renders the full name on one line', () => {
    const wrapper = mountNode(node());
    expect(wrapper.find('.oak__name').text()).toBe('Anna X');
  });

  it('renders the birth–death label', () => {
    const wrapper = mountNode(node({}, { birthYear: 1850, deathYear: 1916 }));
    expect(wrapper.find('[data-test="lifespan"]').text()).toBe('1850–1916');
  });

  it('omits the years line when birth and death are both unknown', () => {
    const wrapper = mountNode(node({}, { birthYear: null, deathYear: null }));
    expect(wrapper.find('[data-test="lifespan"]').exists()).toBe(false);
  });

  it('shows the lit-gold overlay when selected', () => {
    const wrapper = mountNode(node(), { selected: true });
    expect(wrapper.find('image.oak__frame-overlay').attributes('href')).toBe(frameSelected);
  });

  it('shows the green-gold overlay when a search match (match wins over selected)', () => {
    const wrapper = mountNode(node(), { selected: true, match: true });
    expect(wrapper.find('image.oak__frame-overlay').attributes('href')).toBe(frameMatch);
  });

  it('seeds the overlay opacity at mount (hidden when normal)', () => {
    mountNode(node());
    expect(setOpacityMock).toHaveBeenCalledWith(expect.anything(), 0);
  });

  it('crossfades the overlay in when selection turns on', async () => {
    const wrapper = mountNode(node());
    fadeToMock.mockReset();
    await wrapper.setProps({ selected: true });
    await nextTick();
    expect(fadeToMock).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('crossfades the overlay out when the state clears', async () => {
    const wrapper = mountNode(node(), { match: true });
    fadeToMock.mockReset();
    await wrapper.setProps({ match: false });
    await nextTick();
    expect(fadeToMock).toHaveBeenCalledWith(expect.anything(), 0);
  });

  it('does not crossfade when an unrelated prop changes', async () => {
    const wrapper = mountNode(node());
    fadeToMock.mockReset();
    await wrapper.setProps({ node: { ...node(), x: 99 } });
    await nextTick();
    expect(fadeToMock).not.toHaveBeenCalled();
  });

  it('seeds the overlay opacity at mount (visible when already-selected)', () => {
    setOpacityMock.mockReset();
    mountNode(node(), { selected: true });
    expect(setOpacityMock).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('retains the overlay href during fade-out (no colour pop to plain gold)', async () => {
    const wrapper = mountNode(node(), { match: true });
    await wrapper.setProps({ match: false });
    await nextTick();
    expect(wrapper.find('image.oak__frame-overlay').attributes('href')).toBe(frameMatch);
  });

  it('still renders the monogram element when the name is empty and there is no portrait', () => {
    const wrapper = mountNode(node({}, { givenName: { ru: null, be: null, en: null } }));
    expect(wrapper.find('.oak__initial').exists()).toBe(true);
    expect(wrapper.find('[data-test="portrait"]').exists()).toBe(false);
  });

  it('seeds the portrait image at opacity 0 on mount', () => {
    const wrapper = mountNode(node({}, { portrait: 'p-0001.jpg' }));
    const img = wrapper.find('[data-test="portrait"]').element;
    expect(setOpacityMock).toHaveBeenCalledWith(img, 0);
  });

  it('fades the portrait in when it finishes loading', async () => {
    const wrapper = mountNode(node({}, { portrait: 'p-0001.jpg' }));
    const img = wrapper.find('[data-test="portrait"]');
    fadeToMock.mockReset();
    await img.trigger('load');
    expect(fadeToMock).toHaveBeenCalledWith(img.element, 1);
  });

  it('seeds no portrait opacity for the monogram fallback', () => {
    setOpacityMock.mockReset();
    mountNode(node()); // no portrait
    // only the overlay-seed call happens; no portrait element to seed
    expect(setOpacityMock).toHaveBeenCalledTimes(1);
  });
});
