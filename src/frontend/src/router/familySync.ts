import type { Router } from 'vue-router';
import { useFamilyStore } from '../stores/familyStore';
import { activeFamilyId } from './familyRoutes';

/** Shows the route's family after every successful navigation (idempotent for the same family). */
export function installFamilySync(router: Router): void {
  router.afterEach((to, _from, failure) => {
    if (!failure) {
      void useFamilyStore().ensureFamily(activeFamilyId(to));
    }
  });
}
