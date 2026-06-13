import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PanelRail from './PanelRail.vue';
import DockPanel from './DockPanel.vue';
import { usePanelStore } from '../stores/panelStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonSummary, PersonDetail } from '../types/family';

// Prevent GSAP / Flip from running in jsdom — useDockMorph calls captureDockMorph
// which touches Flip.getState; a no-op stub is enough since tests assert store state.
vi.mock('../motion/popupDock', () => ({
  captureDockMorph: vi.fn(() => ({ play: vi.fn(() => null) })),
}));

// Force desktop: matchMedia never matches the mobile query.
vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));

function person(id: string, name: string): PersonSummary {
  return { id, givenName: { ru: name, be: null, en: name }, surname: { ru: 'K', be: null, en: 'K' },
    maidenName: null, sex: 'male', birthYear: 1900, deathYear: 1970, vocation: 'other', portrait: null, portraitVideo: null,
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false };
}
const people = [person('p-1', 'Anna'), person('p-2', 'Symon')];

// Find a DockPanel by its title prop (order-independent).
const personPanel = (w: any, name: string) =>
  w.findAllComponents(DockPanel).find((c: any) => c.props('title') === name)!;

function mountRail() {
  useSelectionStore().$patch({ selectedId: 'p-1', mode: 'normal', loading: false, error: null,
    detail: { id: 'p-1', givenName: { ru: 'Anna', be: null, en: 'Anna' }, surname: { ru: 'K', be: null, en: 'K' },
      maidenName: null, sex: 'female', birth: { year: 1900, month: null, day: null, approx: false, place: null },
      death: null, vocation: 'other', summary: { ru: null, be: null, en: 'Summary' }, biography: null,
      portrait: null, portraitVideo: null, gallery: [], links: [], residences: [], parents: { motherId: null, fatherId: null },
      marriedIntoFamily: false, isDefaultRoot: false } as PersonDetail });
  return mount(PanelRail, { props: { people }, global: { plugins: [i18n] } });
}

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); useLocaleStore().setLocale('en'); });

describe('PanelRail (desktop)', () => {
  it('always renders the pinned stats panel', () => {
    const w = mountRail();
    expect(w.find('[data-test="stats-panel"]').exists()).toBe(true);
  });

  it('renders a person panel per open person, names in the title', () => {
    const w = mountRail();
    const panel = usePanelStore();
    panel.openPerson('p-1');
    return w.vm.$nextTick().then(() => {
      const titles = w.findAll('[data-test="panel-title"]').map(n => n.text());
      expect(titles).toContain('Anna K');
    });
  });

  it('renders PersonDetail inside the expanded person panel', async () => {
    const w = mountRail();
    usePanelStore().openPerson('p-1');
    await w.vm.$nextTick();
    expect(w.find('[data-test="person-detail"]').exists()).toBe(true);
  });

  it('minimize button minimizes that person in the store', async () => {
    const w = mountRail();
    usePanelStore().openPerson('p-1');
    await w.vm.$nextTick();
    await personPanel(w, 'Anna K').get('[data-test="panel-minimize"]').trigger('click');
    expect(usePanelStore().expandedId).toBeNull();
  });

  it('bigger button (on expanded bar) calls undock and ends with biggerViewId set', async () => {
    const w = mountRail();
    usePanelStore().openPerson('p-1');
    await w.vm.$nextTick();
    await personPanel(w, 'Anna K').get('[data-test="panel-bigger"]').trigger('click');
    expect(usePanelStore().biggerViewId).toBe('p-1');
  });

  it('minimized desktop person panel renders the undock (⤢) button', async () => {
    const w = mountRail();
    const panel = usePanelStore();
    panel.openPerson('p-1');
    panel.openPerson('p-2');   // p-1 is now minimized, p-2 is expanded
    await w.vm.$nextTick();
    // p-1 is minimized — it should have both expand and bigger (undock) buttons
    const annaPanel = personPanel(w, 'Anna K');
    expect(annaPanel.find('[data-test="panel-expand"]').exists()).toBe(true);
    expect(annaPanel.find('[data-test="panel-bigger"]').exists()).toBe(true);
  });

  it('clicking undock (⤢) on a minimized bar calls undock and sets biggerViewId', async () => {
    const w = mountRail();
    const panel = usePanelStore();
    panel.openPerson('p-1');
    panel.openPerson('p-2');   // p-1 is minimized
    await w.vm.$nextTick();
    await personPanel(w, 'Anna K').get('[data-test="panel-bigger"]').trigger('click');
    expect(panel.biggerViewId).toBe('p-1');
    expect(panel.expandedId).toBe('p-1');
  });

  it('does not render the mobile arrow on desktop', () => {
    const w = mountRail();
    expect(w.find('[data-test="rail-arrow"]').exists()).toBe(false);
  });

  it('hides the popped-out person panel from the rail when biggerViewId is set', async () => {
    const w = mountRail();
    const panel = usePanelStore();
    panel.openPerson('p-1');
    panel.openPerson('p-2');
    await w.vm.$nextTick();
    // Both panels visible initially
    expect(w.findAllComponents(DockPanel).filter(c => ['Anna K', 'Symon K'].includes(c.props('title'))).length).toBe(2);
    // Pop out Anna K
    panel.openBiggerView('p-1');
    await w.vm.$nextTick();
    // Anna K's panel should no longer be in the rail
    const annaPanel = w.findAllComponents(DockPanel).find(c => c.props('title') === 'Anna K');
    expect(annaPanel).toBeUndefined();
    // Symon K and stats still present
    expect(w.findAllComponents(DockPanel).find(c => c.props('title') === 'Symon K')).toBeDefined();
    expect(w.find('[data-test="stats-panel"]').exists()).toBe(true);
  });

  it('person DockPanels carry data-flip-id="dock-card-<id>" for the Flip morph', async () => {
    const w = mountRail();
    const panel = usePanelStore();
    panel.openPerson('p-1');
    panel.openPerson('p-2');
    await w.vm.$nextTick();
    expect(w.find('[data-flip-id="dock-card-p-1"]').exists()).toBe(true);
    expect(w.find('[data-flip-id="dock-card-p-2"]').exists()).toBe(true);
  });

  it('clicking ⤢ routes through dockMorph.undock: biggerViewId set after nextTick', async () => {
    const w = mountRail();
    const panel = usePanelStore();
    panel.openPerson('p-1');
    await w.vm.$nextTick();
    await personPanel(w, 'Anna K').get('[data-test="panel-bigger"]').trigger('click');
    await w.vm.$nextTick();
    expect(panel.biggerViewId).toBe('p-1');
  });
});

function mountMobileRail() {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }));
  return mount(PanelRail, { props: { people }, global: { plugins: [i18n] } });
}

describe('PanelRail (mobile)', () => {
  it('renders the ← arrow in chips mode and toggles to rectangles', async () => {
    const w = mountMobileRail();
    const panel = usePanelStore();
    panel.openPerson('p-1');     // sets rectangles
    panel.collapseRail();        // back to chips
    await w.vm.$nextTick();
    const arrow = w.get('[data-test="rail-arrow"]');
    expect(arrow.text()).toContain('←');
    await arrow.trigger('click');
    expect(panel.railMode).toBe('rectangles');
    expect(panel.expandedId).toBeNull();
  });

  it('renders person chips in chips mode and a chip tap expands that person', async () => {
    const w = mountMobileRail();
    const panel = usePanelStore();
    panel.openPerson('p-1');
    panel.collapseRail();
    await w.vm.$nextTick();
    const chips = w.findAll('[data-test="panel-chip"]');
    expect(chips.length).toBeGreaterThanOrEqual(2); // stats chip + person chip
    // tap the person chip (scoped to the Anna K DockPanel — order-independent)
    await personPanel(w, 'Anna K').get('[data-test="panel-chip"]').trigger('click');
    expect(panel.railMode).toBe('rectangles');
    expect(panel.expandedId).toBe('p-1');
  });

  it('shows the → arrow in rectangles mode and collapses to chips', async () => {
    const w = mountMobileRail();
    const panel = usePanelStore();
    panel.expandRail();
    await w.vm.$nextTick();
    const arrow = w.get('[data-test="rail-arrow"]');
    expect(arrow.text()).toContain('→');
    await arrow.trigger('click');
    expect(panel.railMode).toBe('chips');
  });
});
