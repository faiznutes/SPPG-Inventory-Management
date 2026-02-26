<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '../components/common/PageHeader.vue'
import BaseModal from '../components/common/BaseModal.vue'
import { formatRupiah } from '../utils/currency'
import { useNotificationsStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'

const notifications = useNotificationsStore()
const authStore = useAuthStore()

const rows = ref([])
const isLoading = ref(false)
const activeStatus = ref('Semua')
const showCreateModal = ref(false)
const showBulkModal = ref(false)
const selectedIds = ref([])
const bulkStatus = ref('SUBMITTED')
const bulkNotes = ref('')

const form = reactive({
  notes: '',
  items: [{ itemName: '', qty: '', unitPrice: '' }],
})

const statusMap = {
  DRAFT: 'Draf',
  SUBMITTED: 'Diajukan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  ORDERED: 'Dipesan',
  RECEIVED: 'Diterima',
  CLOSED: 'Ditutup',
}

function parseNumberInput(value) {
  const normalized = String(value || '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : NaN
}

const filteredRows = computed(() => {
  if (activeStatus.value === 'Semua') return rows.value
  return rows.value.filter((row) => row.statusLabel === activeStatus.value)
})

async function loadRows() {
  if (!authStore.accessToken) return

  isLoading.value = true
  try {
    const data = await api.listPurchaseRequests(authStore.accessToken)
    rows.value = data.map((row) => ({
      id: row.id,
      prNumber: row.prNumber,
      peminta: row.requestedBy?.name || row.requestedBy?.username || '-',
      tanggal: new Date(row.createdAt).toLocaleDateString('id-ID'),
      total: row.totalAmount,
      status: row.status,
      statusLabel: statusMap[row.status] || row.status,
    }))
  } catch (error) {
    notifications.showPopup('Gagal memuat PR', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

async function submitCreatePr() {
  try {
    const normalizedItems = form.items
      .map((item) => ({
        itemName: item.itemName.trim(),
        qty: parseNumberInput(item.qty),
        unitPrice: parseNumberInput(item.unitPrice),
      }))
      .filter((item) => item.itemName && item.qty > 0 && item.unitPrice >= 0 && Number.isFinite(item.qty) && Number.isFinite(item.unitPrice))

    if (!normalizedItems.length) {
      notifications.showPopup('Item PR kosong', 'Tambahkan minimal 1 item valid.', 'error')
      return
    }

    await api.createPurchaseRequest(authStore.accessToken, {
      notes: form.notes,
      items: normalizedItems,
    })

    showCreateModal.value = false
    form.items = [{ itemName: '', qty: '', unitPrice: '' }]
    form.notes = ''
    notifications.showPopup('PR baru tersimpan', 'Permintaan pembelian berhasil dibuat.', 'success')
    await loadRows()
  } catch (error) {
    notifications.showPopup('Gagal simpan PR', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

function toggleRowSelection(id) {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((rowId) => rowId !== id)
    return
  }
  selectedIds.value.push(id)
}

function openBulkModal() {
  if (!selectedIds.value.length) {
    notifications.showPopup('Belum ada pilihan', 'Pilih minimal 1 PR untuk aksi bulk.', 'error')
    return
  }
  bulkStatus.value = 'SUBMITTED'
  bulkNotes.value = ''
  showBulkModal.value = true
}

async function submitBulkStatus() {
  try {
    await api.bulkUpdatePurchaseRequestStatus(authStore.accessToken, {
      ids: selectedIds.value,
      status: bulkStatus.value,
      notes: bulkNotes.value || undefined,
    })
    showBulkModal.value = false
    notifications.showPopup('Bulk berhasil', 'Status PR terpilih berhasil diperbarui.', 'success')
    selectedIds.value = []
    await loadRows()
  } catch (error) {
    notifications.showPopup('Bulk gagal', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

function addItemRow() {
  form.items.push({ itemName: '', qty: '', unitPrice: '' })
}

function removeItemRow(index) {
  if (form.items.length === 1) return
  form.items.splice(index, 1)
}

onMounted(async () => {
  await loadRows()
})
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Permintaan Pembelian" subtitle="Pantau dan kelola pengajuan pembelian stok">
      <template #actions>
        <button class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white" @click="showCreateModal = true">
          Buat PR Baru
        </button>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="openBulkModal">
          Bulk Status
        </button>
      </template>
    </PageHeader>

    <section class="rounded-xl border border-slate-200 bg-white">
      <div class="flex flex-wrap gap-2 border-b border-slate-200 px-3 py-3">
        <button
          v-for="status in ['Semua', 'Draf', 'Diajukan', 'Disetujui', 'Ditolak', 'Diterima']"
          :key="status"
          class="rounded-lg px-3 py-2 text-sm font-semibold"
          :class="activeStatus === status ? 'bg-blue-50 text-blue-700' : 'border border-slate-200 text-slate-600'"
          @click="activeStatus = status"
        >
          {{ status }}
        </button>
      </div>

      <div class="space-y-2 p-3 sm:hidden">
        <article v-if="isLoading" class="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">Memuat data PR...</article>
        <article v-for="row in filteredRows" :key="`m-${row.id}`" class="rounded-lg border border-slate-200 p-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-sm font-bold text-slate-900">{{ row.prNumber }}</p>
              <p class="text-xs text-slate-500">{{ row.peminta }} - {{ row.tanggal }}</p>
            </div>
            <input :checked="selectedIds.includes(row.id)" type="checkbox" @change="toggleRowSelection(row.id)" />
          </div>
          <div class="mt-2 flex items-center justify-between">
            <span class="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-700">{{ row.statusLabel }}</span>
            <p class="text-sm font-semibold text-slate-900">{{ formatRupiah(row.total) }}</p>
          </div>
          <div class="mt-2 text-right">
            <RouterLink :to="`/purchase-requests/${row.id}`" class="text-xs font-bold text-blue-600 hover:text-blue-700">Lihat Detail</RouterLink>
          </div>
        </article>
      </div>

      <div class="hidden overflow-x-auto sm:block">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500">
            <tr>
              <th class="px-3 py-3 font-semibold">Nomor PR</th>
              <th class="px-3 py-3 font-semibold">Peminta</th>
              <th class="px-3 py-3 font-semibold">Tanggal</th>
              <th class="px-3 py-3 text-right font-semibold">Total</th>
              <th class="px-3 py-3 text-center font-semibold">Status</th>
              <th class="px-3 py-3 text-right font-semibold">Aksi</th>
              <th class="px-3 py-3 text-center font-semibold">Pilih</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td class="px-3 py-3 text-slate-500" colspan="7">Memuat data PR...</td>
            </tr>

            <tr v-for="row in filteredRows" :key="row.id" class="border-b border-slate-100">
              <td class="px-3 py-3 font-bold text-slate-900">{{ row.prNumber }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.peminta }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.tanggal }}</td>
              <td class="px-3 py-3 text-right font-semibold text-slate-900">{{ formatRupiah(row.total) }}</td>
              <td class="px-3 py-3 text-center">
                <span class="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">{{ row.statusLabel }}</span>
              </td>
              <td class="px-3 py-3 text-right">
                <RouterLink :to="`/purchase-requests/${row.id}`" class="text-sm font-bold text-blue-600 hover:text-blue-700">
                  Lihat Detail
                </RouterLink>
              </td>
              <td class="px-3 py-3 text-center">
                <input :checked="selectedIds.includes(row.id)" type="checkbox" @change="toggleRowSelection(row.id)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <BaseModal :show="showCreateModal" title="Buat Permintaan Pembelian" @close="showCreateModal = false">
      <form class="space-y-3" @submit.prevent="submitCreatePr">
        <div class="space-y-2">
          <div v-for="(item, idx) in form.items" :key="idx" class="rounded-lg border border-slate-200 p-3">
            <div class="mb-2 flex items-center justify-between">
              <p class="text-xs font-bold text-slate-500">Item {{ idx + 1 }}</p>
              <button type="button" class="text-xs font-bold text-rose-600" @click="removeItemRow(idx)">Hapus</button>
            </div>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Nama Item</span>
              <input v-model="item.itemName" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Masukkan item" required />
            </label>
            <div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="block">
                <span class="mb-1 block text-sm font-semibold text-slate-700">Qty</span>
                <input v-model="item.qty" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Jumlah" required />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-semibold text-slate-700">Harga Estimasi</span>
                <input v-model="item.unitPrice" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Rp" required />
              </label>
            </div>
          </div>
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700" @click="addItemRow">+ Tambah Baris Item</button>
        </div>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Catatan</span>
          <textarea v-model="form.notes" class="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Catatan opsional" />
        </label>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="showCreateModal = false">Batal</button>
          <button type="submit" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Simpan PR</button>
        </div>
      </form>
    </BaseModal>

    <BaseModal :show="showBulkModal" title="Bulk Status PR" @close="showBulkModal = false">
      <form class="space-y-3" @submit.prevent="submitBulkStatus">
        <p class="text-sm text-slate-600">Dipilih: <span class="font-bold">{{ selectedIds.length }}</span> PR</p>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Status Baru</span>
          <select v-model="bulkStatus" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="DRAFT">Draf</option>
            <option value="SUBMITTED">Diajukan</option>
            <option value="APPROVED">Disetujui</option>
            <option value="REJECTED">Ditolak</option>
            <option value="RECEIVED">Diterima</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Catatan</span>
          <textarea v-model="bulkNotes" class="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Catatan bulk opsional" />
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="showBulkModal = false">Batal</button>
          <button type="submit" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Terapkan Bulk</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
