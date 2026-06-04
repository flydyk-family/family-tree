import { describe, it, expect } from 'vitest';
import { formatLifespan, formatYearSpan } from './lifespan';
import type { LifeEvent } from '../types/family';

const ev = (year: number | null, approx = false): LifeEvent => ({
  year, month: null, day: null, approx, place: null
});

describe('formatLifespan', () => {
  it('renders birth and death years separated by an en dash', () => {
    expect(formatLifespan(ev(1762), ev(1828))).toBe('1762–1828');
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
