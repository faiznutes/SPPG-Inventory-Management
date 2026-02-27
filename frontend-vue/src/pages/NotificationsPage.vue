<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useNotificationsStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'

const notifications = useNotificationsStore()
const authStore = useAuthStore()
const isLoading = ref(false)
const activeTenantCode = ref('ALL')

const tenantCodeOptions = computed(() => {
  const set = new Set(notifications.items.map((item) => item.tenantCode).filter(Boolean))
  return Array.from(set).sort((a, b) => a.localeCompare(b))
})

const rows = computed(() => {
  if (activeTenantCode.value === 'ALL') return notifications.items
  return notifications.items.filter((item) => item.tenantCode === activeTenantCode.value)
})

async function loadNotifications() {
  if (!authStore.accessToken) return

  isLoading.value = true
  try {
    await notifications.loadFromApi(authStore.accessToken)
    notifications.markAllAsRead()
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await loadNotifications()
})

watch(
  () => [authStore.user?.tenant?.id, authStore.user?.activeLocationId],
  async () => {
    await loadNotifications()
  },
)
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Notifikasi" subtitle="Daftar notifikasi aktivitas sistem" />

    <section class="rounded-xl border border-slate-200 bg-white p-4">
      <div v-if="authStore.isSuperAdmin" class="mb-3">
        <select v-model="activeTenantCode" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <option value="ALL">Semua Kode Tenant</option>
          <option v-for="code in tenantCodeOptions" :key="`notif-tenant-${code}`" :value="code">{{ code }}</option>
        </select>
      </div>

      <div v-if="isLoading" class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
        Memuat notifikasi...
      </div>

      <div v-else-if="rows.length === 0" class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
        Belum ada notifikasi.
      </div>

      <div v-else class="space-y-2">
        <article
          v-for="item in rows"
          :key="item.id"
          class="rounded-xl border border-slate-200 bg-slate-50 p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-bold text-slate-900">{{ item.title }}</p>
            <span
              v-if="authStore.isSuperAdmin && item.tenantCode"
              class="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700"
            >
              {{ item.tenantCode }}
            </span>
          </div>
          <p class="mt-1 text-sm text-slate-600">{{ item.message }}</p>
          <p class="mt-1 text-xs text-slate-400">{{ item.relativeTime }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
