import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from './pages/DashboardPage.vue'
import PerformancePage from './pages/PerformancePage.vue'
import ProjectDetailPage from './pages/ProjectDetailPage.vue'
import ProjectsPage from './pages/ProjectsPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardPage,
      meta: { label: 'Dashboard' },
    },
    {
      path: '/projects',
      name: 'projects',
      component: ProjectsPage,
      meta: { label: 'Projects' },
    },
    {
      path: '/projects/:slug',
      name: 'project-detail',
      component: ProjectDetailPage,
      props: true,
      meta: { label: 'Project detail' },
    },
    {
      path: '/performance',
      name: 'performance',
      component: PerformancePage,
      meta: { label: 'Performance' },
    },
  ],
})
