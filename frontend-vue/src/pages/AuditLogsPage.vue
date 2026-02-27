<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '../components/common/PageHeader.vue'
import BaseModal from '../components/common/BaseModal.vue'
import { useAuthStore } from '../stores/auth'
import { useNotificationsStore } from '../stores/notifications'
import { api } from '../lib/api'

const authStore = useAuthStore()
const notifications = useNotificationsStore()

const rows = ref([])
const tenantOptions = ref([])
const selectedLog = ref(null)
const isLoadingDetail = ref(false)
const isLoading = ref(false)
const pagination = reactive({
  page: 1,
  pageSize: 25,
  total: 0,
})

const filters = reactive({
  fromDate: '',
  toDate: '',
  tenantId: '',
  actorUserId: '',
  entityType: '',
  entityId: '',
  action: '',
})

const canFilterTenant = computed(() => authStore.user?.role === 'SUPER_ADMIN')
const totalPages = computed(() => Math.max(1, Math.ceil((pagination.total || 0) / pagination.pageSize)))

function toIsoStart(dateOnly) {
  if (!dateOnly) return undefined
  return `${dateOnly}T00:00:00.000Z`
}

function toIsoEnd(dateOnly) {
  if (!dateOnly) return undefined
  return `${dateOnly}T23:59:59.999Z`
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('id-ID')
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

async function loadTenants() {
  if (!canFilterTenant.value || !authStore.accessToken) return
  try {
    const rowsData = await api.listTenants(authStore.accessToken, { includeArchived: 'false' })
    tenantOptions.value = Array.isArray(rowsData) ? rowsData : []
  } catch {
    tenantOptions.value = []
  }
}

async function loadData() {
  if (!authStore.accessToken) return
  isLoading.value = true

  try {
    const payload = await api.listAuditLogs(authStore.accessToken, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      from: toIsoStart(filters.fromDate),
      to: toIsoEnd(filters.toDate),
      tenantId: canFilterTenant.value ? filters.tenantId : undefined,
      actorUserId: filters.actorUserId || undefined,
      entityType: filters.entityType.trim() || undefined,
      entityId: filters.entityId.trim() || undefined,
      action: filters.action.trim() || undefined,
      sort: 'createdAt:desc',
    })

    rows.value = payload.data || []
    pagination.total = payload.pagination?.total || 0
    pagination.page = payload.pagination?.page || pagination.page
    pagination.pageSize = payload.pagination?.pageSize || pagination.pageSize
  } catch (error) {
    notifications.showPopup('Gagal memuat audit log', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

async function applyFilters() {
  pagination.page = 1
  await loadData()
}

async function resetFilters() {
  filters.fromDate = ''
  filters.toDate = ''
  filters.tenantId = ''
  filters.actorUserId = ''
  filters.entityType = ''
  filters.entityId = ''
  filters.action = ''
  pagination.page = 1
  await loadData()
}

async function goToPage(nextPage) {
  if (nextPage < 1 || nextPage > totalPages.value || nextPage === pagination.page) return
  pagination.page = nextPage
  await loadData()
}

function buildExportQuery() {
  return {
    from: toIsoStart(filters.fromDate),
    to: toIsoEnd(filters.toDate),
    tenantId: canFilterTenant.value ? filters.tenantId : undefined,
    actorUserId: filters.actorUserId || undefined,
    entityType: filters.entityType.trim() || undefined,
    entityId: filters.entityId.trim() || undefined,
    action: filters.action.trim() || undefined,
    sort: 'createdAt:desc',
  }
}

async function exportCsv() {
  if (!authStore.accessToken) return

  try {
    const blob = await api.exportAuditLogsCsv(authStore.accessToken, buildExportQuery())
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    anchor.href = url
    anchor.download = `audit-logs-${stamp}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    notifications.showPopup('Export berhasil', 'File CSV audit log berhasil diunduh.', 'success')
  } catch (error) {
    notifications.showPopup('Export gagal', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function openDetail(row) {
  if (!authStore.accessToken || !row?.id) return
  isLoadingDetail.value = true
  try {
    selectedLog.value = await api.getAuditLogDetail(authStore.accessToken, row.id)
  } catch (error) {
    notifications.showPopup('Gagal memuat detail audit', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoadingDetail.value = false
  }
}

onMounted(async () => {
  await loadTenants()
  await loadData()
})
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Audit Log" subtitle="Riwayat aktivitas perubahan data untuk investigasi operasional" />

    <section class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Dari tanggal</span>
          <input v-model="filters.fromDate" type="date" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Sampai tanggal</span>
          <input v-model="filters.toDate" type="date" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label class="block" v-if="canFilterTenant">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Tenant</span>
          <select v-model="filters.tenantId" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Semua tenant</option>
            <option v-for="tenant in tenantOptions" :key="tenant.id" :value="tenant.id">{{ tenant.name }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Entity type</span>
          <input v-model="filters.entityType" placeholder="contoh: items" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Entity ID</span>
          <input v-model="filters.entityId" placeholder="UUID / key entity" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Action</span>
          <input v-model="filters.action" placeholder="contoh: UPDATE" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Actor User ID</span>
          <input v-model="filters.actorUserId" placeholder="UUID user" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
      </div>

      <div class="mt-3 flex flex-wrap justify-end gap-2">
        <button class="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700" @click="exportCsv">Export CSV</button>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" @click="resetFilters">Reset</button>
        <button class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white" @click="applyFilters">Terapkan Filter</button>
      </div>
    </section>

    <section class="rounded-xl border border-slate-200 bg-white">
      <div class="hidden overflow-x-auto sm:block">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500">
            <tr>
              <th class="px-3 py-3 font-semibold">Waktu</th>
              <th class="px-3 py-3 font-semibold">Aktor</th>
              <th class="px-3 py-3 font-semibold">Tenant</th>
              <th class="px-3 py-3 font-semibold">Entity</th>
              <th class="px-3 py-3 font-semibold">Action</th>
              <th class="px-3 py-3 font-semibold">Ringkasan</th>
              <th class="px-3 py-3 font-semibold text-right">Detail</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td class="px-3 py-3 text-slate-500" colspan="7">Memuat audit log...</td>
            </tr>
            <tr v-else-if="rows.length === 0">
              <td class="px-3 py-3 text-slate-500" colspan="7">Tidak ada data audit untuk filter ini.</td>
            </tr>
            <tr v-for="row in rows" :key="row.id" class="border-b border-slate-100">
              <td class="px-3 py-3 text-slate-700">{{ formatDateTime(row.createdAt) }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.actor?.name || row.actor?.username || row.actor?.id || '-' }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.tenant?.name || (canFilterTenant ? 'Legacy / Unknown' : '-') }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.entityType }} / {{ row.entityId }}</td>
              <td class="px-3 py-3 font-semibold text-slate-900">{{ row.action }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.summary }}</td>
              <td class="px-3 py-3 text-right">
                <button class="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700" @click="openDetail(row)">Lihat</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="space-y-2 p-3 sm:hidden">
        <article v-if="isLoading" class="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">Memuat audit log...</article>
        <article v-else-if="rows.length === 0" class="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">Tidak ada data audit untuk filter ini.</article>
        <article v-for="row in rows" :key="`m-${row.id}`" class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs text-slate-500">{{ formatDateTime(row.createdAt) }}</p>
          <p class="text-sm font-bold text-slate-900">{{ row.summary }}</p>
          <p class="text-xs text-slate-600">{{ row.entityType }} / {{ row.action }}</p>
          <p class="mt-1 text-xs text-slate-600">{{ row.actor?.name || row.actor?.username || '-' }}</p>
          <div class="mt-2 text-right">
            <button class="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700" @click="openDetail(row)">Lihat Detail</button>
          </div>
        </article>
      </div>

      <div class="flex items-center justify-between border-t border-slate-200 px-3 py-3 text-sm">
        <p class="text-slate-600">Total {{ pagination.total }} data</p>
        <div class="flex items-center gap-2">
          <button
            class="rounded border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
            :disabled="pagination.page <= 1"
            @click="goToPage(pagination.page - 1)"
          >
            Sebelumnya
          </button>
          <span class="text-slate-700">Hal {{ pagination.page }} / {{ totalPages }}</span>
          <button
            class="rounded border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
            :disabled="pagination.page >= totalPages"
            @click="goToPage(pagination.page + 1)"
          >
            Berikutnya
          </button>
        </div>
      </div>
    </section>

    <BaseModal :show="Boolean(selectedLog)" title="Detail Audit Log" max-width-class="max-w-3xl" @close="selectedLog = null">
      <div v-if="selectedLog" class="space-y-3 text-sm">
        <div v-if="isLoadingDetail" class="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">Memuat detail...</div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <p><span class="font-semibold text-slate-700">Waktu:</span> {{ formatDateTime(selectedLog.createdAt) }}</p>
          <p><span class="font-semibold text-slate-700">Aktor:</span> {{ selectedLog.actor?.name || selectedLog.actor?.username || selectedLog.actor?.id || '-' }}</p>
          <p><span class="font-semibold text-slate-700">Entity:</span> {{ selectedLog.entityType }}</p>
          <p><span class="font-semibold text-slate-700">Entity ID:</span> {{ selectedLog.entityId }}</p>
          <p><span class="font-semibold text-slate-700">Action:</span> {{ selectedLog.action }}</p>
          <p><span class="font-semibold text-slate-700">Tenant:</span> {{ selectedLog.tenant?.name || 'Legacy / Unknown' }}</p>
        </div>

        <div class="rounded-lg border border-slate-200">
          <p class="border-b border-slate-200 px-3 py-2 font-semibold text-slate-800">Perubahan</p>
          <div v-if="!selectedLog.diff?.length" class="px-3 py-3 text-slate-500">Tidak ada detail perubahan yang dapat ditampilkan.</div>
          <div v-else class="divide-y divide-slate-100">
            <div v-for="item in selectedLog.diff" :key="`${item.field}-${formatValue(item.after)}`" class="px-3 py-2">
              <p class="font-semibold text-slate-800">{{ item.field }}</p>
              <p class="text-xs text-slate-500">Sebelum: {{ formatValue(item.before) }}</p>
              <p class="text-xs text-slate-500">Sesudah: {{ formatValue(item.after) }}</p>
            </div>
          </div>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
