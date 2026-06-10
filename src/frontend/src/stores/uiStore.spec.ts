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
});
