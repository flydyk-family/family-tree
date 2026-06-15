import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PersonDossier from './PersonDossier.vue';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonDetail } from '../types/family';

const base: PersonDetail = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: null, en: 'Tadeusz' },
  surname: { ru: 'Ковальский', be: null, en: 'Kowalski' },
  maidenName: null, sex: 'male',
  birth: { year: 1962, month: null, day: null, approx: false, place: null },
  death: null, vocation: 'teacher',
  summary: { ru: null, be: null, en: 'A history teacher.' },
  biography: { ru: null, be: null, en: 'A longer biography.' },
  portrait: null, portraitVideo: null, gallery: [],
  links: [{ type: 'facebook', url: 'https://facebook.com/example' }],
  residences: [{ place: { ru: null, be: null, en: 'Warsaw' }, fromYear: 1962, toYear: null, mapUrl: 'https://maps.google.com/?q=Warszawa' }],
  parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true
};

function mountWith(detail: PersonDetail) {
  return mount(PersonDossier, {
    props: { detail },
    global: { plugins: [i18n], stubs: { teleport: true } }
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
});

describe('PersonDossier', () => {
  it('renders the summary, biography, residences and links', () => {
    const w = mountWith(base);
    expect(w.text()).toContain('A history teacher.');
    expect(w.find('[data-test="pager-page"]').text()).toContain('A longer biography.');
    expect(w.find('[data-test="residences"]').text()).toContain('Warsaw');
    expect(w.find('[data-test="links"]').find('a').text()).toContain('Facebook');
  });

  it('omits the biography block when there is no biography', () => {
    const w = mountWith({ ...base, biography: { ru: null, be: null, en: null } });
    expect(w.find('[data-test="biography"]').exists()).toBe(false);
  });

  it('omits residences and links when empty', () => {
    const w = mountWith({ ...base, residences: [], links: [] });
    expect(w.find('[data-test="residences"]').exists()).toBe(false);
    expect(w.find('[data-test="links"]').exists()).toBe(false);
  });

  it('shows an open-ended residence as "{from}–present" and a closed one as a range', () => {
    const w = mountWith({
      ...base,
      residences: [
        { place: { ru: null, be: null, en: 'Warsaw' }, fromYear: 1962, toYear: null, mapUrl: null },
        { place: { ru: null, be: null, en: 'Kraków' }, fromYear: 1980, toYear: 1990, mapUrl: null }
      ]
    });
    const rows = w.find('[data-test="residences"]').text();
    expect(rows).toContain('1962–present');
    expect(rows).toContain('1980–1990');
    // No map link rendered when mapUrl is null.
    expect(w.find('.dossier__map').exists()).toBe(false);
  });

  it('renders empty year text for a residence with no years', () => {
    const w = mountWith({
      ...base,
      residences: [{ place: { ru: null, be: null, en: 'Unknown' }, fromYear: null, toYear: null, mapUrl: null }]
    });
    expect(w.find('[data-test="residences"]').text()).toContain('Unknown');
    expect(w.find('.dossier__years').text()).toBe('');
  });

  it('falls back to the raw type for an unknown social link', () => {
    const w = mountWith({ ...base, links: [{ type: 'myspace', url: 'https://myspace.com/x' }] });
    expect(w.find('[data-test="links"]').find('a').text()).toBe('myspace');
  });
});
