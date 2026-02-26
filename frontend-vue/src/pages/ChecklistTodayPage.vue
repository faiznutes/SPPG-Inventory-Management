<script setup>
import { computed, onMounted, ref } from 'vue'
import PageHeader from '../components/common/PageHeader.vue'
import BaseModal from '../components/common/BaseModal.vue'
import { useNotificationsStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'

const notifications = useNotificationsStore()
const authStore = useAuthStore()

const runId = ref('')
const runStatus = ref('DRAFT')
const templateName = ref('Checklist Harian')
const items = ref([])
const isLoading = ref(false)

const showConfirmModal = ref(false)
const submitMode = ref('DRAFT')

const subtitle = computed(() => {
  const date = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  return `${templateName.value} - ${date}`
})

function resultClass(result) {
  if (result === 'LOW') return 'bg-amber-100 text-amber-700'
  if (result === 'OUT') return 'bg-rose-100 text-rose-700'
  if (result === 'OK') return 'bg-emerald-100 text-emerald-700'
  return 'bg-slate-100 text-slate-700'
}

function itemTypeBadgeClass(itemType) {
  if (itemType === 'ASSET') return 'bg-sky-100 text-sky-700'
  if (itemType === 'GAS') return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function itemTypeLabel(itemType) {
  if (itemType === 'ASSET') return 'Asset'
  if (itemType === 'GAS') return 'Gas'
  return 'Consumable'
}

function resultLabel(result) {
  if (result === 'LOW') return 'Menipis'
  if (result === 'OUT') return 'Habis'
  if (result === 'OK') return 'Aman'
  return 'Belum Dicek'
}

function toApiResult(label) {
  if (label === 'Aman') return 'OK'
  if (label === 'Menipis') return 'LOW'
  if (label === 'Habis') return 'OUT'
  return 'NA'
}

function exportCsv() {
  const headers = ['Tanggal', 'Template', 'Item', 'Jenis', 'Status', 'Kondisi(%)', 'Catatan']
  const today = new Date().toLocaleDateString('id-ID')
  const lines = items.value.map((item) => [
    today,
    templateName.value,
    item.title,
    itemTypeLabel(item.itemType),
    item.label,
    item.itemType === 'ASSET' ? String(item.conditionPercent ?? '') : '-',
    (item.notes || '').replaceAll('\n', ' '),
  ])

  const csv = [headers, ...lines]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `checklist-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function exportPdfA4() {
  const rowsHtml = items.value
    .map(
      (item) => `
        <tr>
          <td>${item.title}</td>
          <td>${itemTypeLabel(item.itemType)}</td>
          <td>${item.label}</td>
          <td>${item.itemType === 'ASSET' ? (item.conditionPercent ?? '-') : '-'}</td>
          <td>${item.notes || '-'}</td>
        </tr>`,
    )
    .join('')

  const html = `
    <html>
      <head>
        <title>Checklist Harian</title>
        <style>
          @page { size: A4; margin: 14mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #0f172a; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          p { margin: 0 0 8px; color: #475569; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
          th { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>${templateName.value}</h1>
        <p>Tanggal: ${new Date().toLocaleDateString('id-ID')}</p>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Jenis</th>
              <th>Status</th>
              <th>Kondisi (%)</th>
              <th>Catatan</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
    </html>
  `

  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}

async function loadChecklist() {
  if (!authStore.accessToken) return

  isLoading.value = true
  try {
    const data = await api.getTodayChecklist(authStore.accessToken)
    runId.value = data.runId
    runStatus.value = data.status
    templateName.value = data.templateName
    items.value = data.items.map((item) => ({
      ...item,
      itemType: item.itemType || 'CONSUMABLE',
      conditionPercent: typeof item.conditionPercent === 'number' ? item.conditionPercent : 100,
      label: resultLabel(item.result),
      notes: item.notes || '',
    }))
  } catch (error) {
    notifications.showPopup('Gagal memuat checklist', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

function openConfirm(mode) {
  submitMode.value = mode
  showConfirmModal.value = true
}

async function processChecklist() {
  try {
    await api.submitTodayChecklist(authStore.accessToken, {
      runId: runId.value,
      status: submitMode.value,
      items: items.value.map((item) => ({
        id: item.id,
        result: toApiResult(item.label),
        notes: item.notes,
        conditionPercent: item.itemType === 'ASSET' ? Number(item.conditionPercent) : undefined,
      })),
    })

    showConfirmModal.value = false
    notifications.addNotification('Checklist disimpan', 'Checklist harian berhasil diperbarui.')
    notifications.showPopup('Checklist tersimpan', 'Checklist harian berhasil disimpan.', 'success')
    await loadChecklist()
  } catch (error) {
    notifications.showPopup('Gagal simpan checklist', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

onMounted(async () => {
  await loadChecklist()
})
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Checklist Hari Ini" :subtitle="subtitle" />
    <section class="rounded-xl border border-slate-200 bg-white p-3">
      <div class="flex flex-wrap justify-end gap-2">
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="exportCsv">Export CSV</button>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="exportPdfA4">Export PDF A4</button>
      </div>
    </section>

    <section class="space-y-3">
      <article v-if="isLoading" class="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Memuat checklist...
      </article>

      <article v-for="item in items" :key="item.id" class="rounded-xl border border-slate-200 bg-white p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-base font-bold text-slate-900">{{ item.title }}</p>
            <div class="mt-1 flex items-center gap-2">
              <span class="rounded-full px-2 py-0.5 text-[11px] font-bold" :class="itemTypeBadgeClass(item.itemType)">
                {{ itemTypeLabel(item.itemType) }}
              </span>
              <p class="text-sm text-slate-500">Status saat ini: {{ item.label }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <select
              v-model="item.label"
              class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
              :class="resultClass(toApiResult(item.label))"
            >
              <option>Belum Dicek</option>
              <option>Aman</option>
              <option>Menipis</option>
              <option>Habis</option>
            </select>
          </div>
        </div>

        <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label v-if="item.itemType === 'ASSET'" class="sm:col-span-1">
            <span class="mb-1 block text-xs font-semibold text-slate-600">Kondisi Asset (%)</span>
            <input
              v-model.number="item.conditionPercent"
              type="number"
              min="0"
              max="100"
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label :class="item.itemType === 'ASSET' ? 'sm:col-span-2' : 'sm:col-span-3'">
            <span class="mb-1 block text-xs font-semibold text-slate-600">Catatan</span>
            <textarea
              v-model="item.notes"
              class="min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              :placeholder="item.itemType === 'ASSET' ? 'Contoh: fan kompor perlu dibersihkan' : 'Tambahkan catatan bila perlu'"
            />
          </label>
        </div>
      </article>
    </section>

    <div class="sticky bottom-3">
      <div class="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:justify-end">
        <button class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700" @click="openConfirm('DRAFT')">Simpan Draft</button>
        <button class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white" @click="openConfirm('SUBMITTED')">Submit Checklist</button>
      </div>
    </div>

    <BaseModal :show="showConfirmModal" title="Konfirmasi Checklist" max-width-class="max-w-md" @close="showConfirmModal = false">
      <p class="text-sm text-slate-600">
        {{ submitMode === 'DRAFT' ? 'Simpan checklist sebagai draft?' : 'Submit checklist sekarang?' }}
      </p>
      <div class="mt-4 flex justify-end gap-2">
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="showConfirmModal = false">Batal</button>
        <button class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white" @click="processChecklist">
          {{ submitMode === 'DRAFT' ? 'Simpan Draft' : 'Submit' }}
        </button>
      </div>
    </BaseModal>
  </div>
</template>
