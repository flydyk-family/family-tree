import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PersonPopup from './PersonPopup.vue';
import { useSelectionStore } from '../stores/selectionStore';
import { usePanelStore } from '../stores/panelStore';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonDetail } from '../types/family';

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
  useSelectionStore().$patch({ selectedId: tadeusz.id, detail: tadeusz, loading: false, error: null });
  panel.openBiggerView(tadeusz.id);
  return mount(PersonPopup, { global: { plugins: [i18n], stubs: { teleport: true } } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
});

describe('PersonPopup (bigger-view modal)', () => {
  it('renders a dialog with the person content', () => {
    const w = mountModal();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    expect(w.text()).toContain('Tadeusz');
  });

  it('pins the header outside the scrolling body', () => {
    const w = mountModal();
    expect(w.find('[data-test="dialog"] > [data-test="person-header"]').exists()).toBe(true);
    expect(w.find('[data-test="cs-view"] [data-test="person-header"]').exists()).toBe(false);
  });

  it('puts the dossier inside the ChronicleScroll body', () => {
    const w = mountModal();
    expect(w.find('[data-test="chronicle-scroll"] [data-test="person-dossier"]').exists()).toBe(true);
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

  it('shows a loading status while the detail is being fetched', () => {
    const panel = usePanelStore();
    panel.openPerson(tadeusz.id);
    useSelectionStore().$patch({ selectedId: tadeusz.id, detail: null, loading: true, error: null });
    panel.openBiggerView(tadeusz.id);
    const w = mount(PersonPopup, { global: { plugins: [i18n], stubs: { teleport: true } } });
    expect(w.find('[data-test="person-header"]').exists()).toBe(false);
    expect(w.find('.popup__status').exists()).toBe(true);
  });

  it('shows an error status when the fetch failed', () => {
    const panel = usePanelStore();
    panel.openPerson(tadeusz.id);
    useSelectionStore().$patch({ selectedId: tadeusz.id, detail: null, loading: false, error: 'boom' });
    panel.openBiggerView(tadeusz.id);
    const w = mount(PersonPopup, { global: { plugins: [i18n], stubs: { teleport: true } } });
    expect(w.find('.popup__status--error').exists()).toBe(true);
    expect(w.find('[data-test="chronicle-scroll"]').exists()).toBe(false);
  });
});
