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
import PhotoManager from './PhotoManager.vue';
import type { PersonDetail } from '../types/family';

const detail: PersonDetail = {
  id: 'p-0001',
  givenName: { ru: null, be: null, en: 'A' },
  surname: { ru: null, be: null, en: 'B' },
  maidenName: null,
  sex: 'M',
  birth: { year: null, month: null, day: null, approx: false, place: null },
  death: null,
  vocation: '',
  summary: null,
  biography: null,
  portrait: null,
  portraitThumb: null,
  portraitVideo: null,
  gallery: [],
  links: [],
  residences: [],
  parents: { motherId: null, fatherId: null },
  marriedIntoFamily: false,
  isDefaultRoot: false
};

const detailWithGallery: PersonDetail = {
  ...detail,
  gallery: [
    { id: 'h2', full: 'uploads/p-0001/h2.webp', thumb: 'uploads/p-0001/h2.thumb.webp' }
  ]
};

function mountManager(props: { detail: PersonDetail } = { detail }) {
  return mount(PhotoManager, {
    props,
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

describe('PhotoManager', () => {
  it('uploads a chosen file as a gallery photo and emits the updated detail', async () => {
    const updated = { ...detail, gallery: [{ id: 'h2', full: 'uploads/p-0001/h2.webp', thumb: 'uploads/p-0001/h2.thumb.webp' }] };
    const spy = vi.spyOn(photosApi, 'uploadPhoto').mockResolvedValue(updated);
    const wrapper = mountManager();

    const file = new File([new Uint8Array([1, 2, 3])], 'x.png', { type: 'image/png' });
    const input = wrapper.get('[data-test="gallery-input"]');
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    await flushPromises();

    expect(spy).toHaveBeenCalledWith('p-0001', file, 'gallery');
    expect(wrapper.emitted('updated')?.[0]?.[0]).toEqual(updated);
  });

  it('shows an error and keeps the UI when upload fails', async () => {
    vi.spyOn(photosApi, 'uploadPhoto').mockRejectedValue(new Error('403'));
    const wrapper = mountManager();
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    const input = wrapper.get('[data-test="portrait-input"]');
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    await flushPromises();

    expect(wrapper.get('[data-test="photo-error"]').isVisible()).toBe(true);
    // The UI is still present
    expect(wrapper.find('[data-test="portrait-input"]').exists()).toBe(true);
  });

  it('promotes a gallery photo to portrait and emits the updated detail', async () => {
    const updated = { ...detailWithGallery, portrait: 'uploads/p-0001/h2.webp' };
    const spy = vi.spyOn(photosApi, 'promoteGalleryPhoto').mockResolvedValue(updated);
    const wrapper = mountManager({ detail: detailWithGallery });

    await wrapper.get('[data-test="gallery-promote-h2"]').trigger('click');
    await flushPromises();

    expect(spy).toHaveBeenCalledWith('p-0001', 'h2');
    expect(wrapper.emitted('updated')?.[0]?.[0]).toEqual(updated);
  });

  it('deletes a gallery photo after inline confirmation and emits the updated detail', async () => {
    const updated = { ...detailWithGallery, gallery: [] };
    const spy = vi.spyOn(photosApi, 'deleteGalleryPhoto').mockResolvedValue(updated);
    const wrapper = mountManager({ detail: detailWithGallery });

    // First click opens the confirm step
    await wrapper.get('[data-test="gallery-delete-h2"]').trigger('click');
    // Second click (confirm) executes deletion
    await wrapper.get('[data-test="gallery-delete-confirm-h2"]').trigger('click');
    await flushPromises();

    expect(spy).toHaveBeenCalledWith('p-0001', 'h2');
    expect(wrapper.emitted('updated')?.[0]?.[0]).toEqual(updated);
  });
});
