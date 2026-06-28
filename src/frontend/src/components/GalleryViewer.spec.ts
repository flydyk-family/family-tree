import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import GalleryViewer from './GalleryViewer.vue';

const photos = [
  { id: 'h2', full: 'uploads/p-0001/h2.webp', thumb: 'uploads/p-0001/h2.thumb.webp' }
];

describe('GalleryViewer', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders a thumbnail per photo using the thumb key', () => {
    const wrapper = mount(GalleryViewer, {
      props: { photos, name: 'A B' },
      global: { plugins: [i18n], stubs: { teleport: true } }
    });
    const img = wrapper.get('[data-test="gallery-thumb"]');
    expect(img.attributes('src')).toBe('/media/uploads/p-0001/h2.thumb.webp');
  });

  it('renders nothing when photos are empty', () => {
    const wrapper = mount(GalleryViewer, {
      props: { photos: [], name: 'A B' },
      global: { plugins: [i18n], stubs: { teleport: true } }
    });
    expect(wrapper.find('[data-test="gallery-thumb"]').exists()).toBe(false);
  });
});
