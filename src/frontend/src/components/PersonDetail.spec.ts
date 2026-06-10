import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PersonDetail from './PersonDetail.vue';
import { useSelectionStore } from '../stores/selectionStore';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonDetail as PersonDetailType } from '../types/family';

const tadeusz: PersonDetailType = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: 'Тадэвуш', en: 'Tadeusz' },
  surname: { ru: 'Ковальский', be: 'Кавальскі', en: 'Kowalski' },
  maidenName: null, sex: 'male',
  birth: { year: 1962, month: 4, day: null, approx: false, place: { ru: 'Варшава', be: 'Варшава', en: 'Warsaw' } },
  death: null, vocation: 'teacher',
  summary: { ru: 'Учитель истории.', be: null, en: 'A history teacher.' },
  biography: { ru: 'Длинная биография.', be: null, en: 'A longer biography.' },
  portrait: null, portraitVideo: null, gallery: [],
  links: [{ type: 'facebook', url: 'https://facebook.com/example' }],
  residences: [{ place: { ru: 'Варшава', be: null, en: 'Warsaw' }, fromYear: 1962, toYear: null, mapUrl: 'https://maps.google.com/?q=Warszawa' }],
  parents: { motherId: 'p-0014', fatherId: 'p-0013' },
  marriedIntoFamily: false, isDefaultRoot: true
};

function mountWith(detail: PersonDetailType) {
  const store = useSelectionStore();
  store.$patch({ selectedId: detail.id, detail, mode: 'normal', loading: false, error: null });
  return mount(PersonDetail, { global: { plugins: [i18n] } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
});

describe('PersonDetail', () => {
  it('renders name, lifespan, vocation and summary', () => {
    const w = mountWith(tadeusz);
    expect(w.text()).toContain('Tadeusz');
    expect(w.text()).toContain('1962–');
    expect(w.text()).toContain('Teacher');
    expect(w.text()).toContain('A history teacher.');
  });

  it('hides biography/residences/links until expanded', () => {
    const w = mountWith(tadeusz);
    expect(w.find('[data-test="biography"]').exists()).toBe(false);
    useSelectionStore().expand();
    return w.vm.$nextTick().then(() => {
      expect(w.find('[data-test="biography"]').text()).toContain('A longer biography.');
      expect(w.find('[data-test="residences"]').text()).toContain('Warsaw');
      expect(w.find('[data-test="links"]').find('a').text()).toContain('Facebook');
    });
  });

  it('expands and collapses via the More/Less control', async () => {
    const w = mountWith(tadeusz);
    await w.find('[data-test="expand"]').trigger('click');
    expect(useSelectionStore().mode).toBe('expanded');
    await w.find('[data-test="collapse"]').trigger('click');
    expect(useSelectionStore().mode).toBe('normal');
  });

  it('shows the initial when there is no portrait', () => {
    const w = mountWith(tadeusz);
    expect(w.find('[data-test="portrait-fallback"]').text()).toBe('T');
  });

  it('renders the vocation motif with its data attribute', () => {
    const w = mountWith(tadeusz);
    const icon = w.find('[data-test="vocation-icon"]');
    expect(icon.exists()).toBe(true);
    expect(icon.attributes('data-vocation')).toBe('teacher');
  });

  it('hides the vocation row when there is no vocation', () => {
    const w = mountWith({ ...tadeusz, vocation: '' });
    expect(w.find('.detail__vocation').exists()).toBe(false);
  });

  it('re-localizes the name when the active locale changes', async () => {
    const w = mountWith(tadeusz);
    expect(w.text()).toContain('Tadeusz');
    useLocaleStore().setLocale('ru');
    await w.vm.$nextTick();
    expect(w.text()).toContain('Тадеуш');
  });

  it('shows the loading state', async () => {
    const store = useSelectionStore();
    store.$patch({ loading: true, detail: null, error: null });
    const w = mount(PersonDetail, { global: { plugins: [i18n] } });
    expect(w.find('.detail__status').exists()).toBe(true);
    expect(w.find('.detail__status').text()).toContain('Loading');
  });

  it('shows the error state', async () => {
    const store = useSelectionStore();
    store.$patch({ error: 'boom', detail: null, loading: false });
    const w = mount(PersonDetail, { global: { plugins: [i18n] } });
    expect(w.find('.detail__status--error').exists()).toBe(true);
  });
});
