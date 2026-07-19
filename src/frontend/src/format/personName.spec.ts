import { describe, it, expect } from 'vitest';
import { formatPersonName } from './personName';
import type { LocalizedText } from '../types/family';

const t = (ru: string, en: string): LocalizedText => ({ ru, be: null, en });

describe('formatPersonName', () => {
  it('assembles "Given Middle Surname" when a middle name is present', () => {
    expect(formatPersonName(t('Пётр', 'Peter'), t('Янович', 'Yanovich'), t('Ковальский', 'Kowalski'), 'ru'))
      .toBe('Пётр Янович Ковальский');
    expect(formatPersonName(t('Пётр', 'Peter'), t('Янович', 'Yanovich'), t('Ковальский', 'Kowalski'), 'en'))
      .toBe('Peter Yanovich Kowalski');
  });

  it('drops the middle name when it is null or empty', () => {
    expect(formatPersonName(t('Анна', 'Anna'), null, t('Ковальская', 'Kowalska'), 'ru'))
      .toBe('Анна Ковальская');
    expect(formatPersonName(t('Анна', 'Anna'), { ru: '', be: null, en: '' }, t('Ковальская', 'Kowalska'), 'en'))
      .toBe('Anna Kowalska');
  });

  it('drops any empty part without leaving double spaces', () => {
    expect(formatPersonName(t('Пётр', 'Peter'), t('Янович', 'Yanovich'), null, 'ru'))
      .toBe('Пётр Янович');
  });
});
