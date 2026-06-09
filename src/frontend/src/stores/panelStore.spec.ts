import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePanelStore } from './panelStore';

beforeEach(() => setActivePinia(createPinia()));

describe('panelStore — defaults', () => {
  it('starts with no person panels, stats expanded, chips mode, no bigger view', () => {
    const s = usePanelStore();
    expect(s.personPanels).toEqual([]);
    expect(s.statsMinimized).toBe(false);
    expect(s.railMode).toBe('chips');
    expect(s.biggerViewId).toBeNull();
    expect(s.expandedId).toBeNull();
  });
});

describe('panelStore — opening people', () => {
  it('openPerson adds a person expanded and switches to rectangles mode', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    expect(s.personPanels.map(p => p.id)).toEqual(['p-1']);
    expect(s.expandedId).toBe('p-1');
    expect(s.railMode).toBe('rectangles');
  });

  it('opening a second person minimizes the first (single-expanded invariant)', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openPerson('p-2');
    expect(s.personPanels.map(p => p.id)).toEqual(['p-1', 'p-2']);
    expect(s.expandedId).toBe('p-2');
    expect(s.personPanels.find(p => p.id === 'p-1')!.minimized).toBe(true);
  });

  it('re-opening an existing person expands it without duplicating', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openPerson('p-2');
    s.openPerson('p-1');
    expect(s.personPanels.map(p => p.id)).toEqual(['p-1', 'p-2']);
    expect(s.expandedId).toBe('p-1');
  });

  it('isOpen reflects membership', () => {
    const s = usePanelStore();
    expect(s.isOpen('p-1')).toBe(false);
    s.openPerson('p-1');
    expect(s.isOpen('p-1')).toBe(true);
  });
});

describe('panelStore — minimize / expand / close', () => {
  it('minimizePerson collapses a panel and clears the expanded id', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.minimizePerson('p-1');
    expect(s.expandedId).toBeNull();
    expect(s.personPanels[0].minimized).toBe(true);
  });

  it('expandPerson expands one and minimizes the rest', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openPerson('p-2');
    s.expandPerson('p-1');
    expect(s.expandedId).toBe('p-1');
    expect(s.personPanels.find(p => p.id === 'p-2')!.minimized).toBe(true);
  });

  it('closePerson removes the panel and clears bigger view if it pointed there', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openBiggerView('p-1');
    s.closePerson('p-1');
    expect(s.isOpen('p-1')).toBe(false);
    expect(s.biggerViewId).toBeNull();
  });
});

describe('panelStore — stats', () => {
  it('toggleStats flips the minimized flag', () => {
    const s = usePanelStore();
    s.toggleStats();
    expect(s.statsMinimized).toBe(true);
    s.toggleStats();
    expect(s.statsMinimized).toBe(false);
  });

  it('expandStats switches to rectangles and shows stats', () => {
    const s = usePanelStore();
    s.collapseRail();           // chips
    s.setStatsMinimized(true);
    s.expandStats();
    expect(s.railMode).toBe('rectangles');
    expect(s.statsMinimized).toBe(false);
  });
});

describe('panelStore — mobile rail mode', () => {
  it('expandRail switches to rectangles and minimizes every person', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openPerson('p-2');
    s.collapseRail(); // back to chips
    s.expandRail();   // the ← arrow
    expect(s.railMode).toBe('rectangles');
    expect(s.expandedId).toBeNull();
    expect(s.personPanels.every(p => p.minimized)).toBe(true);
  });

  it('collapseRail switches to chips and preserves panel membership', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.collapseRail();
    expect(s.railMode).toBe('chips');
    expect(s.isOpen('p-1')).toBe(true);
  });
});

describe('panelStore — bigger view', () => {
  it('openBiggerView / closeBiggerView set and clear the target', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openBiggerView('p-1');
    expect(s.biggerViewId).toBe('p-1');
    s.closeBiggerView();
    expect(s.biggerViewId).toBeNull();
  });

  it('expandPerson preserves biggerViewId when expanding the same person (popup stays open)', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openBiggerView('p-1');
    expect(s.biggerViewId).toBe('p-1');
    // Re-expanding the same person must NOT close the popup.
    s.expandPerson('p-1');
    expect(s.biggerViewId).toBe('p-1');
  });

  it('expandPerson clears biggerViewId when switching to a different person (stale popup guard)', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openPerson('p-2');
    s.openBiggerView('p-1');
    expect(s.biggerViewId).toBe('p-1');
    // Expanding a different person must close the stale popup.
    s.expandPerson('p-2');
    expect(s.biggerViewId).toBeNull();
  });

  it('openPerson (which calls expandPerson) clears biggerViewId when switching to a different person', () => {
    const s = usePanelStore();
    s.openPerson('p-1');
    s.openBiggerView('p-1');
    expect(s.biggerViewId).toBe('p-1');
    s.openPerson('p-2');
    expect(s.biggerViewId).toBeNull();
  });
});
