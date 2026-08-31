import { describe, it, expect } from 'vitest';
import { buildMapUrl, residenceMapHref } from './mapLink';

describe('buildMapUrl', () => {
  it('builds a Google Maps search URL from coordinates', () => {
    expect(buildMapUrl(50.0614, 19.9372)).toBe('https://www.google.com/maps/search/?api=1&query=50.0614%2C19.9372');
  });
  it('returns null when a coordinate is missing', () => {
    expect(buildMapUrl(null, 19.9372)).toBeNull();
    expect(buildMapUrl(50.0614, null)).toBeNull();
  });
});

describe('residenceMapHref', () => {
  it('returns null when there is no stored mapUrl (no map link on the row)', () => {
    expect(residenceMapHref('Kraków', 50.06, 19.94, null)).toBeNull();
    expect(residenceMapHref(null, null, null, null)).toBeNull();
  });

  it('queries by place name when the row has no coordinates', () => {
    expect(residenceMapHref('Вільня', null, null, 'https://maps.google.com/?q=Vilnius')).toBe(
      'https://www.google.com/maps/search/?api=1&query=%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F'
    );
  });

  it('points at the coordinates themselves when the row was placed on the map', () => {
    // Coordinate-driven so a duplicate place name can't resolve to the wrong country.
    expect(
      residenceMapHref('Александровка', 50.28, 40.02, 'https://www.google.com/maps/search/?api=1&query=50.28%2C40.02')
    ).toBe('https://www.google.com/maps/place/50.28,40.02/@50.28,40.02,13z');
  });

  it('prefers coordinates over the place name even when both are present', () => {
    expect(residenceMapHref('Мінск', 53.9, 27.5667, 'https://maps.google.com/?q=whatever')).toBe(
      'https://www.google.com/maps/place/53.9,27.5667/@53.9,27.5667,13z'
    );
  });

  it('falls back to the stored mapUrl when there are no coordinates and no name', () => {
    const pin = 'https://maps.google.com/?q=Vilnius';
    expect(residenceMapHref('   ', null, null, pin)).toBe(pin);
    expect(residenceMapHref(null, null, null, pin)).toBe(pin);
  });
});
