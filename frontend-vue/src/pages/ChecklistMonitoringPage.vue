<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useNotificationsStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import { APP_NAME, DEFAULT_TEMPLATE_NAME } from '../config/app'

const notifications = useNotificationsStore()
const authStore = useAuthStore()

const isLoading = ref(false)
const period = ref('WEEKLY')
const itemType = ref('ALL')
const fromDate = ref('')
const toDate = ref('')

const templateName = ref(DEFAULT_TEMPLATE_NAME)
const rangeLabel = ref('-')
const dates = ref([])
const rows = ref([])
const totals = ref({ A: 0, M: 0, H: 0, B: 0 })

const subtitle = computed(() => `${templateName.value} - ${rangeLabel.value}`)
const tenantName = computed(() => authStore.user?.tenant?.name || authStore.tenantName || APP_NAME)
const tenantCode = computed(() => authStore.user?.tenant?.code || '-')
const responsibleLine = computed(() => {
  const name = authStore.user?.name || authStore.user?.username || '-'
  const jabatan = authStore.user?.jabatan || authStore.operationalLabel || 'Staff'
  return `${name} - ${jabatan}`
})
const periodLabel = computed(() => {
  if (period.value === 'DAILY') return 'Harian'
  if (period.value === 'WEEKLY') return 'Mingguan'
  return 'Bulanan'
})
const itemTypeLabel = computed(() => {
  if (itemType.value === 'CONSUMABLE') return 'Barang habis beli lagi'
  if (itemType.value === 'GAS') return 'Habis tapi isi ulang'
  if (itemType.value === 'ASSET') return 'Tidak habis tapi bisa rusak'
  return 'Semua kategori'
})

const rangeWarning = computed(() => {
  if (period.value !== 'CUSTOM') return ''
  if (!fromDate.value || !toDate.value) return 'Tanggal custom wajib diisi.'
  const from = new Date(`${fromDate.value}T00:00:00.000Z`)
  const to = new Date(`${toDate.value}T23:59:59.999Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 'Format tanggal custom tidak valid.'
  if (to < from) return 'Tanggal akhir harus lebih besar atau sama dengan tanggal awal.'
  const maxRangeMs = 31 * 24 * 60 * 60 * 1000
  if (to.getTime() - from.getTime() > maxRangeMs) return 'Rentang custom maksimal 31 hari.'
  return ''
})

function toMonitoringQuery() {
  return {
    period: period.value,
    itemType: itemType.value,
    from: period.value === 'CUSTOM' ? fromDate.value : undefined,
    to: period.value === 'CUSTOM' ? toDate.value : undefined,
  }
}

const summaryCards = computed(() => [
  { key: 'A', label: 'Aman', value: totals.value.A, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'M', label: 'Menipis', value: totals.value.M, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'H', label: 'Habis / Rusak', value: totals.value.H, className: 'bg-rose-50 text-rose-700 border-rose-200' },
  { key: 'B', label: 'Belum dicek', value: totals.value.B, className: 'bg-slate-50 text-slate-700 border-slate-200' },
])

function cellClass(code) {
  if (code === 'A') return 'bg-emerald-50 text-emerald-700'
  if (code === 'M') return 'bg-amber-50 text-amber-700'
  if (code === 'H') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-700'
}

function dayCellClass(code, isSunday) {
  if (isSunday) {
    if (code === 'A') return 'bg-emerald-100 text-emerald-800'
    if (code === 'M') return 'bg-amber-100 text-amber-800'
    if (code === 'H') return 'bg-rose-100 text-rose-800'
    return 'bg-slate-200 text-slate-700'
  }

  return cellClass(code)
}

function cellNoteText(cell) {
  return String(cell?.notes || '').trim()
}

function rowNotes(row) {
  return (row?.cells || [])
    .map((cell) => {
      const note = cellNoteText(cell)
      if (!note) return null
      const dateMeta = dates.value.find((date) => date.key === cell.date)
      const day = dateMeta?.dayName || '-'
      const label = dateMeta?.label || cell.date
      return {
        key: `${row.title}-${cell.date}`,
        dateLabel: `${day} ${label}`,
        note,
      }
    })
    .filter(Boolean)
}

async function loadMonitoring() {
  if (!authStore.accessToken) return
  if (rangeWarning.value) {
    notifications.showPopup('Filter custom tidak valid', rangeWarning.value, 'error')
    return
  }
  isLoading.value = true
  try {
    const data = await api.getChecklistMonitoring(authStore.accessToken, toMonitoringQuery())

    templateName.value = data.templateName || DEFAULT_TEMPLATE_NAME
    rangeLabel.value = `${data.range?.fromLabel || '-'} s/d ${data.range?.toLabel || '-'}`
    dates.value = data.dates || []
    rows.value = data.rows || []
    totals.value = data.totals || { A: 0, M: 0, H: 0, B: 0 }
  } catch (error) {
    notifications.showPopup('Gagal memuat monitoring', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

function exportCsv() {
  const dayHeaders = dates.value.map((date) => `${date.dayName} ${date.label}${date.isSunday ? ' (MINGGU)' : ''}`)
  const noteHeaders = dates.value.map((date) => `Catatan ${date.dayName} ${date.label}${date.isSunday ? ' (MINGGU)' : ''}`)
  const headers = ['Item', 'Kategori', ...dayHeaders, ...noteHeaders, 'A', 'M', 'H', 'B']
  const lines = rows.value.map((row) => [
    row.title,
    row.categoryLabel,
    ...row.cells.map((cell) => cell.code),
    ...row.cells.map((cell) => cellNoteText(cell) || '-'),
    row.totals.A,
    row.totals.M,
    row.totals.H,
    row.totals.B,
  ])

  const meta = [
    ['Tenant', tenantName.value],
    ['Kode Tenant', tenantCode.value],
    ['Penanggung Jawab', responsibleLine.value],
    ['Template', templateName.value],
    ['Periode', periodLabel.value],
    ['Filter Kategori', itemTypeLabel.value],
    ['Rentang', rangeLabel.value],
    ['Legenda', 'A=Aman, M=Menipis, H=Habis/Rusak, B=Belum dicek'],
    [],
  ]

  const csv = [...meta, headers, ...lines]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `checklist-monitoring-${period.value.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

async function exportPdf() {
  if (!authStore.accessToken) return
  if (rangeWarning.value) {
    notifications.showPopup('Filter custom tidak valid', rangeWarning.value, 'error')
    return
  }

  try {
    const blob = await api.exportChecklistMonitoringPdf(authStore.accessToken, toMonitoringQuery())
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `checklist-monitoring-${period.value.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`
    link.click()
    URL.revokeObjectURL(url)
    notifications.showPopup('Export PDF berhasil', 'PDF monitoring berhasil diunduh.', 'success')
  } catch (error) {
    notifications.showPopup('Export PDF gagal', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function sendMonitoringExportTelegram() {
  if (!authStore.accessToken) return
  if (rangeWarning.value) {
    notifications.showPopup('Filter custom tidak valid', rangeWarning.value, 'error')
    return
  }

  try {
    const response = await api.sendChecklistMonitoringExportTelegram(authStore.accessToken, {
      ...toMonitoringQuery(),
    })

    if (response?.sent) {
      notifications.showPopup('Laporan monitoring terkirim', 'PDF monitoring checklist terkirim ke Telegram tenant.', 'success')
    }
  } catch (error) {
    notifications.showPopup(
      'Kirim Telegram gagal',
      error instanceof Error ? error.message : 'Export lokal tetap tersimpan, tetapi kirim Telegram gagal.',
      'error',
    )
  }
}

onMounted(async () => {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = `${now.getUTCMonth() + 1}`.padStart(2, '0')
  const dd = `${now.getUTCDate()}`.padStart(2, '0')
  fromDate.value = `${yyyy}-${mm}-${dd}`
  toDate.value = `${yyyy}-${mm}-${dd}`
  await loadMonitoring()
})

watch(
  () => [authStore.user?.tenant?.id, authStore.user?.activeLocationId],
  async () => {
    await loadMonitoring()
  },
)
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Monitoring Checklist" :subtitle="subtitle">
      <template #actions>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" @click="exportCsv">Export CSV</button>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" @click="exportPdf">Export PDF</button>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" @click="sendMonitoringExportTelegram">Export PDF + Telegram</button>
      </template>
    </PageHeader>

    <section class="rounded-xl border border-slate-200 bg-white p-3">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="value in ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']"
          :key="value"
          class="rounded-lg px-3 py-2 text-sm font-semibold"
          :class="period === value ? 'bg-blue-50 text-blue-700' : 'border border-slate-200 text-slate-600'"
          @click="period = value; loadMonitoring()"
        >
          {{ value }}
        </button>
      </div>
      <div v-if="period === 'CUSTOM'" class="mt-2 flex flex-wrap items-end gap-2">
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Dari</span>
          <input v-model="fromDate" type="date" class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Sampai</span>
          <input v-model="toDate" type="date" class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
        </label>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" @click="loadMonitoring">Terapkan Custom</button>
        <p v-if="rangeWarning" class="text-xs font-semibold text-rose-600">{{ rangeWarning }}</p>
      </div>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          v-for="value in ['ALL', 'CONSUMABLE', 'GAS', 'ASSET']"
          :key="value"
          class="rounded-lg px-3 py-2 text-sm font-semibold"
          :class="itemType === value ? 'bg-emerald-50 text-emerald-700' : 'border border-slate-200 text-slate-600'"
          @click="itemType = value; loadMonitoring()"
        >
          {{ value }}
        </button>
      </div>
    </section>

    <section class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <article v-for="card in summaryCards" :key="card.key" class="rounded-xl border p-3" :class="card.className">
        <p class="text-xs font-bold uppercase">{{ card.label }}</p>
        <p class="mt-1 text-xl font-black">{{ card.value }}</p>
      </article>
    </section>

    <section class="space-y-3 sm:hidden">
      <article v-if="isLoading" class="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Memuat monitoring checklist...
      </article>
      <article v-else-if="!rows.length" class="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Belum ada data monitoring pada periode ini.
      </article>
      <article v-for="row in rows" :key="`mobile-${row.title}`" class="rounded-xl border border-slate-200 bg-white p-3">
        <div class="mb-2">
          <p class="text-sm font-bold text-slate-900">{{ row.title }}</p>
          <p class="text-xs text-slate-500">{{ row.categoryLabel }}</p>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="cell in row.cells"
            :key="`mobile-${row.title}-${cell.date}`"
            class="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-black"
            :class="dayCellClass(cell.code, dates.find((date) => date.key === cell.date)?.isSunday)"
          >
            {{ cell.code }}
            <span class="font-semibold" :class="dates.find((date) => date.key === cell.date)?.isSunday ? 'text-rose-700' : 'text-slate-500'">
              {{ dates.find((date) => date.key === cell.date)?.dayName }}
            </span>
          </span>
        </div>
        <div class="mt-2 grid grid-cols-4 gap-1 text-center text-[11px] font-bold">
          <div class="rounded bg-emerald-50 px-1 py-1 text-emerald-700">A {{ row.totals.A }}</div>
          <div class="rounded bg-amber-50 px-1 py-1 text-amber-700">M {{ row.totals.M }}</div>
          <div class="rounded bg-rose-50 px-1 py-1 text-rose-700">H {{ row.totals.H }}</div>
          <div class="rounded bg-slate-100 px-1 py-1 text-slate-700">B {{ row.totals.B }}</div>
        </div>
        <div v-if="rowNotes(row).length" class="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
          <p class="text-[11px] font-bold text-slate-700">Catatan Harian</p>
          <ul class="mt-1 space-y-1 text-[11px] text-slate-600">
            <li v-for="note in rowNotes(row)" :key="`mobile-note-${note.key}`">
              <span class="font-semibold">{{ note.dateLabel }}:</span> {{ note.note }}
            </li>
          </ul>
        </div>
      </article>
      <article v-if="!isLoading && rows.length" class="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p class="text-xs font-black text-slate-700">TOTAL SEMUA ITEM</p>
        <div class="mt-2 grid grid-cols-4 gap-1 text-center text-xs font-black">
          <div class="rounded bg-emerald-100 px-1 py-1 text-emerald-800">A {{ totals.A }}</div>
          <div class="rounded bg-amber-100 px-1 py-1 text-amber-800">M {{ totals.M }}</div>
          <div class="rounded bg-rose-100 px-1 py-1 text-rose-800">H {{ totals.H }}</div>
          <div class="rounded bg-slate-200 px-1 py-1 text-slate-800">B {{ totals.B }}</div>
        </div>
      </article>
    </section>

    <section class="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white sm:block">
      <table class="min-w-full text-left text-xs">
        <thead class="border-b border-slate-200 bg-slate-50 text-slate-600">
          <tr>
            <th class="sticky left-0 z-20 bg-slate-50 px-3 py-2 font-semibold">Item</th>
            <th class="sticky left-[220px] z-20 bg-slate-50 px-3 py-2 font-semibold">Kategori</th>
            <th v-for="date in dates" :key="date.key" class="px-2 py-2 text-center font-semibold" :class="date.isSunday ? 'bg-rose-50 text-rose-700' : ''">
              {{ date.dayName }}<br>{{ date.label }}
            </th>
            <th class="px-2 py-2 text-center font-semibold text-emerald-700">A</th>
            <th class="px-2 py-2 text-center font-semibold text-amber-700">M</th>
            <th class="px-2 py-2 text-center font-semibold text-rose-700">H</th>
            <th class="px-2 py-2 text-center font-semibold text-slate-700">B</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="isLoading">
            <td class="px-3 py-4 text-slate-500" :colspan="dates.length + 6">Memuat monitoring checklist...</td>
          </tr>
          <tr v-else-if="!rows.length">
            <td class="px-3 py-4 text-slate-500" :colspan="dates.length + 6">Belum ada data monitoring pada periode ini.</td>
          </tr>
          <tr v-for="row in rows" :key="row.title" class="border-b border-slate-100">
            <td class="sticky left-0 z-10 bg-white px-3 py-2 font-semibold text-slate-900" style="min-width: 220px;">{{ row.title }}</td>
            <td class="sticky left-[220px] z-10 bg-white px-3 py-2 text-slate-600" style="min-width: 170px;">{{ row.categoryLabel }}</td>
            <td v-for="cell in row.cells" :key="`${row.title}-${cell.date}`" class="px-2 py-2 text-center">
              <span
                class="inline-flex min-w-6 justify-center rounded px-1.5 py-0.5 text-[11px] font-black"
                :class="cellClass(cell.code)"
                :title="cellNoteText(cell) || undefined"
              >
                {{ cell.code }}
              </span>
            </td>
            <td class="px-2 py-2 text-center font-bold text-emerald-700">{{ row.totals.A }}</td>
            <td class="px-2 py-2 text-center font-bold text-amber-700">{{ row.totals.M }}</td>
            <td class="px-2 py-2 text-center font-bold text-rose-700">{{ row.totals.H }}</td>
            <td class="px-2 py-2 text-center font-bold text-slate-700">{{ row.totals.B }}</td>
          </tr>
          <tr v-if="!isLoading && rows.length" class="bg-slate-50">
            <td class="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-black text-slate-900" style="min-width: 220px;">TOTAL</td>
            <td class="sticky left-[220px] z-10 bg-slate-50 px-3 py-2 text-slate-500" style="min-width: 170px;">Semua item</td>
            <td v-for="date in dates" :key="`total-${date.key}`" class="px-2 py-2 text-center text-slate-400">-</td>
            <td class="px-2 py-2 text-center font-black text-emerald-700">{{ totals.A }}</td>
            <td class="px-2 py-2 text-center font-black text-amber-700">{{ totals.M }}</td>
            <td class="px-2 py-2 text-center font-black text-rose-700">{{ totals.H }}</td>
            <td class="px-2 py-2 text-center font-black text-slate-700">{{ totals.B }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="!isLoading && rows.length" class="rounded-xl border border-slate-200 bg-white p-3">
      <p class="text-sm font-bold text-slate-900">Catatan Harian Per Item</p>
      <p class="mt-1 text-xs text-slate-500">Ringkasan kendala/catatan dari checklist setiap tanggal.</p>

      <div class="mt-3 space-y-3">
        <article v-for="row in rows" :key="`notes-${row.title}`" class="rounded-lg border border-slate-200 p-3">
          <p class="text-sm font-bold text-slate-900">{{ row.title }}</p>
          <p class="text-xs text-slate-500">{{ row.categoryLabel }}</p>

          <ul v-if="rowNotes(row).length" class="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
            <li v-for="note in rowNotes(row)" :key="`note-${note.key}`">
              <span class="font-semibold">{{ note.dateLabel }}:</span> {{ note.note }}
            </li>
          </ul>
          <p v-else class="mt-2 text-xs text-slate-400">Tidak ada catatan harian pada periode ini.</p>
        </article>
      </div>
    </section>
  </div>
</template>
