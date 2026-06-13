import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PersonPopup from './PersonPopup.vue';
import { useSelectionStore } from '../stores/selectionStore';
import { usePanelStore } from '../stores/panelStore';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonDetail } from '../types/family';

// Prevent GSAP / Flip from running in jsdom — useDockMorph calls captureDockMorph
// which touches Flip.getState; a no-op stub is enough since tests assert store state.
vi.mock('../motion/popupDock', () => ({
  captureDockMorph: vi.fn(() => ({ play: vi.fn(() => null) })),
}));

const tadeusz = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: 'Тадэвуш', en: 'Tadeusz' },
  surname: { ru: 'Ковальский', be: 'Кавальскі', en: 'Kowalski' },
  maidenName: null, sex: 'male',
  birth: { year: 1962, month: 4, day: null, approx: false, place: { ru: 'Варшава', be: null, en: 'Warsaw' } },
  death: null, vocation: 'teacher',
  summary: { ru: 'Учитель истории.', be: null, en: 'A history teacher.' },
  biography: { ru: 'Длинная.', be: null, en: 'A longer biography.' },
  portrait: null, portraitVideo: null, gallery: [],
  links: [], residences: [],
  parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true
} as unknown as PersonDetail;

function mountModal() {
  const panel = usePanelStore();
  panel.openPerson(tadeusz.id);
  useSelectionStore().$patch({ selectedId: tadeusz.id, detail: tadeusz, mode: 'normal', loading: false, error: null });
  panel.openBiggerView(tadeusz.id);
  return mount(PersonPopup, { global: { plugins: [i18n] } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
});

describe('PersonPopup (bigger-view modal)', () => {
  it('renders a dialog with the person content', () => {
    const w = mountModal();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    expect(w.find('[data-test="person-detail"]').exists()).toBe(true);
    expect(w.text()).toContain('Tadeusz');
  });

  it('renders both dock and close buttons', () => {
    const w = mountModal();
    expect(w.find('[data-test="popup-dock"]').exists()).toBe(true);
    expect(w.find('[data-test="close"]').exists()).toBe(true);
  });

  it('dock button clears biggerViewId but keeps the person open in the store', async () => {
    const w = mountModal();
    const panel = usePanelStore();
    expect(panel.biggerViewId).toBe(tadeusz.id);
    await w.find('[data-test="popup-dock"]').trigger('click');
    expect(panel.biggerViewId).toBeNull();
    expect(panel.isOpen(tadeusz.id)).toBe(true);
  });

  it('close button removes the person entirely (closePerson)', async () => {
    const w = mountModal();
    const panel = usePanelStore();
    await w.find('[data-test="close"]').trigger('click');
    expect(panel.isOpen(tadeusz.id)).toBe(false);
    expect(panel.biggerViewId).toBeNull();
  });

  it('scrim click docks (clears biggerViewId, person still open)', async () => {
    const w = mountModal();
    const panel = usePanelStore();
    await w.find('[data-test="scrim"]').trigger('click');
    expect(panel.biggerViewId).toBeNull();
    expect(panel.isOpen(tadeusz.id)).toBe(true);
  });

  it('Escape docks (clears biggerViewId, person still open)', async () => {
    const w = mountModal();
    const panel = usePanelStore();
    await w.find('[data-test="dialog"]').trigger('keydown.esc');
    expect(panel.biggerViewId).toBeNull();
    expect(panel.isOpen(tadeusz.id)).toBe(true);
  });

  // --- New tests for the dock tab redesign (Task 6) ---

  it('tags the dialog with the matching data-flip-id', () => {
    const w = mountModal();
    expect(w.get('[data-test="dialog"]').attributes('data-flip-id')).toBe(`dock-card-${tadeusz.id}`);
  });

  it('renders a right-edge dock tab (not a corner ⤡ button)', () => {
    const w = mountModal();
    expect(w.get('[data-test="popup-dock"]').classes()).toContain('popup__dock-tab');
  });

  it('the dock tab routes through the morph and closes the bigger view', async () => {
    const w = mountModal();
    const panel = usePanelStore();
    await w.get('[data-test="popup-dock"]').trigger('click');
    await nextTick();
    expect(panel.biggerViewId).toBeNull();
  });

  it('the scrim click also docks', async () => {
    const w = mountModal();
    const panel = usePanelStore();
    await w.get('[data-test="scrim"]').trigger('click');
    await nextTick();
    expect(panel.biggerViewId).toBeNull();
  });
});
