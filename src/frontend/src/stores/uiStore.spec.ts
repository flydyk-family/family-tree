import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUiStore, ORIENTATION_STORAGE_KEY } from './uiStore';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('uiStore', () => {
  it('defaults to vertical orientation', () => {
    const ui = useUiStore();
    expect(ui.orientation).toBe('vertical');
  });

  it('defaults searchCursor to 0', () => {
    const ui = useUiStore();
    expect(ui.searchCursor).toBe(0);
  });

  it('toggleOrientation flips between vertical and horizontal', () => {
    const ui = useUiStore();
    ui.toggleOrientation();
    expect(ui.orientation).toBe('horizontal');
    ui.toggleOrientation();
    expect(ui.orientation).toBe('vertical');
  });

  it('setOrientation persists to localStorage', () => {
    const ui = useUiStore();
    ui.setOrientation('horizontal');
    expect(localStorage.getItem(ORIENTATION_STORAGE_KEY)).toBe('horizontal');
  });

  it('init() restores a persisted orientation', () => {
    localStorage.setItem(ORIENTATION_STORAGE_KEY, 'horizontal');
    const ui = useUiStore();
    ui.init();
    expect(ui.orientation).toBe('horizontal');
  });

  it('ignores an invalid persisted value', () => {
    localStorage.setItem(ORIENTATION_STORAGE_KEY, 'sideways');
    const ui = useUiStore();
    ui.init();
    expect(ui.orientation).toBe('vertical');
  });

  it('advanceSearchCursor increments the cursor', () => {
    const ui = useUiStore();
    expect(ui.searchCursor).toBe(0);
    ui.advanceSearchCursor();
    ui.advanceSearchCursor();
    expect(ui.searchCursor).toBe(2);
  });

  it('setSearch stores the query and resets the cursor', () => {
    const ui = useUiStore();
    ui.advanceSearchCursor();
    ui.setSearch('anna');
    expect(ui.search).toBe('anna');
    expect(ui.searchCursor).toBe(0);
  });

  it('setSearch with an unchanged query keeps the cursor', () => {
    // type=search inputs fire a native `search` event on Enter that re-reports
    // the same value; that must not cancel the Enter-cycling the keydown started.
    const ui = useUiStore();
    ui.setSearch('anna');
    ui.advanceSearchCursor();
    ui.setSearch('anna');
    expect(ui.searchCursor).toBe(1);
  });

  it('setOrientation sets orientationExplicit to true and persists', () => {
    const ui = useUiStore();
    expect(ui.orientationExplicit).toBe(false);
    ui.setOrientation('horizontal');
    expect(ui.orientationExplicit).toBe(true);
    expect(localStorage.getItem(ORIENTATION_STORAGE_KEY)).toBe('horizontal');
  });

  it('applyResponsiveOrientation sets orientation when no explicit choice has been made', () => {
    const ui = useUiStore();
    expect(ui.orientationExplicit).toBe(false);
    ui.applyResponsiveOrientation('horizontal');
    expect(ui.orientation).toBe('horizontal');
    expect(ui.orientationExplicit).toBe(false);
    expect(localStorage.getItem(ORIENTATION_STORAGE_KEY)).toBeNull();
  });

  it('applyResponsiveOrientation is a no-op after setOrientation (explicit) was called', () => {
    const ui = useUiStore();
    ui.setOrientation('horizontal');
    ui.applyResponsiveOrientation('vertical');
    expect(ui.orientation).toBe('horizontal');
  });

  it('init() reading a stored value sets orientationExplicit to true', () => {
    localStorage.setItem(ORIENTATION_STORAGE_KEY, 'horizontal');
    const ui = useUiStore();
    expect(ui.orientationExplicit).toBe(false);
    ui.init();
    expect(ui.orientation).toBe('horizontal');
    expect(ui.orientationExplicit).toBe(true);
  });

  it('init() with nothing stored leaves orientationExplicit false', () => {
    const ui = useUiStore();
    ui.init();
    expect(ui.orientationExplicit).toBe(false);
  });
});
