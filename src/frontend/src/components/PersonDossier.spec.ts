import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PersonDossier from './PersonDossier.vue';
import { useLocaleStore } from '../stores/localeStore';
import { useAuthStore } from '../stores/authStore';
import { useSelectionStore } from '../stores/selectionStore';
import BiographyEditor from './BiographyEditor.vue';
import PersonPhotos from './PersonPhotos.vue';
import type { PersonDetail } from '../types/family';

vi.mock('../api/photosApi', () => ({
  uploadPhoto: vi.fn(),
  deletePortrait: vi.fn(),
  deleteGalleryPhoto: vi.fn(),
  promoteGalleryPhoto: vi.fn(),
  suppressSeed: vi.fn()
}));

const base: PersonDetail = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: null, en: 'Tadeusz' },
  surname: { ru: 'Ковальский', be: null, en: 'Kowalski' },
  maidenName: null, middleName: null, sex: 'male',
  birth: { year: 1962, month: null, day: null, approx: false, place: null },
  death: null, vocation: 'teacher',
  summary: { ru: null, be: null, en: 'A history teacher.' },
  biography: { ru: null, be: null, en: 'A longer biography.' },
  portrait: null, portraitVideo: null, gallery: [],
  links: [{ type: 'facebook', url: 'https://facebook.com/example' }],
  residences: [{ place: { ru: null, be: null, en: 'Warsaw' }, fromYear: 1962, toYear: null, mapUrl: 'https://maps.google.com/?q=Warszawa', lat: null, lng: null }],
  parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: true
};

function mountWith(detail: PersonDetail) {
  return mount(PersonDossier, {
    props: { detail },
    global: { plugins: [i18n], stubs: { teleport: true } }
  });
}

function mountEditable(detail: PersonDetail, canEdit = true) {
  useAuthStore().canEdit = canEdit;
  return mount(PersonDossier, {
    props: { detail, editable: true },
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
        { place: { ru: null, be: null, en: 'Warsaw' }, fromYear: 1962, toYear: null, mapUrl: null, lat: null, lng: null },
        { place: { ru: null, be: null, en: 'Kraków' }, fromYear: 1980, toYear: 1990, mapUrl: null, lat: null, lng: null }
      ]
    });
    const rows = w.find('[data-test="residences"]').text();
    expect(rows).toContain('1962–present');
    expect(rows).toContain('1980–1990');
    // No map link rendered when mapUrl is null.
    expect(w.find('.dossier__map').exists()).toBe(false);
  });

  it('links a coordinate-bearing residence straight to its point (not the ambiguous name)', () => {
    const w = mountWith({
      ...base,
      residences: [
        { place: { ru: null, be: null, en: 'Kraków' }, fromYear: 1980, toYear: null, mapUrl: 'https://www.google.com/maps/search/?api=1&query=50.06%2C19.94', lat: 50.06, lng: 19.94 }
      ]
    });
    expect(w.find('.dossier__map').attributes('href')).toBe(
      'https://www.google.com/maps/place/50.06,19.94/@50.06,19.94,13z'
    );
  });

  it('links a residence with only a name to a Maps name search', () => {
    const w = mountWith({
      ...base,
      residences: [
        { place: { ru: null, be: null, en: 'Warsaw' }, fromYear: 1962, toYear: null, mapUrl: 'https://maps.google.com/?q=Warszawa', lat: null, lng: null }
      ]
    });
    expect(w.find('.dossier__map').attributes('href')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Warsaw'
    );
  });

  it('renders empty year text for a residence with no years', () => {
    const w = mountWith({
      ...base,
      residences: [{ place: { ru: null, be: null, en: 'Unknown' }, fromYear: null, toYear: null, mapUrl: null, lat: null, lng: null }]
    });
    expect(w.find('[data-test="residences"]').text()).toContain('Unknown');
    expect(w.find('.dossier__years').text()).toBe('');
  });

  it('falls back to the raw type for an unknown social link', () => {
    const w = mountWith({ ...base, links: [{ type: 'myspace', url: 'https://myspace.com/x' }] });
    expect(w.find('[data-test="links"]').find('a').text()).toBe('myspace');
  });

  it('shows the edit button for an editor in editable mode', () => {
    const w = mountEditable(base, true);
    expect(w.find('[data-test="bio-edit"]').exists()).toBe(true);
  });

  it('hides the edit button when not editable, even for an editor', () => {
    useAuthStore().canEdit = true;
    const w = mountWith(base); // editable defaults to false
    expect(w.find('[data-test="bio-edit"]').exists()).toBe(false);
  });

  it('hides the edit button for a non-editor in editable mode', () => {
    const w = mountEditable(base, false);
    expect(w.find('[data-test="bio-edit"]').exists()).toBe(false);
  });

  it('shows an add affordance and empty text for an editor when the biography is empty', () => {
    const w = mountEditable({ ...base, biography: { ru: null, be: null, en: null } }, true);
    expect(w.find('[data-test="biography"]').exists()).toBe(true);
    expect(w.find('[data-test="bio-edit"]').attributes('aria-label')).toBe('Add biography');
    expect(w.find('.dossier__empty').text()).toContain('No biography yet.');
  });

  it('opens the inline editor when the edit button is clicked', async () => {
    const w = mountEditable(base, true);
    await w.find('[data-test="bio-edit"]').trigger('click');
    expect(w.find('[data-test="bio-input"]').exists()).toBe(true);
    expect(w.find('[data-test="bio-edit"]').exists()).toBe(false);
  });

  it('applies a saved detail to the selection store and exits edit mode', async () => {
    const w = mountEditable(base, true);
    await w.find('[data-test="bio-edit"]').trigger('click');

    const next = { ...base, biography: { ru: null, be: null, en: 'Updated.' } } as PersonDetail;
    w.findComponent(BiographyEditor).vm.$emit('saved', next);
    await w.vm.$nextTick();

    expect(useSelectionStore().cache['p-0016']).toEqual(next);
    expect(w.find('[data-test="bio-input"]').exists()).toBe(false);
  });

  it('exits edit mode on cancel without writing to the store', async () => {
    const w = mountEditable(base, true);
    await w.find('[data-test="bio-edit"]').trigger('click');

    w.findComponent(BiographyEditor).vm.$emit('cancel');
    await w.vm.$nextTick();

    expect(w.find('[data-test="bio-input"]').exists()).toBe(false);
    expect(useSelectionStore().cache['p-0016']).toBeUndefined();
  });

  it('closes the editor when the panel is reused for a different person', async () => {
    const w = mountEditable(base, true);
    await w.find('[data-test="bio-edit"]').trigger('click');
    expect(w.find('[data-test="bio-input"]').exists()).toBe(true);

    await w.setProps({ detail: { ...base, id: 'p-9999' } });
    expect(w.find('[data-test="bio-input"]').exists()).toBe(false);
  });

  it('renders the unified photo grid when the detail has photos', () => {
    // Two tiles (portrait + gallery) so the read-only grid shows — a lone portrait
    // tile is hidden in read-only contexts (it is already in the header).
    const withGallery: PersonDetail = {
      ...base,
      portrait: 'uploads/p-0016/p.webp',
      portraitThumb: 'uploads/p-0016/p.thumb.webp',
      gallery: [{ id: 'h2', full: 'uploads/p-0016/h2.webp', thumb: 'uploads/p-0016/h2.thumb.webp' }]
    };
    const w = mountWith(withGallery);
    expect(w.find('[data-test="photo-open-0"]').exists()).toBe(true);
  });

  it('does not render the photo grid for a visitor with no photos', () => {
    const w = mountWith(base); // base has no portrait and no gallery
    expect(w.find('[data-test="person-photos"]').exists()).toBe(false);
  });

  it('shows photo edit affordances only when editable and canEdit', () => {
    const withGallery: PersonDetail = {
      ...base,
      gallery: [{ id: 'h2', full: 'uploads/p-0016/h2.webp', thumb: 'uploads/p-0016/h2.thumb.webp' }]
    };
    const wGuest = mountWith(withGallery);
    expect(wGuest.find('[data-test="photo-add-input"]').exists()).toBe(false);

    const wEditor = mountEditable(withGallery, true);
    expect(wEditor.find('[data-test="photo-add-input"]').exists()).toBe(true);

    const wNonEditor = mountEditable(withGallery, false);
    expect(wNonEditor.find('[data-test="photo-add-input"]').exists()).toBe(false);
  });

  it('applies an updated detail from PersonPhotos to the selection store', async () => {
    const selection = useSelectionStore();
    selection.selectedId = base.id;
    selection.detail = base;

    const w = mountEditable(base, true);
    const next: PersonDetail = {
      ...base,
      gallery: [{ id: 'h2', full: 'uploads/p-0016/h2.webp', thumb: 'uploads/p-0016/h2.thumb.webp' }]
    };
    w.findComponent(PersonPhotos).vm.$emit('updated', next);
    await w.vm.$nextTick();

    expect(selection.cache['p-0016']).toEqual(next);
    expect(selection.detail).toEqual(next);
  });
});
