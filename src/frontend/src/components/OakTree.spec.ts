import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import OakTree from './OakTree.vue';
import { buildLayout } from '../layout/treeLayout';
import { projectLayout } from '../layout/projection';
import { buildEntranceCues } from '../motion/entranceCues';
import { useLocaleStore } from '../stores/localeStore';
import { useUiStore } from '../stores/uiStore';
import type { FamilyGraph } from '../types/family';

// OakTree mounts trigger real GSAP calls (viewport fade on mount, camera
// glides) — mock the library so no tween ever reaches GSAP's ticker in jsdom.
const gsapMocks = vi.hoisted(() => ({
  to: vi.fn(() => ({ kill: vi.fn() })),
  from: vi.fn(),
  fromTo: vi.fn(),
  set: vi.fn()
}));
vi.mock('gsap', () => ({ default: gsapMocks }));

const graph: FamilyGraph = {
  people: [
    { id: 'a', givenName: { ru: 'Анна', be: null, en: 'Anna' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'male', birthYear: 1850, deathYear: null, birthPlace: null, vocation: 'other', portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true },
    { id: 'b', givenName: { ru: 'Борис', be: null, en: 'Boris' }, surname: { ru: 'Икс', be: null, en: 'X' }, maidenName: null, sex: 'female', birthYear: 1880, deathYear: null, birthPlace: null, vocation: 'other', portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: 'a' }, marriedIntoFamily: false, isDefaultRoot: false }
  ],
  unions: [{ id: 'u', partnerIds: ['a'], marriageYear: null, childIds: ['b'] }]
};

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  // These specs assert classic-medallion structure and its OakTree-driven
  // hover-lift; the app now defaults to the eighties (film) theme (whose
  // medallions own their hover motion), so pin classic explicitly here.
  useUiStore().setTheme('classic');
});

function mountOak(extraProps: Record<string, unknown> = {}) {
  const layout = buildLayout(graph, { focusId: 'a' });
  return mount(OakTree, { props: { layout, ...extraProps } });
}

describe('OakTree', () => {
  it('renders an svg with a node element per person and a branch per descent link', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="node"]').length).toBe(graph.people.length);
    // one connector group per present union, each emitting ≥1 descent branch
    expect(wrapper.findAll('.oak__family').length).toBe(layout.unions.length);
    expect(wrapper.findAll('[data-test="branch"]').length).toBeGreaterThan(0);
  });

  it('renders localized node names and updates when the locale changes', async () => {
    const store = useLocaleStore();
    store.setLocale('en');
    expect(store.currentLocale).toBe('en');
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    const names = () => wrapper.findAll('.oak__name').map(node => node.text());
    expect(names()).toContain('Anna X');

    store.setLocale('ru');
    await wrapper.vm.$nextTick();

    expect(names()).toContain('Анна Икс');
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

    expect(wrapper.findAll('ellipse.oak__mount')).toHaveLength(2);
    // The medallion is built from ellipses + frame <image>s + <text>; no circles anywhere.
    expect(wrapper.findAll('circle')).toHaveLength(0);
  });

  it('keeps branches thin so the portrait medallions dominate', () => {
    // Regression guard: FamilyConnector sets stroke-width via CSS (.branch__core)
    // so branches never carry an oversize inline stroke-width attribute.
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });

    const branches = wrapper.findAll('[data-test="branch"]');
    expect(branches.length).toBeGreaterThanOrEqual(1);
    for (const branch of branches) {
      // FamilyConnector governs stroke-width via CSS; no inline value must be present.
      expect(branch.attributes('stroke-width')).toBeUndefined();
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

  it('renders the era strata layer only when entrance cues are provided', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const cues = buildEntranceCues(layout, { width: 800, height: 600 })!;
    const without = mount(OakTree, { props: { layout } });
    expect(without.find('[data-test="strata"]').exists()).toBe(false);
    const wrapper = mount(OakTree, { props: { layout, entranceCues: cues } });
    expect(wrapper.find('[data-test="strata"]').exists()).toBe(true);
    expect(wrapper.findAll('.oak__stratum')).toHaveLength(cues.strata.length);
  });

  it('tags branches, unions and nodes with their entrance generation', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    const unionById = new Map(layout.unions.map(u => [u.id, u]));
    wrapper.findAll('[data-test="branch"]').forEach(branch => {
      const u = unionById.get(branch.attributes('data-link-id')!)!;
      expect(branch.attributes('data-entrance-draw')).toBe(String(u.generation));
    });
    for (const node of wrapper.findAll('[data-test="node"]')) {
      expect(node.attributes('data-entrance-node')).toBeDefined();
    }
  });

  it('renders the dawn-light glow alongside the strata', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const cues = buildEntranceCues(layout, { width: 800, height: 600 })!;
    const wrapper = mount(OakTree, { props: { layout, entranceCues: cues } });
    const dawn = wrapper.find('[data-entrance-dawn]');
    expect(dawn.exists()).toBe(true);
    expect(Number(dawn.attributes('cx'))).toBeCloseTo(cues.dawnCross, 4);
    expect(wrapper.find('[data-entrance-trace]').exists()).toBe(true);
    expect(wrapper.find('[data-entrance-star]').exists()).toBe(true);
  });

  it('renders the strata, era lines and comet tail for the horizontal axis', () => {
    const hLayout = projectLayout(buildLayout(graph, { focusId: 'a' }), 'horizontal');
    const cues = buildEntranceCues(hLayout, { width: 800, height: 600 }, 'horizontal')!;
    const wrapper = mount(OakTree, { props: { layout: hLayout, orientation: 'horizontal', entranceCues: cues } });
    expect(wrapper.findAll('.oak__stratum')).toHaveLength(cues.strata.length);
    // horizontal: each era line is vertical (x1 === x2), not horizontal
    const line = wrapper.find('.oak__stratum-line');
    expect(line.attributes('x1')).toBe(line.attributes('x2'));
    // the comet tail is a wide-and-short rect that trails the rightward head
    const trace = wrapper.find('[data-entrance-trace]');
    expect(Number(trace.attributes('width'))).toBeGreaterThan(Number(trace.attributes('height')));
    // the glow sits on the cross-axis centre line (cy = dawnCross in horizontal)
    expect(Number(wrapper.find('[data-entrance-dawn]').attributes('cy'))).toBeCloseTo(cues.dawnCross, 4);
  });

  it('exposes entrance targets (svg element + the live viewport ref)', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    const targets = (wrapper.vm as unknown as { entranceTargets: () => { svg: SVGSVGElement | null; viewport: { value: { k: number } } } }).entranceTargets();
    expect(targets.svg).toBe(wrapper.find('svg').element);
    expect(typeof targets.viewport.value.k).toBe('number');
  });

  it('tags each medallion <g> with its node id', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    expect(wrapper.get('[data-test="node"]').attributes('data-node-id')).toBeTruthy();
  });

  it('exposes animateFitTo for the layout-morph camera re-fit', () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    expect(typeof (wrapper.vm as unknown as { animateFitTo: unknown }).animateFitTo).toBe('function');
  });

  it('fades the branch and union groups via morphProgress', async () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout, morphProgress: 0.5 } });
    await wrapper.vm.$nextTick();
    // branchFade(0.5) === 0 (mid-morph, under cover of darkness)
    expect(wrapper.find('.oak__branches').attributes('style')).toContain('opacity: 0');
  });

  it('keeps branches fully visible when morphProgress is absent', async () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    await wrapper.vm.$nextTick();
    // branchOpacity falls back to 1, so the style never hides the group
    expect(wrapper.find('.oak__branches').attributes('style') ?? '').not.toContain('opacity: 0');
  });

  it('lifts a medallion on pointer-enter and settles it on leave', async () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout } });
    const nodeEl = wrapper.findAll('[data-test="node"]')[0];

    gsapMocks.to.mockClear();
    await nodeEl.trigger('pointerenter');
    expect(gsapMocks.to).toHaveBeenCalledWith(
      nodeEl.find('.oak__medallion-card').element,
      expect.objectContaining({ scale: 1.03 })
    );

    gsapMocks.to.mockClear();
    await nodeEl.trigger('pointerleave');
    expect(gsapMocks.to).toHaveBeenCalledWith(
      nodeEl.find('.oak__medallion-card').element,
      expect.objectContaining({ scale: 1 })
    );
  });

  it('suppresses the hover lift while the entrance ceremony is active', async () => {
    const layout = buildLayout(graph, { focusId: 'a' });
    const wrapper = mount(OakTree, { props: { layout, ceremonyActive: true } });
    const nodeEl = wrapper.findAll('[data-test="node"]')[0];

    gsapMocks.to.mockClear();
    await nodeEl.trigger('pointerenter');
    expect(gsapMocks.to).not.toHaveBeenCalled();
  });

  it('renders rope twist overlays in Film theme and plain branches in Classic', async () => {
    const ui = useUiStore();
    ui.setTheme('eighties');
    const filmWrapper = mountOak();
    await filmWrapper.vm.$nextTick();
    // film theme: rope twist overlays present, connector group marked --film
    expect(filmWrapper.findAll('path.rope__twist-hi').length).toBeGreaterThan(0);
    expect(filmWrapper.find('.oak__family--film').exists()).toBe(true);
    // the core still exposes the ceremony/test contract
    const core = filmWrapper.find('path.branch__core[data-test="branch"]');
    expect(core.exists()).toBe(true);

    ui.setTheme('classic');
    const classicWrapper = mountOak();
    await classicWrapper.vm.$nextTick();
    // classic: no twist overlays, connector group has no --film modifier
    expect(classicWrapper.find('path.rope__twist-hi').exists()).toBe(false);
    expect(classicWrapper.find('.oak__family--film').exists()).toBe(false);
    expect(classicWrapper.find('path.branch__core[data-test="branch"]').exists()).toBe(true);
  });

});
