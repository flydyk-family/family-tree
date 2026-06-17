import { describe, it, expect } from 'vitest';
import { formatLifespan, formatYearSpan } from './lifespan';
import type { LifeEvent } from '../types/family';

const ev = (year: number | null, approx = false): LifeEvent => ({
  year, month: null, day: null, approx, place: null
});
const evd = (year: number, month: number | null, day: number | null, approx = false): LifeEvent => ({
  year, month, day, approx, place: null
});

describe('formatLifespan', () => {
  it('renders birth and death years separated by an en dash', () => {
    expect(formatLifespan(ev(1762), ev(1828))).toBe('1762–1828');
  });

  it('renders full day.month.year when day and month are known', () => {
    expect(formatLifespan(evd(1861, 1, 1), evd(1916, 3, 19))).toBe('01.01.1861–19.03.1916');
  });

  it('renders month.year when only the month is known', () => {
    expect(formatLifespan(evd(2018, 12, null), null)).toBe('12.2018–');
  });

  it('falls back to the year alone when neither day nor month is known', () => {
    expect(formatLifespan(evd(1809, null, null), evd(1852, 2, 13))).toBe('1809–13.02.1852');
  });

  it('keeps the approximate tilde in front of a full date', () => {
    expect(formatLifespan(evd(1901, 1, 7, true), null)).toBe('~07.01.1901–');
  });

  it('marks approximate years with a leading tilde', () => {
    expect(formatLifespan(ev(1762, true), ev(1828, true))).toBe('~1762–~1828');
  });

  it('leaves the death side open for a living person', () => {
    expect(formatLifespan(ev(1962), null)).toBe('1962–');
  });

  it('renders only the death year when birth year is unknown', () => {
    expect(formatLifespan(ev(null), ev(1900))).toBe('–1900');
  });

  it('returns an empty string when no years are known', () => {
    expect(formatLifespan(ev(null), null)).toBe('');
  });
});

describe('formatYearSpan', () => {
  it('renders birth and death years separated by an en dash', () => {
    expect(formatYearSpan(1762, 1828)).toBe('1762–1828');
  });

  it('leaves the death side open for a living person', () => {
    expect(formatYearSpan(1962, null)).toBe('1962–');
  });

  it('renders only the death year when the birth year is unknown', () => {
    expect(formatYearSpan(null, 1900)).toBe('–1900');
  });

  it('returns an empty string when no years are known', () => {
    expect(formatYearSpan(null, null)).toBe('');
  });
});
