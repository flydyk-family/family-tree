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
});
