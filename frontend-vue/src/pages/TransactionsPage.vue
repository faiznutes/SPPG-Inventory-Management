<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '../components/common/PageHeader.vue'
import BaseModal from '../components/common/BaseModal.vue'
import { useNotificationsStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'

const notifications = useNotificationsStore()
const authStore = useAuthStore()

const rows = ref([])
const items = ref([])
const locations = ref([])
const isLoading = ref(false)
const action = ref('Masuk')
const showActionModal = ref(false)
const activeTab = ref('Semua')

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

const filteredRows = computed(() => {
  if (activeTab.value === 'Semua') return rows.value
  return rows.value.filter((row) => row.kategoriTrx === activeTab.value)
})

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
    const [transactionsData, itemsData, locationsData] = await Promise.all([
      api.listTransactions(authStore.accessToken),
      api.listItems(authStore.accessToken),
      api.listLocations(authStore.accessToken),
    ])

    const itemNameMap = Object.fromEntries(itemsData.map((item) => [item.id, item.name]))
    const userNameMap = {}

    rows.value = transactionsData.map((row) => ({
      id: row.id,
      tanggal: new Date(row.createdAt).toLocaleString('id-ID'),
      kategoriTrx: trxLabelMap[row.trxType] || row.trxType,
      item: itemNameMap[row.itemId] || row.itemId,
      qty: row.qty,
      user: row.actor?.name || row.actor?.username || userNameMap[row.createdBy] || '-',
    }))

    items.value = itemsData
    locations.value = locationsData
  } catch (error) {
    notifications.showPopup('Gagal memuat transaksi', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
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

    await api.createTransaction(authStore.accessToken, {
      trxType: trxTypeMap[action.value],
      itemId: form.itemId,
      fromLocationId: action.value === 'Masuk' ? undefined : form.fromLocationId,
      toLocationId: action.value === 'Keluar' ? undefined : form.toLocationId,
      qty: Number(form.qty),
      reason: form.reason,
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
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Transaksi Inventaris" subtitle="Catatan barang masuk, keluar, dan transfer">
      <template #actions>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Export CSV</button>
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
          v-for="tab in ['Semua', 'Masuk', 'Keluar', 'Transfer', 'Penyesuaian']"
          :key="tab"
          class="rounded-lg px-3 py-2 text-sm font-semibold"
          :class="activeTab === tab ? 'bg-blue-50 text-blue-700' : 'border border-slate-200 text-slate-600'"
          @click="activeTab = tab"
        >
          {{ tab }}
        </button>
      </div>

      <div class="space-y-2 p-3 sm:hidden">
        <article v-if="isLoading" class="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">Memuat transaksi...</article>
        <article v-for="row in filteredRows" :key="`m-${row.id}`" class="rounded-lg border border-slate-200 p-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-sm font-bold text-slate-900">{{ row.item }}</p>
              <p class="text-xs text-slate-500">{{ row.tanggal }}</p>
            </div>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{{ row.kategoriTrx }}</span>
          </div>
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
                <th class="px-3 py-3 font-semibold">Kategori Transaksi</th>
              <th class="px-3 py-3 font-semibold">Item</th>
              <th class="px-3 py-3 font-semibold">Jumlah</th>
              <th class="px-3 py-3 font-semibold">Penginput</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td class="px-3 py-3 text-slate-500" colspan="5">Memuat transaksi...</td>
            </tr>
            <tr v-for="row in filteredRows" :key="row.id" class="border-b border-slate-100">
              <td class="px-3 py-3 text-slate-700">{{ row.tanggal }}</td>
              <td class="px-3 py-3 font-bold text-slate-900">{{ row.kategoriTrx }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.item }}</td>
              <td class="px-3 py-3 font-semibold text-slate-900">{{ row.qty }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.user }}</td>
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
