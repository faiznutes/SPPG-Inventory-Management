<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/common/PageHeader.vue'
import { useNotificationsStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'

const notifications = useNotificationsStore()
const authStore = useAuthStore()
const router = useRouter()
const isLoading = ref(false)
const stats = ref([])
const lowStocks = ref([])

const hasLowStock = computed(() => lowStocks.value.length > 0)
const showTenantCode = computed(() => authStore.isSuperAdmin)

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

async function loadDashboard() {
  if (!authStore.accessToken) return

  isLoading.value = true
  try {
    const [summaryData, lowStockData] = await Promise.all([
      api.getDashboardSummary(authStore.accessToken),
      api.getDashboardLowStock(authStore.accessToken),
    ])

    const lowStockRows = (lowStockData || []).sort((a, b) => toNumber(a.qty) - toNumber(b.qty))
    lowStocks.value = lowStockRows.slice(0, 5)

    stats.value = [
      { label: 'Item Terdaftar', value: String(summaryData.itemCount || 0), info: 'Aktif di tenant/lokasi terpilih' },
      { label: 'Stok Menipis', value: String(summaryData.lowStockCount || 0), info: 'Perlu diprioritaskan' },
      { label: 'Checklist Belum Submit', value: String(summaryData.checklistPendingCount || 0), info: 'Checklist hari ini' },
      { label: 'PR Aktif', value: String(summaryData.activePrCount || 0), info: 'Menunggu proses' },
    ]
  } catch (error) {
    notifications.showPopup('Gagal memuat dashboard', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

function goTo(path) {
  router.push(path)
}

onMounted(async () => {
  await loadDashboard()
})

watch(
  () => [authStore.user?.tenant?.id, authStore.user?.activeLocationId],
  async () => {
    await loadDashboard()
  },
)
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Dashboard" subtitle="Ringkasan operasional inventory dan checklist hari ini" />

    <div v-if="isLoading" class="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
      Memuat ringkasan dashboard...
    </div>

    <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="item in stats" :key="item.label" class="rounded-xl border border-slate-200 bg-white p-4">
        <p class="text-sm font-semibold text-slate-500">{{ item.label }}</p>
        <p class="mt-1 text-3xl font-extrabold text-slate-900">{{ item.value }}</p>
        <p class="mt-1 text-xs text-slate-500">{{ item.info }}</p>
      </article>
    </section>

    <section class="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div class="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <p class="text-sm font-bold text-slate-900">Stok Menipis Teratas</p>
        <ul v-if="hasLowStock" class="mt-3 space-y-2 text-sm">
          <li
            v-for="row in lowStocks"
            :key="row.id"
            class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
          >
            <span>{{ row.itemName }} - {{ row.locationName }}</span>
            <span class="flex items-center gap-2">
              <span
                v-if="showTenantCode && row.tenantCode"
                class="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700"
              >
                {{ row.tenantCode }}
              </span>
              <span class="font-bold text-amber-600">{{ row.qty }} {{ row.unit }}</span>
            </span>
          </li>
        </ul>

        <div v-else class="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Belum ada stok menipis.
        </div>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-4">
        <p class="text-sm font-bold text-slate-900">Aksi Cepat</p>
        <div class="mt-3 flex flex-col gap-2">
          <button class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white" @click="goTo('/inventory/transactions')">+ Barang Masuk</button>
          <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="goTo('/inventory/transactions')">+ Barang Keluar</button>
          <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="goTo('/checklists/today')">+ Isi Checklist</button>
        </div>
      </div>
    </section>
  </div>
</template>
