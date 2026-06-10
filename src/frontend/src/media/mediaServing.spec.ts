import { describe, it, expect } from 'vitest';
import { resolveMediaKey, parseRange } from './mediaServing';

describe('resolveMediaKey', () => {
  it('maps a /media path to an R2 key', () => {
    expect(resolveMediaKey('/media/portraits/p-0001.jpg')).toBe('portraits/p-0001.jpg');
  });

  it('decodes percent-encoded filenames', () => {
    expect(resolveMediaKey('/media/portraits/%D0%B4%D0%B5%D0%B4.mp4')).toBe('portraits/дед.mp4');
  });

  it.each([
    ['/media/', 'empty key'],
    ['/media/portraits/', 'trailing slash'],
    ['/media//portraits/x.jpg', 'empty segment'],
    ['/media/../secrets.txt', 'dot-dot traversal'],
    ['/media/portraits/%2e%2e/x.jpg', 'encoded traversal'],
    ['/media/portraits/%zz.jpg', 'malformed percent-encoding'],
    ['/elsewhere/x.jpg', 'non-media path'],
    ['/media/portraits/a\\b.jpg', 'backslash']
  ])('rejects %s (%s)', (pathname) => {
    expect(resolveMediaKey(pathname)).toBeNull();
  });
});

describe('parseRange', () => {
  it('returns null (full body) when there is no Range header', () => {
    expect(parseRange(null, 1000)).toBeNull();
  });

  it('parses an open-ended range', () => {
    expect(parseRange('bytes=200-', 1000)).toEqual({ offset: 200, length: 800 });
  });

  it('parses a bounded range inclusively', () => {
    expect(parseRange('bytes=100-199', 1000)).toEqual({ offset: 100, length: 100 });
  });

  it('clamps an end past the object size', () => {
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ offset: 900, length: 100 });
  });

  it('parses a suffix range as the last N bytes', () => {
    expect(parseRange('bytes=-100', 1000)).toEqual({ offset: 900, length: 100 });
    expect(parseRange('bytes=-5000', 1000)).toEqual({ offset: 0, length: 1000 });
  });

  it('flags a start at or past the size as unsatisfiable', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable');
  });

  it.each(['bytes=-', 'bytes=abc-def', 'items=0-10', 'bytes=200-100', 'bytes=0-10,20-30'])(
    'serves the full body for malformed or multi-range header %s',
    (header) => {
      expect(parseRange(header, 1000)).toBeNull();
    }
  );
});
