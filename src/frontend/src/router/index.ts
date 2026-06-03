import { createRouter, createWebHistory } from 'vue-router';
import TreeView from '../views/TreeView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', name: 'tree', component: TreeView }]
});
