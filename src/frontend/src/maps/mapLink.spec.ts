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
    expect(residenceMapHref('Kraków', 50.06, 19.94, null, 'ChIJxyz')).toBeNull();
    expect(residenceMapHref(null, null, null, null, null)).toBeNull();
  });

  it('pins the exact place via query_place_id when the row has a place ID', () => {
    // Name + ID: unambiguous, so a duplicate name can't resolve to the wrong country.
    expect(
      residenceMapHref('Александровка', 50.28, 40.02, 'https://www.google.com/maps/search/?api=1&query=50.28%2C40.02', 'ChIJN1t_tDeuEmsRUsoyG83frY4')
    ).toBe(
      'https://www.google.com/maps/search/?api=1&query=%D0%90%D0%BB%D0%B5%D0%BA%D1%81%D0%B0%D0%BD%D0%B4%D1%80%D0%BE%D0%B2%D0%BA%D0%B0&query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4'
    );
  });

  it('points at the coordinates when there is no place ID but there are coordinates', () => {
    expect(
      residenceMapHref('Александровка', 50.28, 40.02, 'https://www.google.com/maps/search/?api=1&query=50.28%2C40.02', null)
    ).toBe('https://www.google.com/maps/place/50.28,40.02/@50.28,40.02,13z');
  });

  it('queries by place name when the row has only a name', () => {
    expect(residenceMapHref('Вільня', null, null, 'https://maps.google.com/?q=Vilnius', null)).toBe(
      'https://www.google.com/maps/search/?api=1&query=%D0%92%D1%96%D0%BB%D1%8C%D0%BD%D1%8F'
    );
  });

  it('needs a name to use the place ID — falls to coordinates without one', () => {
    expect(residenceMapHref('  ', 53.9, 27.5667, 'https://maps.google.com/?q=x', 'ChIJabc')).toBe(
      'https://www.google.com/maps/place/53.9,27.5667/@53.9,27.5667,13z'
    );
  });

  it('falls back to the stored mapUrl when there is no ID, no coordinates and no name', () => {
    const pin = 'https://maps.google.com/?q=Vilnius';
    expect(residenceMapHref('   ', null, null, pin, null)).toBe(pin);
    expect(residenceMapHref(null, null, null, pin, null)).toBe(pin);
  });
});
