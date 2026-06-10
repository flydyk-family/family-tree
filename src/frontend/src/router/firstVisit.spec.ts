import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { EXPLORED_STORAGE_KEY, installFirstVisitRedirect } from './firstVisit';

const Stub = { template: '<div />' };

// Mirrors the app's route names; each test gets a fresh router so the
// "initial navigation" (from === START_LOCATION) happens per test.
function makeRouter(): Router {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'tree', component: Stub },
      { path: '/chronicle', name: 'chronicle', component: Stub },
      { path: '/person/:id', name: 'person', component: Stub }
    ]
  });
  installFirstVisitRedirect(router);
  return router;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('first-visit chronicle landing', () => {
  it('redirects the very first load of the root to the chronicle', async () => {
    const router = makeRouter();
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('chronicle');
  });

  it('landing on the chronicle does not yet count as having explored', async () => {
    const router = makeRouter();
    await router.push('/');
    expect(localStorage.getItem(EXPLORED_STORAGE_KEY)).toBeNull();
  });

  it('in-app navigation to the tree wins over the redirect and marks the visitor as explored', async () => {
    const router = makeRouter();
    await router.push('/'); // initial load → chronicle
    await router.push('/'); // user clicks the Tree tab
    expect(router.currentRoute.value.name).toBe('tree');
    expect(localStorage.getItem(EXPLORED_STORAGE_KEY)).toBe('true');
  });

  it('once explored, a fresh session loads the root as the tree', async () => {
    localStorage.setItem(EXPLORED_STORAGE_KEY, 'true');
    const router = makeRouter();
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('tree');
  });

  it('a first-time person deep link is honoured and counts as explored', async () => {
    const router = makeRouter();
    await router.push('/person/p7');
    expect(router.currentRoute.value.name).toBe('person');
    expect(localStorage.getItem(EXPLORED_STORAGE_KEY)).toBe('true');
  });

  it('a direct chronicle visit neither redirects nor marks explored', async () => {
    const router = makeRouter();
    await router.push('/chronicle');
    expect(router.currentRoute.value.name).toBe('chronicle');
    expect(localStorage.getItem(EXPLORED_STORAGE_KEY)).toBeNull();
  });

  it('treats storage failures as a first visit (private mode still gets the chronicle)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const router = makeRouter();
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('chronicle');
  });
});
