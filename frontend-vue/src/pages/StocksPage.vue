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
const activeType = ref('Semua')
const search = ref('')
const showAdjustModal = ref(false)

const adjustForm = reactive({
  itemId: '',
  locationId: '',
  qty: '',
  reason: '',
})

const typeMap = {
  CONSUMABLE: 'Consumable',
  GAS: 'Gas',
  ASSET: 'Asset',
}

const filteredRows = computed(() => {
  const normalizedSearch = search.value.trim().toLowerCase()

  return rows.value.filter((row) => {
    const passType = activeType.value === 'Semua' || row.tipe === activeType.value
    const passSearch =
      !normalizedSearch ||
      row.item.toLowerCase().includes(normalizedSearch) ||
      row.lokasi.toLowerCase().includes(normalizedSearch)

    return passType && passSearch
  })
})

function statusClass(status) {
  if (status === 'Habis') return 'bg-rose-100 text-rose-700'
  if (status === 'Menipis') return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

async function loadData() {
  if (!authStore.accessToken) return

  isLoading.value = true
  try {
    const [stocksData, itemsData, locationsData] = await Promise.all([
      api.listStocks(authStore.accessToken),
      api.listItems(authStore.accessToken),
      api.listLocations(authStore.accessToken),
    ])

    rows.value = stocksData.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      locationId: row.locationId,
      item: row.itemName,
      tipe: typeMap[row.itemType] || row.itemType,
      lokasi: row.locationName,
      qty: row.qty,
      unit: row.unit,
      status: row.status,
    }))

    items.value = itemsData
    locations.value = locationsData
  } catch (error) {
    notifications.showPopup('Gagal memuat stok', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

async function submitAdjustStock() {
  try {
    await api.createTransaction(authStore.accessToken, {
      trxType: 'ADJUST',
      itemId: adjustForm.itemId,
      fromLocationId: adjustForm.locationId,
      qty: Number(adjustForm.qty),
      reason: adjustForm.reason,
    })

    showAdjustModal.value = false
    adjustForm.itemId = ''
    adjustForm.locationId = ''
    adjustForm.qty = ''
    adjustForm.reason = ''
    notifications.addNotification('Penyesuaian stok', 'Perubahan stok berhasil disimpan.')
    notifications.showPopup('Stok diperbarui', 'Penyesuaian stok berhasil diproses.', 'success')
    await loadData()
  } catch (error) {
    notifications.showPopup('Gagal simpan penyesuaian', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

onMounted(async () => {
  await loadData()
})
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Stok Inventaris" subtitle="Pantau stok per lokasi dengan cepat">
      <template #actions>
        <button class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white" @click="showAdjustModal = true">
          Penyesuaian Stok
        </button>
      </template>
    </PageHeader>

    <section class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          v-model="search"
          class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:max-w-sm"
          placeholder="Cari item atau lokasi"
        />
        <div class="flex flex-wrap gap-2">
          <button
            v-for="type in ['Semua', 'Consumable', 'Gas', 'Asset']"
            :key="type"
            class="rounded-lg px-3 py-2 text-sm font-semibold"
            :class="activeType === type ? 'border border-blue-200 bg-blue-50 text-blue-700' : 'border border-slate-200 text-slate-600'"
            @click="activeType = type"
          >
            {{ type }}
          </button>
        </div>
      </div>

      <div class="mt-4 overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500">
            <tr>
              <th class="px-3 py-3 font-semibold">Item</th>
              <th class="px-3 py-3 font-semibold">Lokasi</th>
              <th class="px-3 py-3 text-right font-semibold">Jumlah</th>
              <th class="px-3 py-3 text-center font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td class="px-3 py-3 text-slate-500" colspan="4">Memuat data stok...</td>
            </tr>
            <tr v-for="row in filteredRows" :key="`${row.item}-${row.lokasi}`" class="border-b border-slate-100">
              <td class="px-3 py-3 font-semibold text-slate-900">{{ row.item }}</td>
              <td class="px-3 py-3 text-slate-600">{{ row.lokasi }}</td>
              <td class="px-3 py-3 text-right font-semibold text-slate-900">{{ row.qty }} {{ row.unit }}</td>
              <td class="px-3 py-3 text-center">
                <span class="rounded-full px-2.5 py-1 text-xs font-bold" :class="statusClass(row.status)">
                  {{ row.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <BaseModal :show="showAdjustModal" title="Form Penyesuaian Stok" @close="showAdjustModal = false">
      <form class="space-y-3" @submit.prevent="submitAdjustStock">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Item</span>
          <select v-model="adjustForm.itemId" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required>
            <option value="" disabled>Pilih item</option>
            <option v-for="item in items" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Lokasi</span>
          <select v-model="adjustForm.locationId" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required>
            <option value="" disabled>Pilih lokasi</option>
            <option v-for="location in locations" :key="location.id" :value="location.id">{{ location.name }}</option>
          </select>
        </label>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Perubahan Qty</span>
          <input
            v-model="adjustForm.qty"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Contoh: +2 atau -1"
            required
          />
        </label>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Alasan</span>
          <textarea v-model="adjustForm.reason" class="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Isi alasan penyesuaian" required />
        </label>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="showAdjustModal = false">Batal</button>
          <button type="submit" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Simpan</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
