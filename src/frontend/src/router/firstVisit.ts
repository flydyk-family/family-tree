import { START_LOCATION, type Router } from 'vue-router';

export const EXPLORED_STORAGE_KEY = 'familytree.explored';

function hasExplored(): boolean {
  try {
    return localStorage.getItem(EXPLORED_STORAGE_KEY) === 'true';
  } catch {
    // storage unavailable (private mode) — every session is a first visit
    return false;
  }
}

function markExplored(): void {
  try {
    localStorage.setItem(EXPLORED_STORAGE_KEY, 'true');
  } catch {
    // storage unavailable — non-fatal
  }
}

// First-time visitors landing on the bare root are greeted with the Chronicle
// page; once they navigate anywhere beyond it, the root resolves to the Tree
// as routed. Only the initial navigation of a session is eligible — in-app
// navigation (e.g. the Tree tab while still "unexplored") must always go
// where the user asked. Deep links (/person/:slug, /chronicle) are never
// redirected.
export function installFirstVisitRedirect(router: Router): void {
  router.beforeEach((to, from) => {
    if (from === START_LOCATION && to.name === 'tree' && !hasExplored()) {
      return { name: 'chronicle', replace: true };
    }
  });
  router.afterEach(to => {
    if (to.name !== 'chronicle') {
      markExplored();
    }
  });
}
