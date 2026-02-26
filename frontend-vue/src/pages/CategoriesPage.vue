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
const isLoading = ref(false)
const showCreateModal = ref(false)
const editId = ref('')
const form = reactive({
  name: '',
  type: 'CONSUMABLE',
})

const canManageCategories = computed(() => ['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN'].includes(authStore.user?.role || ''))

async function loadCategories() {
  if (!authStore.accessToken) return

  isLoading.value = true
  try {
    const data = await api.listCategories(authStore.accessToken)
    rows.value = data.map((item) => ({
      id: item.id,
      name: item.name?.replace(/^(CONSUMABLE|GAS|ASSET)\s-\s/i, ''),
      type: item.type || 'CONSUMABLE',
      code: `${item.type || 'CONSUMABLE'}_${item.name?.replace(/^(CONSUMABLE|GAS|ASSET)\s-\s/i, '').toUpperCase().replaceAll(' ', '_')}`,
    }))
  } catch (error) {
    notifications.showPopup('Gagal memuat kategori', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

async function submitCategory() {
  if (!canManageCategories.value) {
    notifications.showPopup('Akses ditolak', 'Hanya Admin tenant yang dapat menambah kategori.', 'error')
    return
  }

  try {
    const normalized = form.name.trim().toLowerCase()
    if (!normalized) {
      notifications.showPopup('Nama kategori wajib', 'Isi nama kategori terlebih dahulu.', 'error')
      return
    }

    if (rows.value.some((row) => row.id !== editId.value && row.name.trim().toLowerCase() === normalized && row.type === form.type)) {
      notifications.showPopup('Kategori duplikat', 'Nama kategori sudah ada, gunakan nama lain.', 'error')
      return
    }

    if (editId.value) {
      await api.updateCategory(authStore.accessToken, editId.value, {
        name: form.name.trim(),
        type: form.type,
      })
    } else {
      await api.createCategory(authStore.accessToken, {
        name: form.name.trim(),
        type: form.type,
      })
    }

    showCreateModal.value = false
    form.name = ''
    form.type = 'CONSUMABLE'
    editId.value = ''
    notifications.showPopup('Kategori tersimpan', 'Kategori berhasil disimpan.', 'success')
    await loadCategories()
  } catch (error) {
    notifications.showPopup('Gagal menyimpan kategori', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

function openCreate() {
  editId.value = ''
  form.name = ''
  form.type = 'CONSUMABLE'
  showCreateModal.value = true
}

function openEdit(row) {
  editId.value = row.id
  form.name = row.name
  form.type = row.type
  showCreateModal.value = true
}

function closeModal() {
  showCreateModal.value = false
  editId.value = ''
  form.name = ''
  form.type = 'CONSUMABLE'
}

async function removeCategory(row) {
  if (!canManageCategories.value) return

  const ok = window.confirm(`Hapus kategori ${row.name}?`)
  if (!ok) return

  try {
    await api.deleteCategory(authStore.accessToken, row.id)
    notifications.showPopup('Kategori dihapus', 'Kategori berhasil dihapus.', 'success')
    await loadCategories()
  } catch (error) {
    notifications.showPopup('Gagal hapus kategori', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

function typeLabel(type) {
  if (type === 'GAS') return 'Gas'
  if (type === 'ASSET') return 'Asset'
  return 'Consumable'
}

function typeHint(type) {
  if (type === 'ASSET') return 'Untuk barang tidak habis pakai, cek kondisi (%) di checklist.'
  if (type === 'GAS') return 'Untuk tabung gas, stok dapat berkurang saat transaksi OUT.'
  return 'Untuk barang habis pakai, stok berkurang saat transaksi OUT.'
}

onMounted(async () => {
  await loadCategories()
})
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Kategori" subtitle="Kelola kategori produk agar input item lebih cepat">
      <template #actions>
        <button
          v-if="canManageCategories"
          class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white"
          @click="openCreate"
        >
          Tambah Kategori
        </button>
      </template>
    </PageHeader>

    <section class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <article class="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <p class="text-sm font-bold text-emerald-800">Consumable</p>
        <p class="mt-1 text-xs text-emerald-700">Stok dapat dikurangi pada transaksi OUT (contoh: beras, minyak, sabun).</p>
      </article>
      <article class="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p class="text-sm font-bold text-amber-800">Gas</p>
        <p class="mt-1 text-xs text-amber-700">Stok tabung/isi gas dipantau seperti consumable.</p>
      </article>
      <article class="rounded-xl border border-sky-200 bg-sky-50 p-3">
        <p class="text-sm font-bold text-sky-800">Asset</p>
        <p class="mt-1 text-xs text-sky-700">Kondisi dipantau dalam persen melalui checklist (contoh: kompor, kulkas).</p>
      </article>
    </section>

    <section class="rounded-xl border border-slate-200 bg-white p-4">
      <div v-if="isLoading" class="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">Memuat data kategori...</div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500">
            <tr>
              <th class="px-3 py-3 font-semibold">Nama</th>
              <th class="px-3 py-3 font-semibold">Jenis</th>
              <th class="px-3 py-3 font-semibold">Kode</th>
              <th class="px-3 py-3 font-semibold">Contoh Aturan</th>
              <th class="px-3 py-3 font-semibold">Status</th>
              <th v-if="canManageCategories" class="px-3 py-3 text-right font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="border-b border-slate-100">
              <td class="px-3 py-3 font-semibold text-slate-900">{{ row.name }}</td>
              <td class="px-3 py-3 text-slate-700">{{ typeLabel(row.type) }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.code }}</td>
              <td class="px-3 py-3 text-xs text-slate-500">{{ typeHint(row.type) }}</td>
              <td class="px-3 py-3">
                <span class="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">Aktif</span>
              </td>
              <td v-if="canManageCategories" class="px-3 py-3 text-right">
                <div class="inline-flex gap-2">
                  <button class="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-700" @click="openEdit(row)">Edit</button>
                  <button class="rounded-lg border border-rose-200 px-2 py-1 text-xs font-bold text-rose-700" @click="removeCategory(row)">Hapus</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <BaseModal :show="showCreateModal" :title="editId ? 'Edit Kategori' : 'Tambah Kategori'" @close="closeModal">
      <form class="space-y-3" @submit.prevent="submitCategory">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Nama Kategori</span>
          <input v-model="form.name" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Contoh: Sayuran" required />
        </label>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Jenis Kategori</span>
          <select v-model="form.type" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="CONSUMABLE">Consumable</option>
            <option value="GAS">Gas</option>
            <option value="ASSET">Asset</option>
          </select>
        </label>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="closeModal">Batal</button>
          <button type="submit" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Simpan</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
