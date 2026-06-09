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
  portrait: null, gallery: [],
  links: [], residences: [],
  parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true
} as unknown as PersonDetail;

function mountModal() {
  useSelectionStore().$patch({ selectedId: tadeusz.id, detail: tadeusz, mode: 'normal', loading: false, error: null });
  usePanelStore().openBiggerView(tadeusz.id);
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

  it('clears bigger view when the close control is clicked', async () => {
    const w = mountModal();
    await w.find('[data-test="close"]').trigger('click');
    expect(usePanelStore().biggerViewId).toBeNull();
  });

  it('clears bigger view on scrim click and Escape', async () => {
    const w = mountModal();
    await w.find('[data-test="scrim"]').trigger('click');
    expect(usePanelStore().biggerViewId).toBeNull();

    usePanelStore().openBiggerView(tadeusz.id);
    await w.find('[data-test="dialog"]').trigger('keydown.esc');
    expect(usePanelStore().biggerViewId).toBeNull();
  });
});
