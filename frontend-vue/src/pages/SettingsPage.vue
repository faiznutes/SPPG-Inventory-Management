<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '../components/common/PageHeader.vue'
import BaseModal from '../components/common/BaseModal.vue'
import { useNotificationsStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'

const users = ref([])
const locations = ref([])
const categories = ref([])
const isLoading = ref(false)

const activeTab = ref('Pengguna')
const showInputModal = ref(false)
const notifications = useNotificationsStore()
const authStore = useAuthStore()
const form = reactive({
  name: '',
  username: '',
  email: '',
  role: 'STAFF',
  password: '',
  description: '',
})

const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const canManageUsers = computed(() => authStore.user?.role === 'SUPER_ADMIN')
const canAddInTab = computed(() => activeTab.value !== 'Pengguna' || canManageUsers.value)

const currentRows = computed(() => {
  if (activeTab.value === 'Lokasi') return locations.value
  if (activeTab.value === 'Kategori') return categories.value
  return users.value
})

const tableHeaders = computed(() => {
  if (activeTab.value === 'Lokasi') return ['Nama', 'Deskripsi', 'Status']
  if (activeTab.value === 'Kategori') return ['Nama', 'Kode', 'Status']
  return ['Nama', 'Role', 'Status']
})

function resetForm() {
  form.name = ''
  form.username = ''
  form.email = ''
  form.role = 'STAFF'
  form.password = ''
  form.description = ''
}

function toStatusLabel(value) {
  return value ? 'Aktif' : 'Nonaktif'
}

function resetPasswordForm() {
  passwordForm.currentPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
}

async function loadData() {
  if (!authStore.accessToken) return

  isLoading.value = true
  try {
    const [locationsData, categoriesData] = await Promise.all([
      api.listLocations(authStore.accessToken),
      api.listCategories(authStore.accessToken),
    ])

    let usersData = []
    if (canManageUsers.value) {
      usersData = await api.listUsers(authStore.accessToken)
    }

    users.value = usersData.map((item) => ({
      nama: item.name,
      role: item.role,
      status: toStatusLabel(item.isActive),
    }))

    locations.value = locationsData.map((item) => ({
      nama: item.name,
      deskripsi: item.description || '-',
      status: 'Aktif',
    }))

    categories.value = categoriesData.map((item) => ({
      nama: item.name,
      kode: item.name.toUpperCase().replaceAll(' ', '_'),
      status: 'Aktif',
    }))
  } catch (error) {
    notifications.showPopup('Gagal memuat data', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

async function saveData() {
  try {
    if (activeTab.value === 'Pengguna') {
      if (!canManageUsers.value) {
        notifications.showPopup('Akses ditolak', 'Hanya Super Admin yang dapat menambahkan pengguna.', 'error')
        return
      }

      await api.createUser(authStore.accessToken, {
        name: form.name,
        username: form.username,
        email: form.email || undefined,
        role: form.role,
        password: form.password,
      })
    } else if (activeTab.value === 'Lokasi') {
      await api.createLocation(authStore.accessToken, {
        name: form.name,
        description: form.description || undefined,
      })
    } else {
      await api.createCategory(authStore.accessToken, {
        name: form.name,
      })
    }

    showInputModal.value = false
    notifications.addNotification('Pengaturan diperbarui', `${activeTab.value} berhasil diperbarui.`)
    notifications.showPopup('Data tersimpan', `${activeTab.value} berhasil disimpan.`, 'success')
    resetForm()
    await loadData()
  } catch (error) {
    notifications.showPopup('Gagal menyimpan', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function changeMyPassword() {
  if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
    notifications.showPopup('Form belum lengkap', 'Isi password lama, password baru, dan konfirmasi.', 'error')
    return
  }

  if (passwordForm.newPassword.length < 8) {
    notifications.showPopup('Password terlalu pendek', 'Password baru minimal 8 karakter.', 'error')
    return
  }

  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    notifications.showPopup('Konfirmasi tidak cocok', 'Ulangi konfirmasi password baru.', 'error')
    return
  }

  try {
    await api.changePassword(authStore.accessToken, {
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    })
    notifications.showPopup('Password diperbarui', 'Password akun berhasil diganti.', 'success')
    resetPasswordForm()
  } catch (error) {
    notifications.showPopup('Gagal ubah password', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

onMounted(async () => {
  await loadData()
})
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Pengaturan" subtitle="Kelola user, lokasi, kategori, dan konfigurasi dasar">
      <template #actions>
        <button
          v-if="canAddInTab"
          class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          @click="showInputModal = true"
        >
          Tambah {{ activeTab }}
        </button>
      </template>
    </PageHeader>

    <div v-if="activeTab === 'Pengguna' && !canManageUsers" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
      Hanya Super Admin yang dapat menambah atau mengelola pengguna.
    </div>

    <section class="rounded-xl border border-slate-200 bg-white p-4">
      <p class="text-sm font-bold text-slate-900">Keamanan Akun</p>
      <p class="mt-1 text-xs text-slate-500">Ganti password login akun kamu secara berkala untuk keamanan.</p>

      <form class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3" @submit.prevent="changeMyPassword">
        <input
          v-model="passwordForm.currentPassword"
          type="password"
          class="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Password saat ini"
        />
        <input
          v-model="passwordForm.newPassword"
          type="password"
          class="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Password baru (min. 8)"
        />
        <input
          v-model="passwordForm.confirmPassword"
          type="password"
          class="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Konfirmasi password baru"
        />
        <div class="sm:col-span-3 flex justify-end">
          <button type="submit" class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">Simpan Password</button>
        </div>
      </form>
    </section>

    <section class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          v-for="tab in ['Pengguna', 'Lokasi', 'Kategori']"
          :key="tab"
          class="rounded-lg px-3 py-2 text-sm font-semibold"
          :class="activeTab === tab ? 'bg-blue-50 text-blue-700' : 'border border-slate-200 text-slate-600'"
          @click="activeTab = tab"
        >
          {{ tab }}
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500">
            <tr>
              <th v-for="head in tableHeaders" :key="head" class="px-3 py-3 font-semibold">{{ head }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td class="px-3 py-3 text-slate-500" colspan="3">Memuat data...</td>
            </tr>
            <tr v-for="row in currentRows" :key="row.nama" class="border-b border-slate-100">
              <td class="px-3 py-3 font-semibold text-slate-900">{{ row.nama }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.role || row.deskripsi || row.kode }}</td>
              <td class="px-3 py-3">
                <span
                  class="rounded-full px-2.5 py-1 text-xs font-bold"
                  :class="(row.status || 'Aktif') === 'Aktif' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'"
                >
                  {{ row.status || 'Aktif' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <BaseModal :show="showInputModal" :title="`Tambah ${activeTab}`" @close="showInputModal = false">
      <form class="space-y-3" @submit.prevent="saveData">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Nama</span>
          <input
            v-model="form.name"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            :placeholder="`Nama ${activeTab.toLowerCase()}`"
          />
        </label>

        <label v-if="activeTab === 'Pengguna'" class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Username</span>
          <input v-model="form.username" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Username login" />
        </label>

        <label v-if="activeTab === 'Pengguna'" class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Email</span>
          <input v-model="form.email" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Email user" />
        </label>

        <label v-if="activeTab === 'Pengguna'" class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Role</span>
          <select v-model="form.role" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            <option value="TENANT_ADMIN">TENANT_ADMIN</option>
            <option value="KOORD_DAPUR">KOORD_DAPUR</option>
            <option value="KOORD_KEBERSIHAN">KOORD_KEBERSIHAN</option>
            <option value="KOORD_LAPANGAN">KOORD_LAPANGAN</option>
            <option value="STAFF">STAFF</option>
          </select>
        </label>

        <label v-if="activeTab === 'Pengguna'" class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Password</span>
          <input v-model="form.password" type="password" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Minimal 6 karakter" />
        </label>

        <label v-if="activeTab === 'Lokasi'" class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Keterangan</span>
          <textarea v-model="form.description" class="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Isi keterangan" />
        </label>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="showInputModal = false">Batal</button>
          <button type="submit" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Simpan</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
