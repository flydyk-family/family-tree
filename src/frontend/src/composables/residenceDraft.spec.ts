import { describe, it, expect } from 'vitest';
import { seedRows, toResidences } from './residenceDraft';
import type { Residence } from '../types/family';

const krakow: Residence = { place: { ru: 'Краков', be: 'Кракаў', en: 'Kraków' }, fromYear: 1762, toYear: 1790, lat: 50.0614, lng: 19.9372, mapUrl: 'x' };

describe('residenceDraft', () => {
  it('seeds editable rows from residences with string place locales', () => {
    const rows = seedRows([krakow]);
    expect(rows[0].place).toEqual({ ru: 'Краков', be: 'Кракаў', en: 'Kraków' });
    expect(rows[0].lat).toBe(50.0614);
  });

  it('seeds empty-string locales when a place locale is missing', () => {
    const rows = seedRows([{ ...krakow, place: { ru: 'Краков', be: null, en: null } }]);
    expect(rows[0].place).toEqual({ ru: 'Краков', be: '', en: '' });
  });

  it('converts rows back to residences, nulling empty locales and rebuilding mapUrl from coords', () => {
    // Note: the brief's fixture cast (`as unknown as Residence['place']`) is unnecessary here —
    // { ru: string; be: ''; en: '' } already satisfies LocalizedText (string | null fields).
    const rows = seedRows([{ ...krakow, place: { ru: 'Краков', be: '', en: '' }, mapUrl: null }]);
    const out = toResidences(rows);
    expect(out[0].place).toEqual({ ru: 'Краков', be: null, en: null });
    expect(out[0].mapUrl).toBe('https://www.google.com/maps/search/?api=1&query=50.0614%2C19.9372');
  });
});
