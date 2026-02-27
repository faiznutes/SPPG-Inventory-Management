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
const categories = ref([])
const isLoading = ref(false)
const activeType = ref('Semua')
const search = ref('')
const showAdjustModal = ref(false)
const showBulkAdjustModal = ref(false)
const showCreateItemModal = ref(false)
const showBulkItemModal = ref(false)
const showCategoryPicker = ref(false)
const categorySearch = ref('')
const categoryTypeFilter = ref('ALL')
const selectedStockIds = ref([])

const bulkAdjustForm = reactive({
  reason: '',
  qtyByStockId: {},
})
const bulkItemSearch = ref('')
const selectedItemIds = ref([])
const bulkAction = ref('DEACTIVATE')

const bulkItemForm = reactive({
  categoryId: '',
  minStock: '',
  reorderQty: '',
  unit: '',
  type: '',
})

const canCreateProduct = computed(() => authStore.canEditTenantData && ['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(authStore.user?.role || ''))

const selectedCategoryLabel = computed(() => {
  if (!createItemForm.categoryId) return 'Tanpa kategori'
  const found = categories.value.find((row) => row.id === createItemForm.categoryId)
  if (!found) return 'Tanpa kategori'
  return `${categoryDisplayName(found.name)} (${typeMap[found.type] || found.type})`
})

const filteredCategories = computed(() => {
  const q = categorySearch.value.trim().toLowerCase()
  return categories.value.filter((row) => {
    const passType = categoryTypeFilter.value === 'ALL' || row.type === categoryTypeFilter.value
    const passSearch = !q || categoryDisplayName(row.name).toLowerCase().includes(q)
    return passType && passSearch
  })
})

const bulkFilteredItems = computed(() => {
  const q = bulkItemSearch.value.trim().toLowerCase()
  return items.value.filter((item) => {
    if (!q) return true
    return item.name.toLowerCase().includes(q) || String(item.sku || '').toLowerCase().includes(q)
  })
})

const adjustForm = reactive({
  itemId: '',
  locationId: '',
  qty: '',
  reason: '',
})

const createItemForm = reactive({
  name: '',
  sku: '',
  categoryId: '',
  type: 'CONSUMABLE',
  unit: 'pcs',
  minStock: '0',
  reorderQty: '',
})

const typeMap = {
  CONSUMABLE: 'Barang habis beli lagi',
  GAS: 'Habis tapi isi ulang',
  ASSET: 'Tidak habis tapi bisa rusak',
}

const filteredRows = computed(() => {
  const normalizedSearch = search.value.trim().toLowerCase()

  return rows.value.filter((row) => {
    const passType = activeType.value === 'Semua' || row.kategori === activeType.value
    const passSearch =
      !normalizedSearch ||
      row.item.toLowerCase().includes(normalizedSearch) ||
      row.lokasi.toLowerCase().includes(normalizedSearch)

    return passType && passSearch
  })
})

const selectedStockRows = computed(() => rows.value.filter((row) => selectedStockIds.value.includes(row.id)))

function statusClass(status) {
  if (status === 'Habis') return 'bg-rose-100 text-rose-700'
  if (status === 'Menipis') return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

function categoryDisplayName(name) {
  return String(name || '').replace(/^(CONSUMABLE|GAS|ASSET)\s-\s/i, '')
}

function formatQty(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : String(n)
}

function cleanUnit(value) {
  return String(value || '')
    .trim()
    .replace(/^\d+\s*(?=[A-Za-z])/g, '')
}

function formatQtyUnit(qty, unit) {
  const cleanedUnit = cleanUnit(unit)
  if (!cleanedUnit) return formatQty(qty)
  return `${formatQty(qty)} ${cleanedUnit}`
}

function openCategoryPicker() {
  categorySearch.value = ''
  categoryTypeFilter.value = createItemForm.type || 'ALL'
  showCategoryPicker.value = true
}

function chooseCategory(category) {
  createItemForm.categoryId = category.id
  createItemForm.type = category.type || createItemForm.type
  showCategoryPicker.value = false
}

function clearCategory() {
  createItemForm.categoryId = ''
}

function toggleStockSelection(stockId) {
  if (selectedStockIds.value.includes(stockId)) {
    selectedStockIds.value = selectedStockIds.value.filter((id) => id !== stockId)
    return
  }
  selectedStockIds.value.push(stockId)
}

function clearStockSelection() {
  selectedStockIds.value = []
}

function openBulkAdjustModal() {
  if (!selectedStockIds.value.length) {
    notifications.showPopup('Belum ada pilihan', 'Pilih minimal 1 baris stok untuk penyesuaian terpilih.', 'error')
    return
  }

  bulkAdjustForm.reason = ''
  bulkAdjustForm.qtyByStockId = {}
  selectedStockRows.value.forEach((row) => {
    bulkAdjustForm.qtyByStockId[row.id] = ''
  })
  showBulkAdjustModal.value = true
}

async function submitBulkAdjustStock() {
  try {
    const reason = bulkAdjustForm.reason.trim()
    if (!reason) {
      notifications.showPopup('Alasan wajib', 'Isi alasan untuk penyesuaian stok terpilih.', 'error')
      return
    }

    const adjustments = selectedStockRows.value
      .map((row) => ({
        itemId: row.itemId,
        locationId: row.locationId,
        qty: Number(bulkAdjustForm.qtyByStockId[row.id] || 0),
      }))
      .filter((row) => Number.isFinite(row.qty) && row.qty !== 0)

    if (!adjustments.length) {
      notifications.showPopup('Qty belum valid', 'Isi minimal satu perubahan qty yang tidak 0.', 'error')
      return
    }

    await api.bulkAdjustTransactions(authStore.accessToken, {
      reason,
      adjustments,
    })

    showBulkAdjustModal.value = false
    clearStockSelection()
    notifications.showPopup('Penyesuaian terpilih berhasil', 'Perubahan stok terpilih berhasil diproses.', 'success')
    await loadData()
  } catch (error) {
    notifications.showPopup('Penyesuaian terpilih gagal', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

function resetBulkItemForm() {
  bulkItemForm.categoryId = ''
  bulkItemForm.minStock = ''
  bulkItemForm.reorderQty = ''
  bulkItemForm.unit = ''
  bulkItemForm.type = ''
}

function openBulkItemModal() {
  if (!canCreateProduct.value) {
    notifications.showPopup('Akses ditolak', 'Role kamu belum memiliki akses aksi pilih produk.', 'error')
    return
  }

  selectedItemIds.value = []
  bulkItemSearch.value = ''
  bulkAction.value = 'DEACTIVATE'
  resetBulkItemForm()
  showBulkItemModal.value = true
}

function toggleBulkItemSelection(itemId) {
  if (selectedItemIds.value.includes(itemId)) {
    selectedItemIds.value = selectedItemIds.value.filter((id) => id !== itemId)
    return
  }
  selectedItemIds.value.push(itemId)
}

async function submitBulkItemAction() {
  try {
    if (!selectedItemIds.value.length) {
      notifications.showPopup('Belum ada item', 'Pilih minimal satu item untuk aksi pilihan.', 'error')
      return
    }

    let payload = undefined
    if (bulkAction.value === 'UPDATE') {
      payload = {}
      if (bulkItemForm.categoryId) payload.categoryId = bulkItemForm.categoryId
      if (bulkItemForm.minStock !== '') payload.minStock = Number(bulkItemForm.minStock)
      if (bulkItemForm.reorderQty !== '') payload.reorderQty = Number(bulkItemForm.reorderQty)
      if (bulkItemForm.unit.trim()) payload.unit = bulkItemForm.unit.trim()
      if (bulkItemForm.type) payload.type = bulkItemForm.type

      if (!Object.keys(payload).length) {
        notifications.showPopup('Field update kosong', 'Isi minimal satu field untuk update item terpilih.', 'error')
        return
      }
    }

    const result = await api.bulkItemAction(authStore.accessToken, {
      ids: selectedItemIds.value,
      action: bulkAction.value,
      payload,
    })

    showBulkItemModal.value = false
    notifications.showPopup('Aksi pilihan selesai', result.message || 'Aksi item terpilih berhasil diproses.', 'success')
    await loadData()
  } catch (error) {
    notifications.showPopup('Aksi pilihan gagal', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function loadData() {
  if (!authStore.accessToken) return

  isLoading.value = true
  try {
    const [stocksData, itemsData, locationsData, categoriesData] = await Promise.all([
      api.listStocks(authStore.accessToken),
      api.listItems(authStore.accessToken),
      api.listLocations(authStore.accessToken),
      api.listCategories(authStore.accessToken),
    ])

    rows.value = stocksData.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      locationId: row.locationId,
      item: row.itemName,
      kategori: typeMap[row.itemType] || row.itemType,
      lokasi: row.locationName,
      qty: Number.isFinite(Number(row.qty)) ? Number(row.qty) : 0,
      unit: cleanUnit(row.unit),
      status: row.status,
    }))

    items.value = itemsData
    locations.value = locationsData
    categories.value = categoriesData
  } catch (error) {
    notifications.showPopup('Gagal memuat stok', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

async function submitCreateProduct() {
  if (!canCreateProduct.value) {
    notifications.showPopup('Akses ditolak', 'Role kamu belum memiliki akses tambah produk.', 'error')
    return
  }

  try {
    const productName = createItemForm.name.trim()
    const normalizedName = productName.toLowerCase()
    const sku = createItemForm.sku.trim()

    if (!productName) {
      notifications.showPopup('Nama produk wajib', 'Isi nama produk terlebih dahulu.', 'error')
      return
    }

    if (items.value.some((item) => item.name.trim().toLowerCase() === normalizedName)) {
      notifications.showPopup('Produk duplikat', 'Nama produk sudah ada, gunakan nama lain.', 'error')
      return
    }

    if (sku && items.value.some((item) => (item.sku || '').trim().toLowerCase() === sku.toLowerCase())) {
      notifications.showPopup('SKU duplikat', 'SKU sudah dipakai produk lain.', 'error')
      return
    }

    const minStock = Number(createItemForm.minStock || 0)
    const reorderQty = createItemForm.reorderQty ? Number(createItemForm.reorderQty) : undefined
    if (!Number.isFinite(minStock) || minStock < 0) {
      notifications.showPopup('Minimal stok tidak valid', 'Isi minimal stok dengan angka 0 atau lebih.', 'error')
      return
    }
    if (reorderQty !== undefined && (!Number.isFinite(reorderQty) || reorderQty < 0)) {
      notifications.showPopup('Reorder qty tidak valid', 'Isi reorder qty dengan angka 0 atau lebih.', 'error')
      return
    }

    await api.createItem(authStore.accessToken, {
      name: productName,
      sku: sku || undefined,
      categoryId: createItemForm.categoryId || undefined,
      type: createItemForm.type,
      unit: createItemForm.unit,
      minStock,
      reorderQty,
    })

    showCreateItemModal.value = false
    createItemForm.name = ''
    createItemForm.sku = ''
    createItemForm.categoryId = ''
    createItemForm.type = 'CONSUMABLE'
    createItemForm.unit = 'pcs'
    createItemForm.minStock = '0'
    createItemForm.reorderQty = ''
    notifications.showPopup('Produk ditambahkan', 'Produk baru berhasil disimpan.', 'success')
    await loadData()
  } catch (error) {
    notifications.showPopup('Gagal tambah produk', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function submitAdjustStock() {
  try {
    if (!locations.value.length) {
      notifications.showPopup('Lokasi belum tersedia', 'Tambahkan lokasi dulu sebelum penyesuaian stok.', 'error')
      return
    }

    const qty = Number(adjustForm.qty)
    if (!Number.isFinite(qty) || qty === 0) {
      notifications.showPopup('Qty tidak valid', 'Isi perubahan qty dengan angka, tidak boleh 0.', 'error')
      return
    }

    const reason = adjustForm.reason.trim()
    if (!reason) {
      notifications.showPopup('Alasan wajib', 'Isi alasan penyesuaian stok.', 'error')
      return
    }

    await api.createTransaction(authStore.accessToken, {
      trxType: 'ADJUST',
      itemId: adjustForm.itemId,
      fromLocationId: adjustForm.locationId,
      qty,
      reason,
    })

    showAdjustModal.value = false
    adjustForm.itemId = ''
    adjustForm.locationId = ''
    adjustForm.qty = ''
    adjustForm.reason = ''
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
        <button
          v-if="selectedStockIds.length"
          class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
          @click="openBulkAdjustModal"
        >
          Penyesuaian Pilihan ({{ selectedStockIds.length }})
        </button>
        <button
          v-if="selectedStockIds.length"
          class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
          @click="clearStockSelection"
        >
          Reset Pilihan
        </button>
        <button
          v-if="canCreateProduct"
          class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
          @click="openBulkItemModal"
        >
          Pilih Produk
        </button>
        <button
          v-if="canCreateProduct"
          class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
          @click="showCreateItemModal = true"
        >
          Tambah Produk
        </button>
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
            v-for="type in ['Semua', typeMap.CONSUMABLE, typeMap.GAS, typeMap.ASSET]"
            :key="type"
            class="rounded-lg px-3 py-2 text-sm font-semibold"
            :class="activeType === type ? 'border border-blue-200 bg-blue-50 text-blue-700' : 'border border-slate-200 text-slate-600'"
            @click="activeType = type"
          >
            {{ type }}
          </button>
        </div>
      </div>

      <div class="mt-4 space-y-2 sm:hidden">
        <article v-if="isLoading" class="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">Memuat data stok...</article>
        <article v-for="row in filteredRows" :key="`m-${row.item}-${row.lokasi}`" class="rounded-lg border border-slate-200 p-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-sm font-bold text-slate-900">{{ row.item }}</p>
              <p class="text-xs text-slate-500">{{ row.kategori }} - {{ row.lokasi }}</p>
            </div>
            <div class="flex items-center gap-2">
              <input :checked="selectedStockIds.includes(row.id)" type="checkbox" @change="toggleStockSelection(row.id)" />
              <span class="rounded-full px-2 py-0.5 text-[11px] font-bold" :class="statusClass(row.status)">{{ row.status }}</span>
            </div>
          </div>
          <p class="mt-2 text-sm font-semibold text-slate-800">{{ formatQtyUnit(row.qty, row.unit) }}</p>
        </article>
      </div>

      <div class="mt-4 hidden overflow-x-auto sm:block">
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
              <td class="px-3 py-3 text-slate-600">{{ row.kategori }} - {{ row.lokasi }}</td>
              <td class="px-3 py-3 text-right font-semibold text-slate-900">{{ formatQtyUnit(row.qty, row.unit) }}</td>
              <td class="px-3 py-3 text-center">
                <input class="mr-2 align-middle" :checked="selectedStockIds.includes(row.id)" type="checkbox" @change="toggleStockSelection(row.id)" />
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

    <BaseModal :show="showBulkAdjustModal" title="Penyesuaian Stok Terpilih" max-width-class="max-w-3xl" @close="showBulkAdjustModal = false">
      <form class="space-y-3" @submit.prevent="submitBulkAdjustStock">
        <p class="text-sm text-slate-600">Isi perubahan qty untuk beberapa baris stok sekaligus. Nilai positif menambah, negatif mengurangi.</p>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Alasan Penyesuaian</span>
          <textarea
            v-model="bulkAdjustForm.reason"
            class="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Contoh: Stock opname akhir minggu (item terpilih)"
            required
          />
        </label>

        <div class="max-h-72 overflow-auto rounded-lg border border-slate-200">
          <div
            v-for="row in selectedStockRows"
            :key="`bulk-stock-${row.id}`"
            class="grid grid-cols-1 gap-2 border-b border-slate-100 px-3 py-2 sm:grid-cols-[1fr_220px] sm:items-center"
          >
            <div>
              <p class="text-sm font-semibold text-slate-900">{{ row.item }} - {{ row.lokasi }}</p>
              <p class="text-xs text-slate-500">Stok saat ini: {{ formatQtyUnit(row.qty, row.unit) }}</p>
            </div>
            <input
              v-model="bulkAdjustForm.qtyByStockId[row.id]"
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Contoh: +2 atau -1"
            />
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="showBulkAdjustModal = false">
            Batal
          </button>
          <button type="submit" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Terapkan Pilihan</button>
        </div>
      </form>
    </BaseModal>

    <BaseModal :show="showCreateItemModal" title="Tambah Produk" @close="showCreateItemModal = false">
      <form class="space-y-3" @submit.prevent="submitCreateProduct">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Nama Produk</span>
          <input v-model="createItemForm.name" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Contoh: Minyak Goreng" required />
        </label>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">SKU</span>
          <input v-model="createItemForm.sku" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Contoh: MG-001" />
        </label>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Kategori</span>
          <div class="flex gap-2">
            <button type="button" class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm" @click="openCategoryPicker">
              {{ selectedCategoryLabel }}
            </button>
            <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700" @click="clearCategory">Reset</button>
          </div>
        </label>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Model Kategori Operasional</span>
            <select v-model="createItemForm.type" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="CONSUMABLE">Barang habis beli lagi</option>
              <option value="GAS">Habis tapi isi ulang</option>
              <option value="ASSET">Tidak habis tapi bisa rusak</option>
            </select>
          </label>

          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Satuan</span>
            <input v-model="createItemForm.unit" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="pcs, liter, kg" required />
          </label>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Minimal Stok</span>
            <input v-model="createItemForm.minStock" type="number" min="0" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" required />
          </label>

          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Reorder Qty</span>
            <input v-model="createItemForm.reorderQty" type="number" min="0" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Opsional" />
          </label>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="showCreateItemModal = false">Batal</button>
          <button type="submit" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Simpan Produk</button>
        </div>
      </form>
    </BaseModal>

    <BaseModal :show="showCategoryPicker" title="Pilih Kategori" max-width-class="max-w-xl" @close="showCategoryPicker = false">
      <div class="space-y-3">
        <input v-model="categorySearch" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Cari kategori..." />
        <div class="flex flex-wrap gap-2">
          <button
            v-for="type in ['ALL', 'CONSUMABLE', 'GAS', 'ASSET']"
            :key="type"
            class="rounded-lg px-2.5 py-1.5 text-xs font-bold"
            :class="categoryTypeFilter === type ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'border border-slate-200 text-slate-600'"
            @click="categoryTypeFilter = type"
          >
            {{ type === 'ALL' ? 'Semua' : typeMap[type] }}
          </button>
        </div>
        <div class="max-h-72 overflow-auto rounded-lg border border-slate-200">
          <button
            v-for="category in filteredCategories"
            :key="category.id"
            type="button"
            class="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
            @click="chooseCategory(category)"
          >
            <span class="font-semibold text-slate-800">{{ categoryDisplayName(category.name) }}</span>
            <span class="text-xs font-bold text-slate-500">{{ typeMap[category.type] || category.type }}</span>
          </button>
        </div>
      </div>
    </BaseModal>

    <BaseModal :show="showBulkItemModal" title="Aksi Produk Terpilih" max-width-class="max-w-2xl" @close="showBulkItemModal = false">
      <form class="space-y-3" @submit.prevent="submitBulkItemAction">
        <p class="text-sm text-slate-600">Pilih item produk lalu terapkan aksi pilihan.</p>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Aksi Pilihan</span>
          <select v-model="bulkAction" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="DEACTIVATE">Nonaktifkan Item</option>
            <option value="ACTIVATE">Aktifkan Item</option>
            <option value="DELETE">Hapus (Soft Delete)</option>
            <option value="UPDATE">Ubah Field Terpilih</option>
          </select>
        </label>

        <div v-if="bulkAction === 'UPDATE'" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Kategori (Opsional)</span>
            <select v-model="bulkItemForm.categoryId" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="">Tidak diubah</option>
              <option v-for="category in categories" :key="category.id" :value="category.id">
                {{ categoryDisplayName(category.name) }}
              </option>
            </select>
          </label>

          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Model Kategori (Opsional)</span>
            <select v-model="bulkItemForm.type" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="">Tidak diubah</option>
              <option value="CONSUMABLE">Barang habis beli lagi</option>
              <option value="GAS">Habis tapi isi ulang</option>
              <option value="ASSET">Tidak habis tapi bisa rusak</option>
            </select>
          </label>

          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Min Stock (Opsional)</span>
            <input v-model="bulkItemForm.minStock" type="number" min="0" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Tidak diubah" />
          </label>

          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Reorder Qty (Opsional)</span>
            <input v-model="bulkItemForm.reorderQty" type="number" min="0" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Tidak diubah" />
          </label>

          <label class="block sm:col-span-2">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Satuan (Opsional)</span>
            <input v-model="bulkItemForm.unit" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Tidak diubah" />
          </label>
        </div>

        <input v-model="bulkItemSearch" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Cari item untuk dipilih" />

        <div class="max-h-72 overflow-auto rounded-lg border border-slate-200">
          <label
            v-for="item in bulkFilteredItems"
            :key="`bulk-${item.id}`"
            class="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-sm"
          >
            <div>
              <p class="font-semibold text-slate-900">{{ item.name }}</p>
              <p class="text-xs text-slate-500">{{ item.sku || '-' }} - {{ typeMap[item.type] || item.type }}</p>
            </div>
            <input :checked="selectedItemIds.includes(item.id)" type="checkbox" @change="toggleBulkItemSelection(item.id)" />
          </label>
        </div>

        <p class="text-xs text-slate-500">Dipilih: {{ selectedItemIds.length }} item</p>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="showBulkItemModal = false">
            Batal
          </button>
          <button type="submit" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Terapkan Pilihan</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
