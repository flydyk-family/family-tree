import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import OakTree from './OakTree.vue';
import { buildLayout } from '../layout/treeLayout';
import { useLocaleStore } from '../stores/localeStore';
import { useUiStore } from '../stores/uiStore';
import type { FamilyGraph } from '../types/family';

// OakTree mounts trigger real GSAP calls (viewport fade on mount, camera
// glides) — mock the library so no tween ever reaches GSAP's ticker in jsdom.
const gsapMocks = vi.hoisted(() => ({
  to: vi.fn(() => ({ kill: vi.fn() })),
  fromTo: vi.fn(),
  set: vi.fn()
}));
vi.mock('gsap', () => ({ default: gsapMocks }));

const graph: FamilyGraph = {
  people: [
    { id: 'a', givenName: { ru: 'Анна', be: null, en: 'Anna' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'male', birthYear: 1850, deathYear: null, vocation: 'other', portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true },
    { id: 'b', givenName: { ru: 'Борис', be: null, en: 'Boris' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'female', birthYear: 1880, deathYear: null, vocation: 'other', portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: 'a' }, marriedIntoFamily: false, isDefaultRoot: false }
  ],
  unions: [{ id: 'u', partnerIds: ['a'], marriageYear: null, childIds: ['b'] }]
};

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('OakTree', () => {
  it('renders an svg with a node element per person and a branch per descent link', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="node"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-test="branch"]').length).toBeGreaterThanOrEqual(1);
  });

  it('renders localized node names and updates when the locale changes', async () => {
    const store = useLocaleStore();
    store.setLocale('en');
    expect(store.currentLocale).toBe('en');
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    const names = () => wrapper.findAll('.oak__name').map(node => node.text());
    expect(names()).toContain('Anna');

    store.setLocale('ru');
    await wrapper.vm.$nextTick();

    expect(names()).toContain('Анна');
  });

  it('emits select with the person id when a node is clicked', async () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    await wrapper.findAll('[data-test="node"]')[0].trigger('click');

    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual(['a']);
  });

  it('emits select when Enter is pressed on a focused node', async () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    await wrapper.findAll('[data-test="node"]')[1].trigger('keydown.enter');

    expect(wrapper.emitted('select')![0]).toEqual(['b']);
  });

  it('marks the selected node with a modifier class', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout, selectedId: 'b' } });

    const selected = wrapper.findAll('[data-test="node"]').filter(node => node.classes('oak__node--selected'));
    expect(selected).toHaveLength(1);
  });

  it('renders an oval medallion (not a circle) per person', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    expect(wrapper.findAll('ellipse.oak__medallion--fill')).toHaveLength(2);
    // The v1 medallion is built from ellipses + a monogram <text>; no circles anywhere.
    expect(wrapper.findAll('circle')).toHaveLength(0);
  });

  it('keeps branches thin so the portrait medallions dominate', () => {
    // Regression guard: a full-file rewrite once reverted the PR #7 branch
    // thinning. Branch stroke-width must stay well under a medallion's width.
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    const widths = wrapper
      .findAll('[data-test="branch"]')
      .map(branch => Number(branch.attributes('stroke-width')));

    expect(widths.length).toBeGreaterThanOrEqual(1);
    for (const width of widths) {
      expect(width).toBeLessThanOrEqual(5);
    }
  });

  it('highlights nodes whose name matches the search query', async () => {
    const store = useLocaleStore();
    store.setLocale('en');
    const ui = useUiStore();
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    ui.setSearch('zzz-no-match');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.oak__node--match')).toHaveLength(0);

    ui.setSearch('Anna');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.oak__node--match').length).toBeGreaterThan(0);
  });

  function stubSvgRect(wrapper: ReturnType<typeof mount>, width = 800, height = 600): void {
    (wrapper.find('svg').element as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect =
      () => ({ width, height, left: 0, top: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} }) as DOMRect;
  }

  function stubReducedMotion(): void {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {}
    }));
  }

  it('centers the camera on the requested person', async () => {
    stubReducedMotion();
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    stubSvgRect(wrapper);
    const node = layout.nodes.find(n => n.id === 'b')!;

    await wrapper.setProps({ centerRequest: { id: 'b', seq: 1 } });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.oak__viewport').attributes('transform'))
      .toBe(`translate(${400 - node.x},${300 - node.y}) scale(1)`);
    vi.unstubAllGlobals();
  });

  it('re-centers when the same person is requested again after a pan', async () => {
    stubReducedMotion();
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    stubSvgRect(wrapper);
    const node = layout.nodes.find(n => n.id === 'b')!;
    const centered = `translate(${400 - node.x},${300 - node.y}) scale(1)`;

    await wrapper.setProps({ centerRequest: { id: 'b', seq: 1 } });
    await wrapper.vm.$nextTick();

    // NOTE: glides are instant here (reduced-motion stub), so this proves
    // pan-then-re-center, not drag-cancels-glide — that cancellation path is
    // unit-tested in usePanZoom.spec.ts ('a pointer press cancels an in-flight glide').
    // user pans away — dispatch real PointerEvents so clientX/clientY are set correctly
    const svgEl = wrapper.find('svg').element as SVGSVGElement & { setPointerCapture: (id: number) => void };
    svgEl.setPointerCapture = () => {};
    svgEl.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0, bubbles: true }));
    svgEl.dispatchEvent(new PointerEvent('pointermove', { clientX: 160, clientY: 130, bubbles: true }));
    svgEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.oak__viewport').attributes('transform')).not.toBe(centered);

    // …Enter re-issues the same target with a new seq → camera returns
    await wrapper.setProps({ centerRequest: { id: 'b', seq: 2 } });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.oak__viewport').attributes('transform')).toBe(centered);
    vi.unstubAllGlobals();
  });

  it('ignores a request for a person missing from the layout', async () => {
    stubReducedMotion();
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    stubSvgRect(wrapper);
    const node = layout.nodes.find(n => n.id === 'b')!;

    // Establish a non-identity baseline first, so a wrongly-firing watcher
    // (rather than a correctly-skipping one) would be caught by the assert.
    await wrapper.setProps({ centerRequest: { id: 'b', seq: 1 } });
    await wrapper.vm.$nextTick();
    const centered = `translate(${400 - node.x},${300 - node.y}) scale(1)`;
    expect(wrapper.get('.oak__viewport').attributes('transform')).toBe(centered);

    await wrapper.setProps({ centerRequest: { id: 'ghost', seq: 2 } });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.oak__viewport').attributes('transform')).toBe(centered);
    vi.unstubAllGlobals();
  });
});
