import { describe, it, expect, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PersonMedallion from './PersonMedallion.vue';
import { useLocaleStore } from '../stores/localeStore';
import { useUiStore } from '../stores/uiStore';
import { frameGold, frameSelected, frameMatch } from './medallion/frameAssets';
import type { LayoutNode } from '../layout/treeLayout';
import type { PersonSummary } from '../types/family';

// The overlay opacity that highlights selected / search-matched medallions.
function overlayOpacity(wrapper: ReturnType<typeof mountNode>): string {
  return (wrapper.find('image.oak__frame-overlay').element as SVGElement).style.opacity;
}

function person(overrides: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id: 'p1',
    givenName: { ru: 'Анна', be: null, en: 'Anna' },
    surname: { ru: 'Икс', be: null, en: 'X' },
    maidenName: null, middleName: null, sex: 'female', birthYear: 1850, deathYear: 1916,
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
  // These specs exercise classic-frame rendering; the app now defaults to the
  // eighties (film) theme, so pin classic explicitly. The eighties-card test
  // overrides this back to 'eighties'.
  useUiStore().setTheme('classic');
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

  it('hides the overlay at mount when the node is normal', () => {
    const wrapper = mountNode(node());
    expect(overlayOpacity(wrapper)).toBe('0');
  });

  it('shows the overlay when selection turns on', async () => {
    const wrapper = mountNode(node());
    expect(overlayOpacity(wrapper)).toBe('0');
    await wrapper.setProps({ selected: true });
    await nextTick();
    expect(overlayOpacity(wrapper)).toBe('1');
  });

  it('hides the overlay when the state clears', async () => {
    const wrapper = mountNode(node(), { match: true });
    expect(overlayOpacity(wrapper)).toBe('1');
    await wrapper.setProps({ match: false });
    await nextTick();
    expect(overlayOpacity(wrapper)).toBe('0');
  });

  it('leaves the overlay hidden when an unrelated prop changes', async () => {
    const wrapper = mountNode(node());
    await wrapper.setProps({ node: { ...node(), x: 99 } });
    await nextTick();
    expect(overlayOpacity(wrapper)).toBe('0');
  });

  it('shows the overlay at mount when already-selected', () => {
    const wrapper = mountNode(node(), { selected: true });
    expect(overlayOpacity(wrapper)).toBe('1');
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

  it('renders the classic gilt frame under the classic theme', () => {
    const wrapper = mountNode(node());
    expect(wrapper.find('image.oak__frame').exists()).toBe(true);
    expect(wrapper.find('.film, .cab, .gel').exists()).toBe(false);
  });

  it('renders an epoch card under the eighties theme', async () => {
    const { useUiStore } = await import('../stores/uiStore');
    useUiStore().setTheme('eighties');
    const wrapper = mountNode(node({}, { birthYear: 1970 }));
    expect(wrapper.find('.film').exists()).toBe(true);
    expect(wrapper.find('image.oak__frame').exists()).toBe(false);
  });
});
