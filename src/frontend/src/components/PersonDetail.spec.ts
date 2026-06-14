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
  store.$patch({ selectedId: detail.id, detail, loading: false, error: null });
  return mount(PersonDetail, {
    attachTo: document.body,
    global: { plugins: [i18n], stubs: { teleport: true } }
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
});

describe('PersonDetail', () => {
  it('renders the header and the dossier', () => {
    const w = mountWith(tadeusz);
    expect(w.find('[data-test="person-header"]').exists()).toBe(true);
    expect(w.find('[data-test="person-dossier"]').exists()).toBe(true);
    expect(w.text()).toContain('Tadeusz');
  });

  it('always shows biography, residences and links (no More/Less gate)', () => {
    const w = mountWith(tadeusz);
    expect(w.find('[data-test="pager-page"]').text()).toContain('A longer biography.');
    expect(w.find('[data-test="residences"]').text()).toContain('Warsaw');
    expect(w.find('[data-test="links"]').find('a').text()).toContain('Facebook');
    expect(w.find('[data-test="expand"]').exists()).toBe(false);
    expect(w.find('[data-test="collapse"]').exists()).toBe(false);
  });

  it('shows the loading state', () => {
    const store = useSelectionStore();
    store.$patch({ loading: true, detail: null, error: null });
    const w = mount(PersonDetail, { global: { plugins: [i18n] } });
    expect(w.find('.detail__status').text()).toContain('Loading');
  });

  it('shows the error state', () => {
    const store = useSelectionStore();
    store.$patch({ error: 'boom', detail: null, loading: false });
    const w = mount(PersonDetail, { global: { plugins: [i18n] } });
    expect(w.find('.detail__status--error').exists()).toBe(true);
  });
});
