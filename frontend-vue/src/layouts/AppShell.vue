<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RouterLink, RouterView } from 'vue-router'
import { useUiStore } from '../stores/ui'
import { useNotificationsStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'
import PopupToast from '../components/common/PopupToast.vue'

const ui = useUiStore()
const notifications = useNotificationsStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const pageTitle = computed(() => route.meta.title || authStore.tenantName)
const currentRole = computed(() => authStore.user?.role || '')

const menus = [
  { name: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
  { name: 'Stok', path: '/inventory/stocks', icon: 'inventory_2' },
  { name: 'Transaksi', path: '/inventory/transactions', icon: 'swap_horiz' },
  { name: 'Checklist', path: '/checklists/today', icon: 'checklist' },
  { name: 'Permintaan Pembelian', path: '/purchase-requests', icon: 'description' },
  {
    name: 'Kategori',
    path: '/master/categories',
    icon: 'category',
    roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN'],
  },
  {
    name: 'Pengaturan',
    path: '/settings',
    icon: 'settings',
    roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN'],
  },
]

const visibleMenus = computed(() =>
  menus.filter((item) => !item.roles || item.roles.includes(currentRole.value)),
)

async function handleLogout() {
  await authStore.logout()
  notifications.showPopup('Sesi berakhir', 'Kamu sudah berhasil logout.', 'info')
  router.push('/login')
}

onMounted(async () => {
  if (!authStore.accessToken) return

  try {
    await notifications.loadFromApi(authStore.accessToken)
  } catch {
    // keep UI responsive even when notifications endpoint fails
  }
})
</script>

<template>
  <div class="min-h-screen bg-transparent">
    <div
      v-if="ui.isSidebarOpen"
      class="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
      @click="ui.closeSidebar"
    />

    <aside
      class="fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-200 bg-white p-4 transition-transform duration-200 lg:translate-x-0"
      :class="ui.isSidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="mb-5 flex items-center justify-between">
        <div>
          <p class="text-lg font-extrabold text-slate-900">{{ authStore.tenantName }}</p>
          <p class="text-xs text-slate-500">MBG - {{ authStore.operationalLabel }}</p>
        </div>
        <button class="lg:hidden" @click="ui.closeSidebar">
          <span class="material-symbols-outlined text-slate-500">close</span>
        </button>
      </div>

      <nav class="flex flex-col gap-1">
        <RouterLink
          v-for="item in visibleMenus"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition"
          active-class="bg-blue-50 text-blue-700"
          @click="ui.closeSidebar"
        >
          <span class="material-symbols-outlined text-[20px]">{{ item.icon }}</span>
          {{ item.name }}
        </RouterLink>
      </nav>
    </aside>

    <div class="lg:pl-72">
      <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div class="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <div class="flex items-center gap-3">
            <button class="rounded-md border border-slate-200 p-1.5 lg:hidden" @click="ui.toggleSidebar">
              <span class="material-symbols-outlined text-slate-700">menu</span>
            </button>
            <div>
              <p class="text-base font-bold text-slate-900 sm:text-lg">{{ pageTitle }}</p>
              <p class="text-xs text-slate-500">Sistem inventory & checklist {{ authStore.tenantName }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="hidden rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 sm:block">
              {{ authStore.user?.name || authStore.user?.username || 'Pengguna' }}
            </div>
            <button
              class="relative rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              @click="router.push('/notifications')"
            >
              <span class="material-symbols-outlined align-middle text-base">notifications</span>
              <span class="ml-1 hidden sm:inline">Notifikasi</span>
              <span
                v-if="notifications.unreadCount > 0"
                class="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white"
              >
                {{ notifications.unreadCount }}
              </span>
            </button>

            <button
              class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
              @click="handleLogout"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main class="p-4 sm:p-6">
        <RouterView />
      </main>
    </div>

    <PopupToast
      :show="notifications.toast.show"
      :title="notifications.toast.title"
      :message="notifications.toast.message"
      :variant="notifications.toast.variant"
    />
  </div>
</template>
