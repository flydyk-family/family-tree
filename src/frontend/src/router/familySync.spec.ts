import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('../api/familyApi', () => ({ fetchFamilyGraph: vi.fn(), fetchPerson: vi.fn() }));

import { fetchFamilyGraph } from '../api/familyApi';
import { buildRoutes } from './familyRoutes';
import { installFamilySync } from './familySync';

const stub = { template: '<div />' };

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchFamilyGraph).mockReset().mockResolvedValue({ people: [], unions: [] });
});

describe('installFamilySync', () => {
  it('loads the family named by each navigation, once per family', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes({ tree: stub, chronicle: stub, members: stub }) });
    installFamilySync(router);

    await router.push('/f/kowalski');
    await router.push('/f/kowalski/chronicle');
    await router.push('/');

    expect(vi.mocked(fetchFamilyGraph).mock.calls).toEqual([['kowalski'], [null]]);
  });

  it('skips a navigation that a guard cancels', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes({ tree: stub, chronicle: stub, members: stub }) });
    router.beforeEach(to => (to.path === '/f/kowalski' ? false : undefined));
    installFamilySync(router);

    await router.push('/f/kowalski');

    expect(vi.mocked(fetchFamilyGraph)).not.toHaveBeenCalledWith('kowalski');
  });
});
