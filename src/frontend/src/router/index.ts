import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    // The member popup is deep-linkable; it renders over the same tree view.
    { path: '/member/:id', name: 'member', component: HomeView }
  ]
})

export default router
