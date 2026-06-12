import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PersonMedallion from './PersonMedallion.vue';
import { useLocaleStore } from '../stores/localeStore';
import type { LayoutNode } from '../layout/treeLayout';
import type { PersonSummary } from '../types/family';

const { capturePaintMock, tweenFromPaintMock } = vi.hoisted(() => ({
  capturePaintMock: vi.fn((..._args: unknown[]) => []),
  tweenFromPaintMock: vi.fn()
}));
vi.mock('../motion/stateTween', () => ({
  capturePaint: capturePaintMock,
  tweenFromPaint: tweenFromPaintMock
}));

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
    portraitVideo: null,
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
    const wrapper = mountNode(node({}, { portrait: 'p-0001.jpg' }));
    expect(wrapper.find('ellipse.oak__medallion--fill').exists()).toBe(true);
    // The v1 medallion is built entirely from ellipses + text; no circle anywhere.
    expect(wrapper.find('circle').exists()).toBe(false);
  });

  it('fills the disc with a per-node tint via a gradient reference', () => {
    const wrapper = mount(PersonMedallion, { props: { node: node(), tintIndex: 4 } });
    expect(wrapper.find('ellipse.oak__medallion--fill').attributes('fill')).toBe('url(#oak-tint-4)');
  });

  it('cycles the tint index back into the 0–5 range', () => {
    const wrapper = mount(PersonMedallion, { props: { node: node(), tintIndex: 7 } });
    expect(wrapper.find('ellipse.oak__medallion--fill').attributes('fill')).toBe('url(#oak-tint-1)');
  });

  it('renders the given-name initial as a monogram when there is no portrait', () => {
    const wrapper = mountNode(node());
    const initial = wrapper.find('.oak__initial');
    expect(initial.exists()).toBe(true);
    expect(initial.text()).toBe('A');
    expect(wrapper.find('[data-test="portrait"]').exists()).toBe(false);
  });

  it('renders a portrait image from the media path when a portrait exists', () => {
    const wrapper = mountNode(node({}, { portrait: 'p-0001.jpg' }));
    const image = wrapper.find('[data-test="portrait"]');
    expect(image.exists()).toBe(true);
    expect(image.attributes('href')).toBe('/media/portraits/p-0001.jpg');
    // With a portrait present the monogram is suppressed.
    expect(wrapper.find('.oak__initial').exists()).toBe(false);
  });

  it('frames every medallion with the same gilt ring and inner engraved rule', () => {
    const classic = mountNode(node({}, { birthYear: 1900 }));
    const modern = mountNode(node({}, { birthYear: 1980 }));
    for (const wrapper of [classic, modern]) {
      expect(wrapper.find('.oak__gilt-band').exists()).toBe(true);
      expect(wrapper.find('.oak__gilt-edge').exists()).toBe(true);
    }
  });

  it('renders the birth–death label below the medallion', () => {
    const wrapper = mountNode(node({}, { birthYear: 1850, deathYear: 1916 }));
    expect(wrapper.find('[data-test="lifespan"]').text()).toBe('1850–1916');
  });

  it('marks the medallion selected when the selected prop is set', () => {
    const wrapper = mountNode(node(), true);
    expect(wrapper.find('.oak__medallion--selected').exists()).toBe(true);
  });

  it('still renders the monogram element (empty) when the name is empty and there is no portrait', () => {
    const wrapper = mountNode(node({}, { givenName: { ru: null, be: null, en: null } }));
    expect(wrapper.find('.oak__initial').exists()).toBe(true);
    expect(wrapper.find('[data-test="portrait"]').exists()).toBe(false);
  });

  it('captures the old paint and tweens from it when the selection state flips', async () => {
    const wrapper = mountNode(node());
    capturePaintMock.mockClear();
    tweenFromPaintMock.mockClear();
    await wrapper.setProps({ selected: true });
    await nextTick();
    expect(capturePaintMock).toHaveBeenCalledTimes(1);
    // ring + scroll body + two roll ends
    expect((capturePaintMock.mock.calls[0][0] as Element[]).length).toBe(4);
    expect(tweenFromPaintMock).toHaveBeenCalledTimes(1);
  });

  it('tweens when the match state flips', async () => {
    const wrapper = mount(PersonMedallion, { props: { node: node(), match: false } });
    capturePaintMock.mockClear();
    tweenFromPaintMock.mockClear();
    await wrapper.setProps({ match: true });
    await nextTick();
    expect(tweenFromPaintMock).toHaveBeenCalledTimes(1);
  });

  it('does not tween when an unrelated prop changes', async () => {
    const wrapper = mountNode(node());
    capturePaintMock.mockClear();
    tweenFromPaintMock.mockClear();
    await wrapper.setProps({ tintIndex: 3 });
    await nextTick();
    expect(tweenFromPaintMock).not.toHaveBeenCalled();
  });
});
