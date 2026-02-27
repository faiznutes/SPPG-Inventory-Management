<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import PageHeader from '../components/common/PageHeader.vue'
import BaseModal from '../components/common/BaseModal.vue'
import { useNotificationsStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { APP_NAME } from '../config/app'

const notifications = useNotificationsStore()
const authStore = useAuthStore()

const rows = ref([])
const items = ref([])
const locations = ref([])
const isLoading = ref(false)
const action = ref('Masuk')
const showActionModal = ref(false)
const activeTab = ref('Semua')
const activePeriod = ref('MONTHLY')
const activeTenantCode = ref('ALL')

const form = reactive({
  itemId: '',
  fromLocationId: '',
  toLocationId: '',
  qty: '',
  reason: '',
})

const trxTypeMap = {
  Masuk: 'IN',
  Keluar: 'OUT',
  Transfer: 'TRANSFER',
}

const trxLabelMap = {
  IN: 'Masuk',
  OUT: 'Keluar',
  TRANSFER: 'Transfer',
  ADJUST: 'Penyesuaian',
}

const periodLabelMap = {
  DAILY: 'Harian',
  WEEKLY: 'Mingguan',
  MONTHLY: 'Bulanan',
}

const trxTypeQueryMap = {
  Masuk: 'IN',
  Keluar: 'OUT',
  Transfer: 'TRANSFER',
  Penyesuaian: 'ADJUST',
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
const sessionLocations = computed(() => authStore.availableLocations || [])
const responsibleLine = computed(() => {
  const name = authStore.user?.name || authStore.user?.username || '-'
  const jabatan = authStore.user?.jabatan || authStore.operationalLabel || 'Staff'
  return `${name} - ${jabatan}`
})

const periodLabel = computed(() => periodLabelMap[activePeriod.value] || activePeriod.value)

const filteredRows = computed(() => {
  return rows.value.filter((row) => {
    const passType = activeTab.value === 'Semua' || row.kategoriTrx === activeTab.value
    const passTenant = activeTenantCode.value === 'ALL' || row.tenantCode === activeTenantCode.value
    return passType && passTenant
  })
})

const tenantCodeOptions = computed(() => {
  const set = new Set(rows.value.map((row) => row.tenantCode).filter(Boolean))
  return Array.from(set).sort((a, b) => a.localeCompare(b))
})

function formatTrxLocation(row) {
  if (row.kategoriTrx === 'Masuk') return row.toLocationName ? `Ke ${row.toLocationName}` : '-'
  if (row.kategoriTrx === 'Keluar') return row.fromLocationName ? `Dari ${row.fromLocationName}` : '-'
  if (row.kategoriTrx === 'Transfer') {
    if (row.fromLocationName && row.toLocationName) return `${row.fromLocationName} -> ${row.toLocationName}`
    return row.fromLocationName || row.toLocationName || '-'
  }
  if (row.kategoriTrx === 'Penyesuaian') return row.fromLocationName ? `Di ${row.fromLocationName}` : '-'
  return '-'
}

function openAction(type) {
  action.value = type
  form.itemId = ''
  form.fromLocationId = ''
  form.toLocationId = ''
  form.qty = ''
  form.reason = ''
  showActionModal.value = true
}

async function loadData() {
  if (!authStore.accessToken) return

  isLoading.value = true
  try {
    const trxType = trxTypeQueryMap[activeTab.value]
    const [transactionsData, itemsData] = await Promise.all([
      api.listTransactions(authStore.accessToken, {
        period: activePeriod.value,
        trxType,
      }),
      api.listItems(authStore.accessToken),
    ])

    const itemNameMap = Object.fromEntries(itemsData.map((item) => [item.id, item.name]))
    const userNameMap = {}

    rows.value = transactionsData.map((row) => ({
      id: row.id,
      tanggal: new Date(row.createdAt).toLocaleString('id-ID'),
      hari: dayNameMap[new Date(row.createdAt).getDay()],
      isSunday: new Date(row.createdAt).getDay() === 0,
      kategoriTrx: trxLabelMap[row.trxType] || row.trxType,
      item: itemNameMap[row.itemId] || row.itemId,
      fromLocationName: row.fromLocationName || '',
      toLocationName: row.toLocationName || '',
      lokasi: formatTrxLocation({
        kategoriTrx: trxLabelMap[row.trxType] || row.trxType,
        fromLocationName: row.fromLocationName || '',
        toLocationName: row.toLocationName || '',
      }),
      qty: row.qty,
      reason: row.reason || '-',
      user: row.actor?.name || row.actor?.username || userNameMap[row.createdBy] || '-',
      tenantCode: row.tenantCode || authStore.user?.tenant?.code || '',
    }))

    items.value = itemsData
    locations.value = sessionLocations.value.map((location) => ({
      id: location.id,
      name: location.name,
      tenantCode: authStore.user?.tenant?.code || '',
    }))
  } catch (error) {
    notifications.showPopup('Gagal memuat transaksi', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

async function changePeriod(period) {
  activePeriod.value = period
  await loadData()
}

async function changeTypeTab(tab) {
  activeTab.value = tab
  await loadData()
}

function exportCsv() {
  const headers = ['Tanggal', 'Hari', 'Kategori', 'Item', 'Lokasi', 'Qty', 'Penginput', 'Keterangan', 'Minggu/Libur']
  const today = new Date().toLocaleDateString('id-ID')
  const meta = [
    ['Tenant', tenantName.value],
    ['Penanggung Jawab', responsibleLine.value],
    ['Periode', periodLabel.value],
    ['Filter Kategori', activeTab.value],
    ['Filter Kode Tenant', activeTenantCode.value === 'ALL' ? 'Semua' : activeTenantCode.value],
    ['Tanggal Export', today],
    [],
  ]

  const lines = filteredRows.value.map((row) => [
    row.tanggal,
    row.hari,
    row.kategoriTrx,
    row.item,
    row.lokasi,
    row.qty,
    row.user,
    row.reason,
    activePeriod.value === 'WEEKLY' && row.isSunday ? 'YA' : '-',
  ])

  const csv = [...meta, headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `transactions-${activePeriod.value.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
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
        <td>${row.kategoriTrx}</td>
        <td>${row.item}</td>
        <td>${row.lokasi}</td>
        <td style="text-align:right;">${row.qty}</td>
        <td>${row.user}</td>
        <td>${row.reason}</td>
        <td style="font-weight:700;color:${holidayBadge === 'MINGGU' ? '#b91c1c' : '#475569'};">${holidayBadge}</td>
      </tr>`
    })
    .join('')

  const html = `
    <html>
      <head>
        <title>Export Transaksi</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #0f172a; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          h2 { font-size: 14px; margin: 0 0 10px; color: #334155; }
          p { margin: 0 0 6px; color: #475569; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
          th { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>${tenantName.value}</h1>
        <h2>${responsibleLine.value}</h2>
        <p>Laporan: Transaksi Inventaris</p>
        <p>Periode: ${periodLabel.value}</p>
        <p>Filter Kategori: ${activeTab.value}</p>
        <p>Filter Kode Tenant: ${activeTenantCode.value === 'ALL' ? 'Semua' : activeTenantCode.value}</p>
        <p>Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}</p>
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Hari</th>
              <th>Kategori</th>
              <th>Item</th>
              <th>Lokasi</th>
              <th>Qty</th>
              <th>Penginput</th>
              <th>Keterangan</th>
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

async function submitTransaction() {
  try {
    if (!locations.value.length) {
      notifications.showPopup('Lokasi belum tersedia', 'Tambahkan lokasi terlebih dahulu dari menu Pengaturan.', 'error')
      return
    }

    if (action.value === 'Transfer' && locations.value.length < 2) {
      notifications.showPopup('Lokasi belum cukup', 'Transfer butuh minimal 2 lokasi aktif.', 'error')
      return
    }

    if (!form.itemId) {
      notifications.showPopup('Item wajib dipilih', 'Pilih item terlebih dahulu sebelum menyimpan transaksi.', 'error')
      return
    }

    const qty = Number(form.qty)
    if (!Number.isFinite(qty) || qty <= 0) {
      notifications.showPopup('Jumlah tidak valid', 'Isi jumlah transaksi dengan angka lebih dari 0.', 'error')
      return
    }

    if (action.value !== 'Masuk' && !form.fromLocationId) {
      notifications.showPopup('Lokasi asal wajib', 'Pilih lokasi asal untuk transaksi ini.', 'error')
      return
    }

    if (action.value !== 'Keluar' && !form.toLocationId) {
      notifications.showPopup('Lokasi tujuan wajib', 'Pilih lokasi tujuan untuk transaksi ini.', 'error')
      return
    }

    if (action.value === 'Transfer' && form.fromLocationId === form.toLocationId) {
      notifications.showPopup('Lokasi tidak valid', 'Lokasi asal dan tujuan tidak boleh sama.', 'error')
      return
    }

    const reason = form.reason.trim()

    await api.createTransaction(authStore.accessToken, {
      trxType: trxTypeMap[action.value],
      itemId: form.itemId,
      fromLocationId: action.value === 'Masuk' ? undefined : form.fromLocationId,
      toLocationId: action.value === 'Keluar' ? undefined : form.toLocationId,
      qty,
      reason: reason || undefined,
    })

    showActionModal.value = false
    notifications.showPopup('Transaksi berhasil', `Transaksi ${action.value} berhasil disimpan.`, 'success')
    await loadData()
  } catch (error) {
    notifications.showPopup('Gagal simpan transaksi', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

onMounted(async () => {
  await loadData()
})

watch(
  () => [authStore.user?.tenant?.id, authStore.user?.activeLocationId],
  async () => {
    await loadData()
  },
)
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Transaksi Inventaris" subtitle="Catatan barang masuk, keluar, dan transfer">
      <template #actions>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" @click="exportCsv">Export CSV</button>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" @click="exportPdfA4">Export PDF A4</button>
      </template>
    </PageHeader>

    <section class="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <button class="rounded-xl bg-emerald-600 p-4 text-left text-white" @click="openAction('Masuk')">
        <p class="text-xs font-semibold uppercase">Aksi cepat</p>
        <p class="mt-1 text-lg font-bold">Barang Masuk</p>
      </button>
      <button class="rounded-xl bg-rose-600 p-4 text-left text-white" @click="openAction('Keluar')">
        <p class="text-xs font-semibold uppercase">Aksi cepat</p>
        <p class="mt-1 text-lg font-bold">Barang Keluar</p>
      </button>
      <button class="rounded-xl bg-blue-600 p-4 text-left text-white" @click="openAction('Transfer')">
        <p class="text-xs font-semibold uppercase">Aksi cepat</p>
        <p class="mt-1 text-lg font-bold">Transfer Lokasi</p>
      </button>
    </section>

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
          v-for="tab in ['Semua', 'Masuk', 'Keluar', 'Transfer', 'Penyesuaian']"
          :key="tab"
          class="rounded-lg px-3 py-2 text-sm font-semibold"
          :class="activeTab === tab ? 'bg-blue-50 text-blue-700' : 'border border-slate-200 text-slate-600'"
          @click="changeTypeTab(tab)"
        >
          {{ tab }}
        </button>
        <select
          v-if="authStore.isSuperAdmin"
          v-model="activeTenantCode"
          class="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          <option value="ALL">Semua Kode Tenant</option>
          <option v-for="code in tenantCodeOptions" :key="`tenant-code-${code}`" :value="code">{{ code }}</option>
        </select>
      </div>

      <div class="space-y-2 p-3 sm:hidden">
        <article v-if="isLoading" class="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">Memuat transaksi...</article>
        <article v-for="row in filteredRows" :key="`m-${row.id}`" class="rounded-lg border border-slate-200 p-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-sm font-bold text-slate-900">{{ row.item }}</p>
              <p class="text-xs text-slate-500">{{ row.hari }}, {{ row.tanggal }}</p>
            </div>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{{ row.kategoriTrx }}</span>
          </div>
          <p class="mt-2 text-xs text-slate-600">{{ row.lokasi }}</p>
          <p v-if="activePeriod === 'WEEKLY' && row.isSunday" class="mt-2 rounded bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-700">
            Tanggal merah / libur (Minggu)
          </p>
          <div class="mt-2 flex items-center justify-between text-sm">
            <p class="font-semibold text-slate-800">Qty: {{ row.qty }}</p>
            <p class="text-slate-600">{{ row.user }}</p>
          </div>
        </article>
      </div>

      <div class="hidden overflow-x-auto sm:block">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500">
            <tr>
              <th class="px-3 py-3 font-semibold">Tanggal</th>
              <th class="px-3 py-3 font-semibold">Hari</th>
              <th class="px-3 py-3 font-semibold">Kategori Transaksi</th>
              <th class="px-3 py-3 font-semibold">Item</th>
              <th class="px-3 py-3 font-semibold">Lokasi</th>
              <th class="px-3 py-3 font-semibold">Jumlah</th>
              <th class="px-3 py-3 font-semibold">Penginput</th>
              <th class="px-3 py-3 font-semibold">Libur</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td class="px-3 py-3 text-slate-500" colspan="8">Memuat transaksi...</td>
            </tr>
            <tr v-for="row in filteredRows" :key="row.id" class="border-b border-slate-100" :class="activePeriod === 'WEEKLY' && row.isSunday ? 'bg-rose-50' : ''">
              <td class="px-3 py-3 text-slate-700">{{ row.tanggal }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.hari }}</td>
              <td class="px-3 py-3 font-bold text-slate-900">{{ row.kategoriTrx }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.item }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.lokasi }}</td>
              <td class="px-3 py-3 font-semibold text-slate-900">{{ row.qty }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.user }}</td>
              <td class="px-3 py-3 text-slate-700">
                <span v-if="activePeriod === 'WEEKLY' && row.isSunday" class="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">Minggu</span>
                <span v-else class="text-slate-400">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <BaseModal :show="showActionModal" :title="`Input Transaksi ${action}`" @close="showActionModal = false">
      <form class="space-y-3" @submit.prevent="submitTransaction">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Item</span>
          <select v-model="form.itemId" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required>
            <option value="" disabled>Pilih item</option>
            <option v-for="item in items" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="block" v-if="action !== 'Masuk'">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Lokasi Asal</span>
            <select v-model="form.fromLocationId" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" :required="action !== 'Masuk'">
              <option value="" disabled>Pilih lokasi asal</option>
              <option v-for="location in locations" :key="location.id" :value="location.id">{{ location.name }}</option>
            </select>
          </label>

          <label class="block" v-if="action !== 'Keluar'">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Lokasi Tujuan</span>
            <select v-model="form.toLocationId" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" :required="action !== 'Keluar'">
              <option value="" disabled>Pilih lokasi tujuan</option>
              <option v-for="location in locations" :key="location.id" :value="location.id">{{ location.name }}</option>
            </select>
          </label>
        </div>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Jumlah</span>
          <input v-model="form.qty" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Masukkan qty" required />
        </label>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Alasan</span>
          <textarea v-model="form.reason" class="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Opsional" />
        </label>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="showActionModal = false">Batal</button>
          <button type="submit" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Simpan Transaksi</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
