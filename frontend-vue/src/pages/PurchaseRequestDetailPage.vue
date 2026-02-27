<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '../components/common/PageHeader.vue'
import BaseModal from '../components/common/BaseModal.vue'
import { formatRupiah } from '../utils/currency'
import { useNotificationsStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'

const route = useRoute()
const notifications = useNotificationsStore()
const authStore = useAuthStore()

const detail = ref(null)
const isLoading = ref(false)
const activeTab = ref('Item')
const actionType = ref('APPROVED')
const showActionModal = ref(false)
const actionNote = ref('')
const canApprovePr = computed(() => ['SUPER_ADMIN', 'ADMIN'].includes(authStore.user?.role || ''))

const statusLabelMap = {
  DRAFT: 'Draf',
  SUBMITTED: 'Diajukan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  ORDERED: 'Dipesan',
  RECEIVED: 'Diterima',
  CLOSED: 'Ditutup',
}

const total = computed(() => detail.value?.totalAmount || 0)

const subtitle = computed(() => {
  if (!detail.value) return 'Memuat detail PR...'
  return `Status: ${statusLabelMap[detail.value.status] || detail.value.status}`
})

async function loadDetail() {
  if (!authStore.accessToken) return

  isLoading.value = true
  try {
    detail.value = await api.getPurchaseRequestDetail(authStore.accessToken, route.params.id)
  } catch (error) {
    notifications.showPopup('Gagal memuat detail PR', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

function openAction(type) {
  if (!canApprovePr.value) {
    notifications.showPopup('Akses ditolak', 'Hanya SUPER_ADMIN/ADMIN yang dapat mengubah status PR.', 'error')
    return
  }

  actionType.value = type
  actionNote.value = ''
  showActionModal.value = true
}

async function submitAction() {
  try {
    await api.updatePurchaseRequestStatus(authStore.accessToken, route.params.id, {
      status: actionType.value,
      notes: actionNote.value || undefined,
    })

    showActionModal.value = false
    notifications.showPopup('Status diperbarui', 'Status PR berhasil diperbarui.', 'success')
    await loadDetail()
  } catch (error) {
    notifications.showPopup('Gagal ubah status', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

onMounted(async () => {
  await loadDetail()
})

watch(
  () => [authStore.user?.tenant?.id, authStore.user?.activeLocationId],
  async () => {
    await loadDetail()
  },
)
</script>

<template>
  <div class="space-y-5">
    <PageHeader :title="`Detail PR ${detail?.prNumber || route.params.id}`" :subtitle="subtitle">
      <template #actions>
        <template v-if="canApprovePr">
          <button class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" @click="openAction('REJECTED')">Tolak</button>
          <button class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700" @click="openAction('APPROVED')">Setujui</button>
          <button class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white" @click="openAction('RECEIVED')">Tandai Diterima</button>
        </template>
      </template>
    </PageHeader>

    <section class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          v-for="tab in ['Item', 'Timeline']"
          :key="tab"
          class="rounded-lg px-3 py-2 text-sm font-semibold"
          :class="activeTab === tab ? 'bg-blue-50 text-blue-700' : 'border border-slate-200 text-slate-600'"
          @click="activeTab = tab"
        >
          {{ tab }}
        </button>
      </div>

      <div v-if="isLoading" class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
        Memuat detail...
      </div>

      <div v-else-if="activeTab === 'Item'" class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500">
            <tr>
              <th class="px-3 py-3 font-semibold">Item</th>
              <th class="px-3 py-3 text-right font-semibold">Qty</th>
              <th class="px-3 py-3 text-right font-semibold">Harga Satuan</th>
              <th class="px-3 py-3 text-right font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in detail?.items || []" :key="item.id" class="border-b border-slate-100">
              <td class="px-3 py-3 font-semibold text-slate-900">{{ item.itemName }}</td>
              <td class="px-3 py-3 text-right text-slate-700">{{ item.qty }}</td>
              <td class="px-3 py-3 text-right text-slate-700">{{ formatRupiah(item.unitPrice) }}</td>
              <td class="px-3 py-3 text-right font-semibold text-slate-900">{{ formatRupiah(item.subtotal) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="space-y-3">
        <article v-for="entry in detail?.history || []" :key="entry.id" class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p class="text-sm font-bold text-slate-900">{{ statusLabelMap[entry.status] || entry.status }}</p>
          <p class="text-sm text-slate-600">{{ entry.notes || 'Tanpa catatan' }}</p>
          <p class="mt-1 text-xs text-slate-400">{{ new Date(entry.createdAt).toLocaleString('id-ID') }}</p>
        </article>
      </div>

      <div class="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-sm text-slate-500">Timeline: Draf -> Diajukan -> Disetujui -> Diterima -> Ditutup</p>
        <p class="text-xl font-extrabold text-slate-900">Total: {{ formatRupiah(total) }}</p>
      </div>
    </section>

    <BaseModal :show="showActionModal" title="Ubah Status Permintaan Pembelian" max-width-class="max-w-md" @close="showActionModal = false">
      <p class="text-sm text-slate-600">
        Proses status menjadi
        <span class="font-bold text-slate-900">{{ statusLabelMap[actionType] || actionType }}</span>
        ?
      </p>
      <label class="mt-3 block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">Catatan</span>
        <textarea v-model="actionNote" class="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Tambahkan catatan status" />
      </label>
      <div class="mt-4 flex justify-end gap-2">
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="showActionModal = false">Batal</button>
        <button class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white" @click="submitAction">Konfirmasi</button>
      </div>
    </BaseModal>
  </div>
</template>
