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

const form = reactive({
  itemName: '',
  qty: '',
  unitPrice: '',
  notes: '',
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
    await api.createPurchaseRequest(authStore.accessToken, {
      notes: form.notes,
      items: [
        {
          itemName: form.itemName,
          qty: Number(form.qty),
          unitPrice: Number(form.unitPrice),
        },
      ],
    })

    showCreateModal.value = false
    form.itemName = ''
    form.qty = ''
    form.unitPrice = ''
    form.notes = ''
    notifications.addNotification('PR dibuat', 'Permintaan pembelian baru berhasil dibuat.')
    notifications.showPopup('PR baru tersimpan', 'Permintaan pembelian berhasil dibuat.', 'success')
    await loadRows()
  } catch (error) {
    notifications.showPopup('Gagal simpan PR', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
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

      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500">
            <tr>
              <th class="px-3 py-3 font-semibold">Nomor PR</th>
              <th class="px-3 py-3 font-semibold">Peminta</th>
              <th class="px-3 py-3 font-semibold">Tanggal</th>
              <th class="px-3 py-3 text-right font-semibold">Total</th>
              <th class="px-3 py-3 text-center font-semibold">Status</th>
              <th class="px-3 py-3 text-right font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td class="px-3 py-3 text-slate-500" colspan="6">Memuat data PR...</td>
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
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <BaseModal :show="showCreateModal" title="Buat Permintaan Pembelian" @close="showCreateModal = false">
      <form class="space-y-3" @submit.prevent="submitCreatePr">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Nama Item</span>
          <input v-model="form.itemName" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Masukkan item" required />
        </label>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Qty</span>
            <input v-model="form.qty" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Jumlah" required />
          </label>
          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Harga Estimasi</span>
            <input v-model="form.unitPrice" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Rp" required />
          </label>
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
  </div>
</template>
