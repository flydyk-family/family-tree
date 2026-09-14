import type { Component } from 'vue';
import type { RouteLocationNormalized, RouteLocationRaw, RouteRecordRaw } from 'vue-router';

export type FamilyView = 'tree' | 'chronicle' | 'members' | 'person';

/** Every view exists twice: unprefixed for the default family (existing links keep working) and
 *  under /f/:familyId for the rest. Both shapes share one component. */
export function buildRoutes(views: { tree: Component; chronicle: Component; members: Component }): RouteRecordRaw[] {
  return [
    { path: '/', name: 'tree', component: views.tree },
    { path: '/chronicle', name: 'chronicle', component: views.chronicle },
    { path: '/members/:slug?', name: 'members', component: views.members },
    { path: '/person/:slug', name: 'person', component: views.tree },
    { path: '/f/:familyId', name: 'family-tree', component: views.tree },
    { path: '/f/:familyId/chronicle', name: 'family-chronicle', component: views.chronicle },
    { path: '/f/:familyId/members/:slug?', name: 'family-members', component: views.members },
    { path: '/f/:familyId/person/:slug', name: 'family-person', component: views.tree }
  ];
}

/** The family named by the route; null on the unprefixed routes (the default family). */
export function activeFamilyId(route: Pick<RouteLocationNormalized, 'params'>): string | null {
  const value = route.params.familyId;
  const id = Array.isArray(value) ? value[0] : value;
  return id ? id : null;
}

/** A location for a view in a family: prefixed when a family is named, unprefixed for null. */
export function familyLocation(view: FamilyView, familyId: string | null, params: Record<string, string> = {}): RouteLocationRaw {
  return familyId ? { name: `family-${view}`, params: { ...params, familyId } } : { name: view, params };
}

/** True when the route is the given view, in either shape. */
export function isView(route: Pick<RouteLocationNormalized, 'name'>, view: FamilyView): boolean {
  return route.name === view || route.name === `family-${view}`;
}
