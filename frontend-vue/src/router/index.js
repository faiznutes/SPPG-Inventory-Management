import { createRouter, createWebHistory } from 'vue-router'
import { pinia } from '../stores'
import { useAuthStore } from '../stores/auth'
import LoginPage from '../pages/LoginPage.vue'
import AppShell from '../layouts/AppShell.vue'
import DashboardPage from '../pages/DashboardPage.vue'
import StocksPage from '../pages/StocksPage.vue'
import TransactionsPage from '../pages/TransactionsPage.vue'
import ChecklistTodayPage from '../pages/ChecklistTodayPage.vue'
import PurchaseRequestListPage from '../pages/PurchaseRequestListPage.vue'
import PurchaseRequestDetailPage from '../pages/PurchaseRequestDetailPage.vue'
import SettingsPage from '../pages/SettingsPage.vue'
import NotificationsPage from '../pages/NotificationsPage.vue'

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
        meta: { title: 'Pengaturan' },
      },
      {
        path: 'notifications',
        name: 'notifications',
        component: NotificationsPage,
        meta: { title: 'Notifikasi' },
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
  }

  return true
})

export default router
