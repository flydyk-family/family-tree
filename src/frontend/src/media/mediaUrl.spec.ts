import { describe, it, expect } from 'vitest';
import { mediaUrl } from './mediaUrl';

describe('mediaUrl', () => {
  it('builds a /media URL for a portrait filename', () => {
    expect(mediaUrl('portraits', 'p-0001.jpg')).toBe('/media/portraits/p-0001.jpg');
  });

  it('URL-encodes filenames so spaces and unicode survive', () => {
    expect(mediaUrl('portraits', 'дед мороз.mp4')).toBe(
      '/media/portraits/%D0%B4%D0%B5%D0%B4%20%D0%BC%D0%BE%D1%80%D0%BE%D0%B7.mp4'
    );
  });
});
