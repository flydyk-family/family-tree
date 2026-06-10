import { createRouter, createWebHistory } from 'vue-router';
import TreeView from '../views/TreeView.vue';
import ChronicleView from '../views/ChronicleView.vue';
import { installFirstVisitRedirect } from './firstVisit';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'tree', component: TreeView },
    { path: '/chronicle', name: 'chronicle', component: ChronicleView },
    { path: '/person/:id', name: 'person', component: TreeView }
  ]
});

installFirstVisitRedirect(router);
