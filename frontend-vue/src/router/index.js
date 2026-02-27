import { createRouter, createWebHistory } from 'vue-router'
import { pinia } from '../stores'
import { useAuthStore } from '../stores/auth'
import LoginPage from '../pages/LoginPage.vue'
import AppShell from '../layouts/AppShell.vue'
import DashboardPage from '../pages/DashboardPage.vue'
import StocksPage from '../pages/StocksPage.vue'
import TransactionsPage from '../pages/TransactionsPage.vue'
import ChecklistTodayPage from '../pages/ChecklistTodayPage.vue'
import ChecklistMonitoringPage from '../pages/ChecklistMonitoringPage.vue'
import PurchaseRequestListPage from '../pages/PurchaseRequestListPage.vue'
import PurchaseRequestDetailPage from '../pages/PurchaseRequestDetailPage.vue'
import SettingsPage from '../pages/SettingsPage.vue'
import NotificationsPage from '../pages/NotificationsPage.vue'
import CategoriesPage from '../pages/CategoriesPage.vue'
import AuditLogsPage from '../pages/AuditLogsPage.vue'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
    meta: { title: 'Masuk' },
  },
  {
    path: '/',
    component: AppShell,
    children: [
      {
        path: '',
        redirect: '/dashboard',
      },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: DashboardPage,
        meta: { title: 'Dashboard' },
      },
      {
        path: 'inventory/stocks',
        name: 'stocks',
        component: StocksPage,
        meta: { title: 'Stok Inventaris' },
      },
      {
        path: 'inventory/transactions',
        name: 'transactions',
        component: TransactionsPage,
        meta: { title: 'Transaksi Inventaris' },
      },
      {
        path: 'checklists/today',
        name: 'checklist-today',
        component: ChecklistTodayPage,
        meta: { title: 'Checklist Hari Ini' },
      },
      {
        path: 'checklists/monitoring',
        name: 'checklist-monitoring',
        component: ChecklistMonitoringPage,
        meta: {
          title: 'Monitoring Checklist',
          allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        },
      },
      {
        path: 'purchase-requests',
        name: 'purchase-requests',
        component: PurchaseRequestListPage,
        meta: { title: 'Permintaan Pembelian' },
      },
      {
        path: 'purchase-requests/:id',
        name: 'purchase-request-detail',
        component: PurchaseRequestDetailPage,
        meta: { title: 'Detail Permintaan Pembelian' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: SettingsPage,
        meta: {
          title: 'Pengaturan',
          allowedRoles: ['SUPER_ADMIN'],
          requiresEdit: true,
        },
      },
      {
        path: 'master/categories',
        name: 'categories',
        component: CategoriesPage,
        meta: {
          title: 'Kategori',
          allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'STAFF'],
          requiresEdit: true,
        },
      },
      {
        path: 'notifications',
        name: 'notifications',
        component: NotificationsPage,
        meta: { title: 'Notifikasi' },
      },
      {
        path: 'audit-logs',
        name: 'audit-logs',
        component: AuditLogsPage,
        meta: {
          title: 'Audit Log',
          allowedRoles: ['SUPER_ADMIN'],
        },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore(pinia)
  authStore.hydrate()

  const isLoginPage = to.name === 'login'

  if (isLoginPage && authStore.isAuthenticated) {
    return { path: '/dashboard' }
  }

  if (!isLoginPage && authStore.isAuthenticated) {
    if (!authStore.canViewTenantData) {
      return { path: '/login' }
    }

    const allowedRoles = to.meta.allowedRoles
    if (Array.isArray(allowedRoles) && !allowedRoles.includes(authStore.user?.role || '')) {
      return { path: '/dashboard' }
    }
    if (to.meta.requiresEdit && !authStore.canEditTenantData) {
      return { path: '/dashboard' }
    }
    return true
  }

  if (!isLoginPage) {
    const refreshed = await authStore.refreshSession()
    if (!refreshed) {
      return {
        path: '/login',
        query: { redirect: to.fullPath },
      }
    }

    const allowedRoles = to.meta.allowedRoles
    if (Array.isArray(allowedRoles) && !allowedRoles.includes(authStore.user?.role || '')) {
      return { path: '/dashboard' }
    }
    if (to.meta.requiresEdit && !authStore.canEditTenantData) {
      return { path: '/dashboard' }
    }
  }

  return true
})

export default router
