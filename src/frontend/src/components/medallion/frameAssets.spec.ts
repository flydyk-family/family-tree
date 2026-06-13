import { describe, it, expect } from 'vitest';
import { frameGold, frameSelected, frameMatch, overlayForState } from './frameAssets';

describe('overlayForState', () => {
  it('returns no overlay for a normal node', () => {
    expect(overlayForState(false, false)).toBeNull();
  });
  it('returns the lit-gold variant when selected', () => {
    expect(overlayForState(true, false)).toBe(frameSelected);
  });
  it('returns the green-gold variant when a search match', () => {
    expect(overlayForState(false, true)).toBe(frameMatch);
  });
  it('lets match (green-gold) win when both selected and match', () => {
    expect(overlayForState(true, true)).toBe(frameMatch);
  });
  it('exposes three distinct frame URLs', () => {
    expect(new Set([frameGold, frameSelected, frameMatch]).size).toBe(3);
  });
});
