import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../i18n';
import MediaLightbox from './MediaLightbox.vue';
import type { MediaItem } from '../media/types';

const clip: MediaItem = { kind: 'video', src: '/media/portraits/p-0016.mp4', poster: '/media/portraits/p-0016.jpg' };
const still: MediaItem = { kind: 'image', src: '/media/portraits/p-0016.jpg' };

function mountBox(items: MediaItem[]) {
  return mount(MediaLightbox, {
    props: { items, name: 'Tadeusz Kowalski' },
    global: { plugins: [i18n] }
  });
}

describe('MediaLightbox', () => {
  it('opens on the first item (the living portrait) with poster and loop attributes', () => {
    const w = mountBox([clip, still]);
    const video = w.find('[data-test="lightbox-video"]');
    expect(video.exists()).toBe(true);
    expect(video.attributes('src')).toBe(clip.src);
    expect(video.attributes('poster')).toBe(clip.poster);
    expect(video.attributes()).toHaveProperty('loop');
  });

  it('is a labelled modal dialog', () => {
    const w = mountBox([still]);
    const dialog = w.find('[data-test="media-lightbox"]');
    expect(dialog.attributes('role')).toBe('dialog');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-label')).toContain('Tadeusz');
  });

  it('navigates between clip and still with the arrow buttons, wrapping', async () => {
    const w = mountBox([clip, still]);
    await w.find('[data-test="lightbox-next"]').trigger('click');
    expect(w.find('[data-test="lightbox-image"]').exists()).toBe(true);
    await w.find('[data-test="lightbox-next"]').trigger('click');
    expect(w.find('[data-test="lightbox-video"]').exists()).toBe(true);
    await w.find('[data-test="lightbox-prev"]').trigger('click');
    expect(w.find('[data-test="lightbox-image"]').exists()).toBe(true);
  });

  it('navigates with the arrow keys', async () => {
    const w = mountBox([clip, still]);
    await w.find('[data-test="media-lightbox"]').trigger('keydown', { key: 'ArrowRight' });
    expect(w.find('[data-test="lightbox-image"]').exists()).toBe(true);
    await w.find('[data-test="media-lightbox"]').trigger('keydown', { key: 'ArrowLeft' });
    expect(w.find('[data-test="lightbox-video"]').exists()).toBe(true);
  });

  it('hides arrows and dots for a single item, and arrow keys do nothing', async () => {
    const w = mountBox([still]);
    expect(w.find('[data-test="lightbox-prev"]').exists()).toBe(false);
    expect(w.find('[data-test="lightbox-next"]').exists()).toBe(false);
    expect(w.find('[data-test="lightbox-dots"]').exists()).toBe(false);
    await w.find('[data-test="media-lightbox"]').trigger('keydown', { key: 'ArrowRight' });
    expect(w.find('[data-test="lightbox-image"]').exists()).toBe(true);
  });

  it('emits close on Esc, backdrop click, and the close button', async () => {
    const w = mountBox([clip, still]);
    await w.find('[data-test="media-lightbox"]').trigger('keydown', { key: 'Escape' });
    await w.find('[data-test="lightbox-scrim"]').trigger('click');
    await w.find('[data-test="lightbox-close"]').trigger('click');
    expect(w.emitted('close')).toHaveLength(3);
  });

  it('falls back from a failing video to the still instead of closing', async () => {
    const w = mountBox([clip, still]);
    await w.find('[data-test="lightbox-video"]').trigger('error');
    expect(w.find('[data-test="lightbox-image"]').exists()).toBe(true);
    expect(w.emitted('close')).toBeUndefined();
  });

  it('closes when the only item fails to load', async () => {
    const w = mountBox([still]);
    await w.find('[data-test="lightbox-image"]').trigger('error');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('clamps the index when the items list shrinks while open', async () => {
    const w = mountBox([clip, still]);
    await w.find('[data-test="lightbox-next"]').trigger('click');
    expect(w.find('[data-test="lightbox-image"]').exists()).toBe(true);
    await w.setProps({ items: [still] });
    expect(w.find('[data-test="lightbox-image"]').exists()).toBe(true);
  });
});
