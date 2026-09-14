import { createRouter, createWebHistory } from 'vue-router';
import TreeView from '../views/TreeView.vue';
import ChronicleView from '../views/ChronicleView.vue';
import MembersView from '../views/MembersView.vue';
import { installFirstVisitRedirect } from './firstVisit';
import { buildRoutes } from './familyRoutes';

export const router = createRouter({
  history: createWebHistory(),
  routes: buildRoutes({ tree: TreeView, chronicle: ChronicleView, members: MembersView })
});

installFirstVisitRedirect(router);
