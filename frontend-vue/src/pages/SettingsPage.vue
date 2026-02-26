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
const tenants = ref([])
const isLoading = ref(false)

const activeTab = ref('Pengguna')
const showInputModal = ref(false)
const showTenantDetailModal = ref(false)
const notifications = useNotificationsStore()
const authStore = useAuthStore()
const form = reactive({
  name: '',
  username: '',
  email: '',
  role: 'STAFF',
  categoryType: 'CONSUMABLE',
  password: '',
  description: '',
  code: '',
})

const selectedTenant = ref(null)
const tenantUsers = ref([])
const tenantLocations = ref([])

const tenantUserForm = reactive({
  id: '',
  name: '',
  username: '',
  email: '',
  role: 'ADMIN',
  jabatan: '',
  visibilityMode: 'edit',
  password: '',
})

const tenantLocationForm = reactive({
  id: '',
  name: '',
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
  if (activeTab.value === 'Tenant') return tenants.value
  if (activeTab.value === 'Lokasi') return locations.value
  if (activeTab.value === 'Kategori') return categories.value
  return users.value
})

const tableHeaders = computed(() => {
  if (activeTab.value === 'Tenant') return ['Nama Tenant', 'Kode', 'Status']
  if (activeTab.value === 'Lokasi') return ['Nama', 'Deskripsi', 'Status']
  if (activeTab.value === 'Kategori') return ['Nama', 'Kode', 'Status']
  return ['Nama', 'Role', 'Status']
})

function resetForm() {
  form.name = ''
  form.username = ''
  form.email = ''
  form.role = 'STAFF'
  form.categoryType = 'CONSUMABLE'
  form.password = ''
  form.description = ''
  form.code = ''
}

function toStatusLabel(value) {
  return value ? 'Aktif' : 'Nonaktif'
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function modeToFlags(mode) {
  if (mode === 'none') return { canView: false, canEdit: false }
  if (mode === 'view') return { canView: true, canEdit: false }
  return { canView: true, canEdit: true }
}

function flagsToMode(canView, canEdit) {
  if (!canView) return 'none'
  if (!canEdit) return 'view'
  return 'edit'
}

function resetTenantUserForm() {
  tenantUserForm.id = ''
  tenantUserForm.name = ''
  tenantUserForm.username = ''
  tenantUserForm.email = ''
  tenantUserForm.role = 'ADMIN'
  tenantUserForm.jabatan = ''
  tenantUserForm.visibilityMode = 'edit'
  tenantUserForm.password = ''
}

function resetTenantLocationForm() {
  tenantLocationForm.id = ''
  tenantLocationForm.name = ''
  tenantLocationForm.description = ''
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
    let tenantsData = []
    if (canManageUsers.value) {
      ;[usersData, tenantsData] = await Promise.all([api.listUsers(authStore.accessToken), api.listTenants(authStore.accessToken)])
    }

    users.value = usersData.map((item) => ({
      id: item.id,
      nama: item.name,
      role: item.role,
      status: toStatusLabel(item.isActive),
    })).filter((item) => ['SUPER_ADMIN', 'ADMIN'].includes(item.role))

    locations.value = locationsData.map((item) => ({
      nama: item.name,
      deskripsi: item.description || '-',
      status: 'Aktif',
    }))

    categories.value = categoriesData.map((item) => ({
      nama: item.name?.replace(/^(CONSUMABLE|GAS|ASSET)\s-\s/i, ''),
      kode: item.type || 'CONSUMABLE',
      status: 'Aktif',
    }))

    tenants.value = tenantsData.map((item) => ({
      id: item.id,
      nama: item.name,
      kode: item.code,
      status: item.isActive ? 'Aktif' : 'Nonaktif',
    }))
  } catch (error) {
    notifications.showPopup('Gagal memuat data', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

async function saveData() {
  try {
    if (activeTab.value === 'Tenant') {
      if (!canManageUsers.value) {
        notifications.showPopup('Akses ditolak', 'Hanya Super Admin yang dapat menambahkan tenant.', 'error')
        return
      }

      await api.createTenant(authStore.accessToken, {
        name: form.name.trim(),
        code: slugify(form.code || form.name),
      })
    } else if (activeTab.value === 'Pengguna') {
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
      if (!form.name?.trim()) {
        notifications.showPopup('Nama kategori wajib', 'Isi nama kategori dulu.', 'error')
        return
      }

      await api.createCategory(authStore.accessToken, {
        name: form.name.trim(),
        type: form.categoryType,
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

async function openTenantDetail(row) {
  if (!canManageUsers.value || !row?.id) return
  try {
    const detail = await api.getTenantDetail(authStore.accessToken, row.id)
    selectedTenant.value = detail.tenant
    tenantUsers.value = detail.users || []
    tenantLocations.value = detail.locations || []
    resetTenantUserForm()
    resetTenantLocationForm()
    showTenantDetailModal.value = true
  } catch (error) {
    notifications.showPopup('Gagal memuat tenant', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function addUserToTenant() {
  if (!selectedTenant.value) return
  try {
    if (!tenantUserForm.name.trim() || !tenantUserForm.username.trim() || !tenantUserForm.jabatan.trim()) {
      notifications.showPopup('Form user tenant belum lengkap', 'Isi nama, username, dan jabatan.', 'error')
      return
    }

    if (!tenantUserForm.id && !tenantUserForm.password) {
      notifications.showPopup('Password wajib', 'Password wajib diisi saat menambah user tenant.', 'error')
      return
    }

    const visibility = modeToFlags(tenantUserForm.visibilityMode)
    const payload = {
      name: tenantUserForm.name.trim(),
      username: tenantUserForm.username.trim(),
      email: tenantUserForm.email?.trim() || undefined,
      role: tenantUserForm.role,
      jabatan: tenantUserForm.jabatan.trim(),
      canView: visibility.canView,
      canEdit: visibility.canEdit,
      password: tenantUserForm.password,
    }

    if (tenantUserForm.id) {
      await api.updateTenantUser(authStore.accessToken, selectedTenant.value.id, tenantUserForm.id, {
        ...payload,
        password: payload.password || undefined,
      })
    } else {
      await api.addTenantUser(authStore.accessToken, selectedTenant.value.id, payload)
    }

    resetTenantUserForm()
    await openTenantDetail({ id: selectedTenant.value.id })
    notifications.showPopup('User tenant disimpan', 'Data pengguna tenant berhasil disimpan.', 'success')
  } catch (error) {
    notifications.showPopup('Gagal tambah user tenant', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function addLocationToTenant() {
  if (!selectedTenant.value) return
  try {
    if (!tenantLocationForm.name.trim()) {
      notifications.showPopup('Nama lokasi wajib', 'Isi nama lokasi tenant.', 'error')
      return
    }

    if (tenantLocationForm.id) {
      await api.updateTenantLocation(authStore.accessToken, selectedTenant.value.id, tenantLocationForm.id, {
        name: tenantLocationForm.name.trim(),
        description: tenantLocationForm.description || undefined,
      })
    } else {
      await api.addTenantLocation(authStore.accessToken, selectedTenant.value.id, {
        name: tenantLocationForm.name.trim(),
        description: tenantLocationForm.description || undefined,
      })
    }
    resetTenantLocationForm()
    await openTenantDetail({ id: selectedTenant.value.id })
    notifications.showPopup('Lokasi tenant disimpan', 'Lokasi tenant berhasil disimpan.', 'success')
  } catch (error) {
    notifications.showPopup('Gagal tambah lokasi tenant', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

function editTenantUser(user) {
  tenantUserForm.id = user.id
  tenantUserForm.name = user.name || ''
  tenantUserForm.username = user.username || ''
  tenantUserForm.email = user.email || ''
  tenantUserForm.role = user.role === 'STAFF' ? 'STAFF' : 'ADMIN'
  tenantUserForm.jabatan = user.jabatan || ''
  tenantUserForm.visibilityMode = flagsToMode(user.canView, user.canEdit)
  tenantUserForm.password = ''
}

function editTenantLocation(location) {
  tenantLocationForm.id = location.id
  tenantLocationForm.name = location.name || ''
  tenantLocationForm.description = location.description || ''
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
  if (!canManageUsers.value && activeTab.value === 'Pengguna') {
    activeTab.value = 'Lokasi'
  }
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
          v-for="tab in canManageUsers ? ['Tenant', 'Pengguna', 'Lokasi', 'Kategori'] : ['Lokasi', 'Kategori']"
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
            <tr
              v-for="row in currentRows"
              :key="row.id || row.nama"
              class="border-b border-slate-100"
              :class="activeTab === 'Tenant' ? 'cursor-pointer hover:bg-slate-50' : ''"
              @click="activeTab === 'Tenant' ? openTenantDetail(row) : null"
            >
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

        <label v-if="activeTab === 'Tenant'" class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Kode Tenant</span>
          <input v-model="form.code" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="contoh: sppg-tambak-wedi" />
        </label>

        <label v-if="activeTab === 'Kategori'" class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Jenis</span>
          <select v-model="form.categoryType" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="CONSUMABLE">Consumable</option>
            <option value="GAS">Gas</option>
            <option value="ASSET">Asset</option>
          </select>
        </label>

        <label v-if="activeTab === 'Pengguna'" class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Email</span>
          <input v-model="form.email" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Email user" />
        </label>

        <label v-if="activeTab === 'Pengguna'" class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Role</span>
          <select v-model="form.role" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            <option value="ADMIN">ADMIN</option>
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

    <BaseModal :show="showTenantDetailModal" :title="`Detail Tenant ${selectedTenant?.name || ''}`" max-width-class="max-w-4xl" @close="showTenantDetailModal = false">
      <div class="space-y-4">
        <section class="rounded-lg border border-slate-200 p-3">
          <p class="text-sm font-bold text-slate-900">User Tenant</p>
          <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <input v-model="tenantUserForm.name" class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" placeholder="Nama" />
            <input v-model="tenantUserForm.username" class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" placeholder="Username" />
            <input v-model="tenantUserForm.email" class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" placeholder="Email" />
            <select v-model="tenantUserForm.role" class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
              <option value="ADMIN">ADMIN</option>
              <option value="STAFF">STAFF</option>
            </select>
            <input v-model="tenantUserForm.jabatan" class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" placeholder="Jabatan (custom)" />
            <select v-model="tenantUserForm.visibilityMode" class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
              <option value="none">Tidak Bisa Akses</option>
              <option value="view">Lihat Saja</option>
              <option value="edit">Bisa Edit</option>
            </select>
            <input v-model="tenantUserForm.password" type="password" class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" placeholder="Password (isi saat tambah/reset)" />
          </div>
          <div class="mt-2 flex justify-end gap-2">
            <button class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700" @click="resetTenantUserForm">Reset</button>
            <button class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white" @click="addUserToTenant">{{ tenantUserForm.id ? 'Update User Tenant' : 'Tambah User Tenant' }}</button>
          </div>
          <div class="mt-3 overflow-x-auto">
            <table class="min-w-full text-left text-xs">
              <thead class="border-b border-slate-200 text-slate-500">
                <tr>
                  <th class="px-2 py-2">Nama</th>
                  <th class="px-2 py-2">Username</th>
                  <th class="px-2 py-2">Email</th>
                  <th class="px-2 py-2">Role</th>
                  <th class="px-2 py-2">Jabatan</th>
                  <th class="px-2 py-2">Mode</th>
                  <th class="px-2 py-2">Status</th>
                  <th class="px-2 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in tenantUsers" :key="u.id" class="border-b border-slate-100">
                  <td class="px-2 py-2">{{ u.name }}</td>
                  <td class="px-2 py-2">{{ u.username }}</td>
                  <td class="px-2 py-2">{{ u.email || '-' }}</td>
                  <td class="px-2 py-2">{{ u.role }}</td>
                  <td class="px-2 py-2">{{ u.jabatan || '-' }}</td>
                  <td class="px-2 py-2">{{ u.canView ? (u.canEdit ? 'Bisa Edit' : 'Lihat Saja') : 'Tidak Bisa Akses' }}</td>
                  <td class="px-2 py-2">{{ u.isActive ? 'Aktif' : 'Nonaktif' }}</td>
                  <td class="px-2 py-2 text-right">
                    <button class="rounded border border-slate-200 px-2 py-1 font-semibold text-slate-700" @click="editTenantUser(u)">Edit</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="rounded-lg border border-slate-200 p-3">
          <p class="text-sm font-bold text-slate-900">Lokasi Tenant</p>
          <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input v-model="tenantLocationForm.name" class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" placeholder="Nama lokasi" />
            <input v-model="tenantLocationForm.description" class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs" placeholder="Deskripsi" />
            <div class="flex gap-2">
              <button class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700" @click="resetTenantLocationForm">Reset</button>
              <button class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white" @click="addLocationToTenant">{{ tenantLocationForm.id ? 'Update Lokasi Tenant' : 'Tambah Lokasi Tenant' }}</button>
            </div>
          </div>
          <div class="mt-3 overflow-x-auto">
            <table class="min-w-full text-left text-xs">
              <thead class="border-b border-slate-200 text-slate-500">
                <tr>
                  <th class="px-2 py-2">Nama</th>
                  <th class="px-2 py-2">Deskripsi</th>
                  <th class="px-2 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="loc in tenantLocations" :key="loc.id" class="border-b border-slate-100">
                  <td class="px-2 py-2">{{ loc.name }}</td>
                  <td class="px-2 py-2">{{ loc.description || '-' }}</td>
                  <td class="px-2 py-2 text-right">
                    <button class="rounded border border-slate-200 px-2 py-1 font-semibold text-slate-700" @click="editTenantLocation(loc)">Edit</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </BaseModal>
  </div>
</template>
