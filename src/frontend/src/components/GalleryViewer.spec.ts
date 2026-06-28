import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import GalleryViewer from './GalleryViewer.vue';

const photos = [
  { id: 'h1', full: 'uploads/p-0001/h1.webp', thumb: 'uploads/p-0001/h1.thumb.webp' },
  { id: 'h2', full: 'uploads/p-0001/h2.webp', thumb: 'uploads/p-0001/h2.thumb.webp' },
];

describe('GalleryViewer', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders a thumbnail per photo using the thumb key', () => {
    const wrapper = mount(GalleryViewer, {
      props: { photos, name: 'A B' },
      global: { plugins: [i18n], stubs: { teleport: true } }
    });
    const imgs = wrapper.findAll('[data-test="gallery-thumb"]');
    expect(imgs).toHaveLength(2);
    expect(imgs[0].attributes('src')).toBe('/media/uploads/p-0001/h1.thumb.webp');
    expect(imgs[1].attributes('src')).toBe('/media/uploads/p-0001/h2.thumb.webp');
  });

  it('renders nothing when photos are empty', () => {
    const wrapper = mount(GalleryViewer, {
      props: { photos: [], name: 'A B' },
      global: { plugins: [i18n], stubs: { teleport: true } }
    });
    expect(wrapper.find('[data-test="gallery-thumb"]').exists()).toBe(false);
  });

  it('opens MediaLightbox with initialIndex=1 when the 2nd thumbnail is clicked', async () => {
    const MediaLightboxStub = { template: '<div />', props: ['items', 'name', 'initialIndex'] };
    const wrapper = mount(GalleryViewer, {
      props: { photos, name: 'A B' },
      global: { plugins: [i18n], stubs: { teleport: true, MediaLightbox: MediaLightboxStub } }
    });

    const thumbBtns = wrapper.findAll('.gallery-viewer__thumb-btn');
    await thumbBtns[1].trigger('click');

    const lightbox = wrapper.findComponent(MediaLightboxStub);
    expect(lightbox.exists()).toBe(true);
    expect(lightbox.props('initialIndex')).toBe(1);
  });
});
