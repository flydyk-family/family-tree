import { describe, it, expect } from 'vitest';
import { localize } from './localize';

describe('localize', () => {
  it('returns the requested locale when present', () => {
    expect(localize({ ru: 'Анна', be: 'Ганна', en: 'Anna' }, 'be')).toBe('Ганна');
  });

  it('falls back to ru when the requested locale is empty', () => {
    expect(localize({ ru: 'Анна', be: null, en: 'Anna' }, 'be')).toBe('Анна');
  });

  it('falls back to en when ru is missing', () => {
    expect(localize({ ru: null, be: null, en: 'Anna' }, 'ru')).toBe('Anna');
  });

  it('falls back to any available value', () => {
    expect(localize({ ru: null, be: 'Ганна', en: null }, 'en')).toBe('Ганна');
  });

  it('treats whitespace-only values as empty', () => {
    expect(localize({ ru: '   ', be: null, en: 'Anna' }, 'ru')).toBe('Anna');
  });

  it('returns an empty string for null text', () => {
    expect(localize(null, 'ru')).toBe('');
  });

  it('returns an empty string when all values are empty', () => {
    expect(localize({ ru: null, be: null, en: null }, 'ru')).toBe('');
  });
});
