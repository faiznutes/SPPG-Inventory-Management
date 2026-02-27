<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '../components/common/PageHeader.vue'
import BaseModal from '../components/common/BaseModal.vue'
import { formatRupiah } from '../utils/currency'
import { useNotificationsStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { APP_NAME } from '../config/app'

const notifications = useNotificationsStore()
const authStore = useAuthStore()

const rows = ref([])
const isLoading = ref(false)
const activeStatus = ref('Semua')
const activePeriod = ref('MONTHLY')
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

const periodLabelMap = {
  DAILY: 'Harian',
  WEEKLY: 'Mingguan',
  MONTHLY: 'Bulanan',
}

const dayNameMap = {
  0: 'Minggu',
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
}

const tenantName = computed(() => authStore.user?.tenant?.name || authStore.tenantName || APP_NAME)
const responsibleLine = computed(() => {
  const name = authStore.user?.name || authStore.user?.username || '-'
  const jabatan = authStore.user?.jabatan || authStore.operationalLabel || 'Staff'
  return `${name} - ${jabatan}`
})

const periodLabel = computed(() => periodLabelMap[activePeriod.value] || activePeriod.value)

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
    const data = await api.listPurchaseRequests(authStore.accessToken, { period: activePeriod.value })
    rows.value = data.map((row) => ({
      id: row.id,
      prNumber: row.prNumber,
      peminta: row.requestedBy?.name || row.requestedBy?.username || '-',
      createdAt: row.createdAt,
      tanggal: new Date(row.createdAt).toLocaleDateString('id-ID'),
      hari: dayNameMap[new Date(row.createdAt).getDay()],
      isSunday: new Date(row.createdAt).getDay() === 0,
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

async function changePeriod(period) {
  activePeriod.value = period
  await loadRows()
}

function exportCsv() {
  const headers = ['Tanggal', 'Hari', 'Nomor PR', 'Peminta', 'Status', 'Total', 'Minggu/Libur']
  const today = new Date().toLocaleDateString('id-ID')
  const meta = [
    ['Tenant', tenantName.value],
    ['Penanggung Jawab', responsibleLine.value],
    ['Periode', periodLabel.value],
    ['Tanggal Export', today],
    [],
  ]

  const lines = filteredRows.value.map((row) => [
    row.tanggal,
    row.hari,
    row.prNumber,
    row.peminta,
    row.statusLabel,
    formatRupiah(row.total),
    activePeriod.value === 'WEEKLY' && row.isSunday ? 'YA' : '-',
  ])

  const csv = [...meta, headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `purchase-requests-${activePeriod.value.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function exportPdfA4() {
  const rowsHtml = filteredRows.value
    .map((row) => {
      const sundayBlockStyle = activePeriod.value === 'WEEKLY' && row.isSunday ? 'background:#fee2e2;' : ''
      const holidayBadge = activePeriod.value === 'WEEKLY' && row.isSunday ? 'MINGGU' : '-'
      return `
      <tr style="${sundayBlockStyle}">
        <td>${row.tanggal}</td>
        <td>${row.hari}</td>
        <td>${row.prNumber}</td>
        <td>${row.peminta}</td>
        <td>${row.statusLabel}</td>
        <td style="text-align:right;">${formatRupiah(row.total)}</td>
        <td style="font-weight:700;color:${holidayBadge === 'MINGGU' ? '#b91c1c' : '#475569'};">${holidayBadge}</td>
      </tr>`
    })
    .join('')

  const html = `
    <html>
      <head>
        <title>Export Permintaan Pembelian</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #0f172a; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          h2 { font-size: 14px; margin: 0 0 10px; color: #334155; }
          p { margin: 0 0 6px; color: #475569; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }
          th { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>${tenantName.value}</h1>
        <h2>${responsibleLine.value}</h2>
        <p>Laporan: Permintaan Pembelian</p>
        <p>Periode: ${periodLabel.value}</p>
        <p>Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}</p>
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Hari</th>
              <th>Nomor PR</th>
              <th>Peminta</th>
              <th>Status</th>
              <th>Total</th>
              <th>Libur</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
    </html>
  `

  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  let didClose = false
  const closePrintWindow = () => {
    if (didClose) return
    didClose = true
    printWindow.close()
    window.focus()
  }

  printWindow.onafterprint = closePrintWindow
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  setTimeout(closePrintWindow, 700)
}

async function submitCreatePr() {
  try {
    const mappedItems = form.items.map((item) => ({
      itemName: item.itemName.trim(),
      qty: parseNumberInput(item.qty),
      unitPrice: parseNumberInput(item.unitPrice),
    }))

    const firstInvalid = mappedItems.find(
      (item) => item.itemName.length < 2 || item.qty <= 0 || item.unitPrice < 0 || !Number.isFinite(item.qty) || !Number.isFinite(item.unitPrice),
    )

    if (firstInvalid) {
      notifications.showPopup('Item PR belum valid', 'Nama item minimal 2 karakter, qty > 0, dan harga tidak boleh negatif.', 'error')
      return
    }

    const normalizedItems = mappedItems.filter((item) => item.itemName)

    if (!normalizedItems.length) {
      notifications.showPopup('Item PR kosong', 'Tambahkan minimal 1 item valid.', 'error')
      return
    }

    await api.createPurchaseRequest(authStore.accessToken, {
      notes: form.notes.trim(),
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
    notifications.showPopup('Belum ada pilihan', 'Pilih minimal 1 PR untuk aksi pilihan.', 'error')
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
    notifications.showPopup('Aksi pilihan berhasil', 'Status PR terpilih berhasil diperbarui.', 'success')
    selectedIds.value = []
    await loadRows()
  } catch (error) {
    notifications.showPopup('Aksi pilihan gagal', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
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
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="exportCsv">
          Export CSV
        </button>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="exportPdfA4">
          Export PDF A4
        </button>
        <button class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white" @click="showCreateModal = true">
          Buat PR Baru
        </button>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="openBulkModal">
          Pilih Status
        </button>
      </template>
    </PageHeader>

    <section class="rounded-xl border border-slate-200 bg-white">
      <div class="flex flex-wrap gap-2 border-b border-slate-200 px-3 py-3">
        <button
          v-for="period in ['DAILY', 'WEEKLY', 'MONTHLY']"
          :key="period"
          class="rounded-lg px-3 py-2 text-sm font-semibold"
          :class="activePeriod === period ? 'bg-emerald-50 text-emerald-700' : 'border border-slate-200 text-slate-600'"
          @click="changePeriod(period)"
        >
          {{ periodLabelMap[period] }}
        </button>
      </div>
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
              <p class="text-xs text-slate-500">{{ row.peminta }} - {{ row.hari }}, {{ row.tanggal }}</p>
            </div>
            <input :checked="selectedIds.includes(row.id)" type="checkbox" @change="toggleRowSelection(row.id)" />
          </div>
          <p v-if="activePeriod === 'WEEKLY' && row.isSunday" class="mt-2 rounded bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-700">
            Tanggal merah / libur (Minggu)
          </p>
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
              <th class="px-3 py-3 font-semibold">Hari</th>
              <th class="px-3 py-3 text-right font-semibold">Total</th>
              <th class="px-3 py-3 text-center font-semibold">Status</th>
              <th class="px-3 py-3 text-center font-semibold">Libur</th>
              <th class="px-3 py-3 text-right font-semibold">Aksi</th>
              <th class="px-3 py-3 text-center font-semibold">Pilih</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td class="px-3 py-3 text-slate-500" colspan="9">Memuat data PR...</td>
            </tr>

            <tr v-for="row in filteredRows" :key="row.id" class="border-b border-slate-100" :class="activePeriod === 'WEEKLY' && row.isSunday ? 'bg-rose-50' : ''">
              <td class="px-3 py-3 font-bold text-slate-900">{{ row.prNumber }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.peminta }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.tanggal }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.hari }}</td>
              <td class="px-3 py-3 text-right font-semibold text-slate-900">{{ formatRupiah(row.total) }}</td>
              <td class="px-3 py-3 text-center">
                <span class="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">{{ row.statusLabel }}</span>
              </td>
              <td class="px-3 py-3 text-center">
                <span v-if="activePeriod === 'WEEKLY' && row.isSunday" class="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">Minggu</span>
                <span v-else class="text-slate-400">-</span>
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

    <BaseModal :show="showBulkModal" title="Status PR Terpilih" @close="showBulkModal = false">
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
          <textarea v-model="bulkNotes" class="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Catatan pilihan opsional" />
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="showBulkModal = false">Batal</button>
          <button type="submit" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Terapkan Pilihan</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
