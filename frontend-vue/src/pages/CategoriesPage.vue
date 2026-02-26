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
const form = reactive({
  name: '',
})

const canManageCategories = computed(() => ['SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN'].includes(authStore.user?.role || ''))

async function loadCategories() {
  if (!authStore.accessToken) return

  isLoading.value = true
  try {
    const data = await api.listCategories(authStore.accessToken)
    rows.value = data.map((item) => ({
      id: item.id,
      name: item.name,
      code: item.name.toUpperCase().replaceAll(' ', '_'),
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

    if (rows.value.some((row) => row.name.trim().toLowerCase() === normalized)) {
      notifications.showPopup('Kategori duplikat', 'Nama kategori sudah ada, gunakan nama lain.', 'error')
      return
    }

    await api.createCategory(authStore.accessToken, {
      name: form.name.trim(),
    })

    showCreateModal.value = false
    form.name = ''
    notifications.showPopup('Kategori tersimpan', 'Kategori baru berhasil ditambahkan.', 'success')
    await loadCategories()
  } catch (error) {
    notifications.showPopup('Gagal menyimpan kategori', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
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
          @click="showCreateModal = true"
        >
          Tambah Kategori
        </button>
      </template>
    </PageHeader>

    <section class="rounded-xl border border-slate-200 bg-white p-4">
      <div v-if="isLoading" class="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">Memuat data kategori...</div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500">
            <tr>
              <th class="px-3 py-3 font-semibold">Nama</th>
              <th class="px-3 py-3 font-semibold">Kode</th>
              <th class="px-3 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="border-b border-slate-100">
              <td class="px-3 py-3 font-semibold text-slate-900">{{ row.name }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.code }}</td>
              <td class="px-3 py-3">
                <span class="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">Aktif</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <BaseModal :show="showCreateModal" title="Tambah Kategori" @close="showCreateModal = false">
      <form class="space-y-3" @submit.prevent="submitCategory">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Nama Kategori</span>
          <input v-model="form.name" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Contoh: Sayuran" required />
        </label>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="showCreateModal = false">Batal</button>
          <button type="submit" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Simpan</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
