import { describe, it, expect } from 'vitest';
import { buildMapUrl } from './mapLink';

describe('buildMapUrl', () => {
  it('builds a Google Maps search URL from coordinates', () => {
    expect(buildMapUrl(50.0614, 19.9372)).toBe('https://www.google.com/maps/search/?api=1&query=50.0614%2C19.9372');
  });
  it('returns null when a coordinate is missing', () => {
    expect(buildMapUrl(null, 19.9372)).toBeNull();
    expect(buildMapUrl(50.0614, null)).toBeNull();
  });
});
