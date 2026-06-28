import { describe, it, expect } from 'vitest';
import { mediaUrl, resolveMediaUrl } from './mediaUrl';

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

describe('resolveMediaUrl', () => {
  it('treats a bare filename as a legacy portrait', () => {
    expect(resolveMediaUrl('p-0001.jpg')).toBe('/media/portraits/p-0001.jpg');
  });

  it('treats a value with a slash as a full media key', () => {
    expect(resolveMediaUrl('uploads/p-0001/ab12.webp')).toBe('/media/uploads/p-0001/ab12.webp');
  });

  it('encodes each segment of a full key', () => {
    expect(resolveMediaUrl('uploads/p 1/a b.webp')).toBe('/media/uploads/p%201/a%20b.webp');
  });
});
