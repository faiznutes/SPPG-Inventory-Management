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

    <section class="space-y-3">
      <article v-if="isLoading" class="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Memuat checklist...
      </article>

      <article v-for="item in items" :key="item.id" class="rounded-xl border border-slate-200 bg-white p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-base font-bold text-slate-900">{{ item.title }}</p>
            <p class="text-sm text-slate-500">Status saat ini: {{ item.label }}</p>
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

        <textarea
          v-model="item.notes"
          class="mt-2 min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Tambahkan catatan bila perlu"
        />
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
