import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';

vi.mock('../api/photosApi', () => ({
  uploadPhoto: vi.fn(),
  deletePortrait: vi.fn(),
  deleteGalleryPhoto: vi.fn(),
  promoteGalleryPhoto: vi.fn()
}));

import * as photosApi from '../api/photosApi';
import PersonPhotos from './PersonPhotos.vue';
import MediaLightbox from './MediaLightbox.vue';
import type { PersonDetail } from '../types/family';

const empty: PersonDetail = {
  id: 'p-0001',
  givenName: { ru: null, be: null, en: 'A' },
  surname: { ru: null, be: null, en: 'B' },
  maidenName: null, sex: 'M',
  birth: { year: null, month: null, day: null, approx: false, place: null },
  death: null, vocation: '', summary: null, biography: null,
  portrait: null, portraitThumb: null, portraitVideo: null,
  gallery: [], links: [], residences: [],
  parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false
};
const gphoto = { id: 'h2', full: 'uploads/p-0001/h2.webp', thumb: 'uploads/p-0001/h2.thumb.webp' };
const withGallery: PersonDetail = { ...empty, gallery: [gphoto] };
const uploadedPortrait: PersonDetail = {
  ...empty, portrait: 'uploads/p-0001/h1.webp', portraitThumb: 'uploads/p-0001/h1.thumb.webp', gallery: [gphoto]
};
const seedPortrait: PersonDetail = { ...empty, portrait: 'p-0001.jpg' };

function mountPhotos(detail: PersonDetail, canEdit: boolean) {
  return mount(PersonPhotos, {
    props: { detail, canEdit, name: 'A B' },
    global: { plugins: [i18n], stubs: { teleport: true } }
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(photosApi.uploadPhoto).mockReset();
  vi.mocked(photosApi.deletePortrait).mockReset();
  vi.mocked(photosApi.deleteGalleryPhoto).mockReset();
  vi.mocked(photosApi.promoteGalleryPhoto).mockReset();
});

describe('PersonPhotos', () => {
  it('renders the portrait first then gallery, with a Portrait badge on the first tile', () => {
    const w = mountPhotos(uploadedPortrait, true);
    const tiles = w.findAll('.person-photos__tile');
    expect(w.find('[data-test="photo-open-0"]').exists()).toBe(true);
    expect(w.find('[data-test="photo-open-1"]').exists()).toBe(true);
    expect(tiles[0].find('[data-test="portrait-badge"]').exists()).toBe(true);
  });

  it('sets a gallery photo as portrait via promote and emits updated', async () => {
    const updated = { ...uploadedPortrait, portrait: 'uploads/p-0001/h2.webp' };
    const spy = vi.spyOn(photosApi, 'promoteGalleryPhoto').mockResolvedValue(updated);
    const w = mountPhotos(uploadedPortrait, true);

    await w.get('[data-test="set-portrait-h2"]').trigger('click');
    await flushPromises();

    expect(spy).toHaveBeenCalledWith('p-0001', 'h2');
    expect(w.emitted('updated')?.[0]?.[0]).toEqual(updated);
  });

  it('removes a gallery photo after inline confirm via deleteGalleryPhoto', async () => {
    const updated = { ...uploadedPortrait, gallery: [] };
    const spy = vi.spyOn(photosApi, 'deleteGalleryPhoto').mockResolvedValue(updated);
    const w = mountPhotos(uploadedPortrait, true);

    await w.get('[data-test="remove-h2"]').trigger('click');
    await w.get('[data-test="remove-confirm-h2"]').trigger('click');
    await flushPromises();

    expect(spy).toHaveBeenCalledWith('p-0001', 'h2');
    expect(w.emitted('updated')?.[0]?.[0]).toEqual(updated);
  });

  it('removes an uploaded portrait via deletePortrait', async () => {
    const updated = { ...uploadedPortrait, portrait: null, portraitThumb: null };
    const spy = vi.spyOn(photosApi, 'deletePortrait').mockResolvedValue(updated);
    const w = mountPhotos(uploadedPortrait, true);

    await w.get('[data-test="remove-portrait"]').trigger('click');
    await w.get('[data-test="remove-confirm-portrait"]').trigger('click');
    await flushPromises();

    expect(spy).toHaveBeenCalledWith('p-0001');
  });

  it('shows the Portrait badge but no remove for a seed portrait', () => {
    const w = mountPhotos(seedPortrait, true);
    expect(w.find('[data-test="portrait-badge"]').exists()).toBe(true);
    expect(w.find('[data-test="remove-portrait"]').exists()).toBe(false);
  });

  it('uploads as portrait when there is no portrait, as gallery when there is', async () => {
    vi.spyOn(photosApi, 'uploadPhoto').mockResolvedValue(empty);
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });

    const wEmpty = mountPhotos(empty, true);
    const i1 = wEmpty.get('[data-test="photo-add-input"]');
    Object.defineProperty(i1.element, 'files', { value: [file] });
    await i1.trigger('change');
    await flushPromises();
    expect(photosApi.uploadPhoto).toHaveBeenCalledWith('p-0001', file, 'portrait');

    vi.mocked(photosApi.uploadPhoto).mockClear();
    const wPortrait = mountPhotos(uploadedPortrait, true);
    const i2 = wPortrait.get('[data-test="photo-add-input"]');
    Object.defineProperty(i2.element, 'files', { value: [file] });
    await i2.trigger('change');
    await flushPromises();
    expect(photosApi.uploadPhoto).toHaveBeenCalledWith('p-0001', file, 'gallery');
  });

  it('shows an error and keeps the grid when an upload fails', async () => {
    vi.spyOn(photosApi, 'uploadPhoto').mockRejectedValue(new Error('403'));
    const w = mountPhotos(empty, true);
    const input = w.get('[data-test="photo-add-input"]');
    Object.defineProperty(input.element, 'files', { value: [new File([new Uint8Array([1])], 'x.png', { type: 'image/png' })] });
    await input.trigger('change');
    await flushPromises();
    expect(w.get('[data-test="photo-error"]').isVisible()).toBe(true);
    expect(w.find('[data-test="photo-add-input"]').exists()).toBe(true);
  });

  it('is read-only for visitors: no actions or add tile, and nothing at all when empty', () => {
    const wGallery = mountPhotos(withGallery, false);
    expect(wGallery.find('[data-test="photo-open-0"]').exists()).toBe(true);
    expect(wGallery.find('[data-test="set-portrait-h2"]').exists()).toBe(false);
    expect(wGallery.find('[data-test="photo-add-input"]').exists()).toBe(false);

    const wEmpty = mountPhotos(empty, false);
    expect(wEmpty.find('[data-test="person-photos"]').exists()).toBe(false);
  });

  it('opens the lightbox at the clicked photo index', async () => {
    const w = mountPhotos(uploadedPortrait, false);
    await w.get('[data-test="photo-open-1"]').trigger('click');
    const lb = w.findComponent(MediaLightbox);
    expect(lb.exists()).toBe(true);
    expect(lb.props('initialIndex')).toBe(1);
  });
});
