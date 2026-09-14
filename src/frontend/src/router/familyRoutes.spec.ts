import { describe, it, expect } from 'vitest';
import { createRouter, createMemoryHistory } from 'vue-router';
import { buildRoutes, activeFamilyId, familyLocation, isView } from './familyRoutes';

const stub = { template: '<div />' };
const makeRouter = () => createRouter({ history: createMemoryHistory(), routes: buildRoutes({ tree: stub, chronicle: stub, members: stub }) });

describe('family routes', () => {
  it('keeps the unprefixed routes for the default family', async () => {
    const router = makeRouter();
    await router.push('/person/anna-1900-p-7');

    expect(router.currentRoute.value.name).toBe('person');
    expect(activeFamilyId(router.currentRoute.value)).toBeNull();
  });

  it.each([
    ['/f/kowalski', 'family-tree'],
    ['/f/kowalski/chronicle', 'family-chronicle'],
    ['/f/kowalski/members', 'family-members'],
    ['/f/kowalski/members/anna-1900-p-7', 'family-members'],
    ['/f/kowalski/person/anna-1900-p-7', 'family-person']
  ])('resolves %s to %s with the family', async (path, name) => {
    const router = makeRouter();
    await router.push(path);

    expect(router.currentRoute.value.name).toBe(name);
    expect(activeFamilyId(router.currentRoute.value)).toBe('kowalski');
  });

  it('builds prefixed and unprefixed locations', () => {
    const router = makeRouter();

    expect(router.resolve(familyLocation('person', 'kowalski', { slug: 'p-7' })).fullPath).toBe('/f/kowalski/person/p-7');
    expect(router.resolve(familyLocation('person', null, { slug: 'p-7' })).fullPath).toBe('/person/p-7');
    expect(router.resolve(familyLocation('members', 'kowalski')).fullPath).toBe('/f/kowalski/members');
    expect(router.resolve(familyLocation('tree', null)).fullPath).toBe('/');
  });

  it('recognises a view in either shape', async () => {
    const router = makeRouter();
    await router.push('/f/kowalski');

    expect(isView(router.currentRoute.value, 'tree')).toBe(true);
    expect(isView(router.currentRoute.value, 'person')).toBe(false);
  });
});
