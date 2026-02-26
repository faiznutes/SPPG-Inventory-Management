<script setup>
import { computed, onMounted, ref } from 'vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useNotificationsStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'

const notifications = useNotificationsStore()
const authStore = useAuthStore()

const isLoading = ref(false)
const period = ref('WEEKLY')
const itemType = ref('ALL')

const templateName = ref('Checklist Harian')
const rangeLabel = ref('-')
const dates = ref([])
const rows = ref([])
const totals = ref({ A: 0, M: 0, H: 0, B: 0 })

const subtitle = computed(() => `${templateName.value} - ${rangeLabel.value}`)
const tenantName = computed(() => authStore.user?.tenant?.name || authStore.tenantName || 'INVENTORY SPPG MBG')
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

async function loadMonitoring() {
  if (!authStore.accessToken) return
  isLoading.value = true
  try {
    const data = await api.getChecklistMonitoring(authStore.accessToken, {
      period: period.value,
      itemType: itemType.value,
    })

    templateName.value = data.templateName || 'Checklist Harian'
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
  const headers = ['Item', 'Kategori', ...dates.value.map((date) => `${date.dayName} ${date.label}${date.isSunday ? ' (MINGGU)' : ''}`), 'A', 'M', 'H', 'B']
  const lines = rows.value.map((row) => [
    row.title,
    row.categoryLabel,
    ...row.cells.map((cell) => cell.code),
    row.totals.A,
    row.totals.M,
    row.totals.H,
    row.totals.B,
  ])

  const meta = [
    ['Tenant', tenantName.value],
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

  void sendMonitoringExportTelegram()
}

function exportPdfA4() {
  const headerCells = dates.value
    .map((date) => {
      const className = date.isSunday ? ' class="holiday"' : ''
      return `<th${className}>${date.dayName}<br/>${date.label}</th>`
    })
    .join('')
  const bodyRows = rows.value
    .map((row) => {
      const cells = row.cells
        .map((cell) => `<td style="text-align:center;font-weight:700;" class="${cell.code === 'A' ? 'code-a' : cell.code === 'M' ? 'code-m' : cell.code === 'H' ? 'code-h' : 'code-b'}">${cell.code}</td>`)
        .join('')
      return `<tr><td>${row.title}</td><td>${row.categoryLabel}</td>${cells}<td>${row.totals.A}</td><td>${row.totals.M}</td><td>${row.totals.H}</td><td>${row.totals.B}</td></tr>`
    })
    .join('')

  const totalRow = `<tr><td colspan="2" style="font-weight:700;">TOTAL</td>${dates.value.map(() => '<td></td>').join('')}<td style="font-weight:700;">${totals.value.A}</td><td style="font-weight:700;">${totals.value.M}</td><td style="font-weight:700;">${totals.value.H}</td><td style="font-weight:700;">${totals.value.B}</td></tr>`

  const html = `
    <html>
      <head>
        <title>Monitoring Checklist</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #0f172a; }
          h1 { margin: 0 0 4px; font-size: 18px; }
          p { margin: 0 0 6px; color: #475569; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; }
          th { background: #f8fafc; text-align: center; }
          .holiday { background: #fee2e2; color: #b91c1c; }
          .code-a { background: #ecfdf5; color: #047857; }
          .code-m { background: #fffbeb; color: #b45309; }
          .code-h { background: #fef2f2; color: #be123c; }
          .code-b { background: #f1f5f9; color: #334155; }
          .sign { margin-top: 18px; width: 280px; }
          .line { margin-top: 44px; border-top: 1px solid #94a3b8; }
        </style>
      </head>
      <body>
        <h1>${tenantName.value}</h1>
        <p>Penanggung Jawab: ${responsibleLine.value}</p>
        <p>Laporan: ${templateName.value}</p>
        <p>Periode: ${periodLabel.value} | Kategori: ${itemTypeLabel.value}</p>
        <p>Rentang: ${rangeLabel.value}</p>
        <p>Legenda: A=Aman, M=Menipis, H=Habis/Rusak, B=Belum dicek</p>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Kategori</th>
              ${headerCells}
              <th>A</th><th>M</th><th>H</th><th>B</th>
            </tr>
          </thead>
          <tbody>${bodyRows}${totalRow}</tbody>
        </table>
        <div class="sign">
          <p>Mengetahui,</p>
          <div class="line"></div>
          <p>${responsibleLine.value}</p>
        </div>
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

  void sendMonitoringExportTelegram()
}

async function sendMonitoringExportTelegram() {
  if (!authStore.accessToken) return

  try {
    const response = await api.sendChecklistMonitoringExportTelegram(authStore.accessToken, {
      period: period.value,
      itemType: itemType.value,
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
  await loadMonitoring()
})
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Monitoring Checklist" :subtitle="subtitle">
      <template #actions>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" @click="exportCsv">Export CSV</button>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" @click="exportPdfA4">Export PDF A4</button>
      </template>
    </PageHeader>

    <section class="rounded-xl border border-slate-200 bg-white p-3">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="value in ['DAILY', 'WEEKLY', 'MONTHLY']"
          :key="value"
          class="rounded-lg px-3 py-2 text-sm font-semibold"
          :class="period === value ? 'bg-blue-50 text-blue-700' : 'border border-slate-200 text-slate-600'"
          @click="period = value; loadMonitoring()"
        >
          {{ value }}
        </button>
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
              <span class="inline-flex min-w-6 justify-center rounded px-1.5 py-0.5 text-[11px] font-black" :class="cellClass(cell.code)">{{ cell.code }}</span>
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
  </div>
</template>
