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
const selectedTenantIds = ref([])

const activeTab = ref('Pengguna')
const showArchivedTenants = ref(false)
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
const selectedTenantUserIds = ref([])
const tenantUserBulkAction = ref('ACCESS_VIEW')

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

const tenantIdentityForm = reactive({
  name: '',
  code: '',
})

const tenantTelegramForm = reactive({
  botToken: '',
  chatId: '',
  isEnabled: false,
  sendOnChecklistExport: true,
  hasBotToken: false,
  botTokenMasked: '',
})

const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const canManageUsers = computed(() => authStore.user?.role === 'SUPER_ADMIN')
const canAddInTab = computed(() => activeTab.value !== 'Pengguna' || canManageUsers.value)

const categoryModelLabelMap = {
  CONSUMABLE: 'Barang habis beli lagi',
  GAS: 'Habis tapi isi ulang',
  ASSET: 'Tidak habis tapi bisa rusak',
}

function categoryModelLabel(value) {
  return categoryModelLabelMap[value] || value || '-'
}

const currentRows = computed(() => {
  if (activeTab.value === 'Tenant') return tenants.value
  if (activeTab.value === 'Lokasi') return locations.value
  if (activeTab.value === 'Kategori') return categories.value
  return users.value
})

const tableHeaders = computed(() => {
  if (activeTab.value === 'Tenant') return ['Nama Tenant', 'Kode', 'Status']
  if (activeTab.value === 'Lokasi') return ['Nama', 'Deskripsi', 'Status']
  if (activeTab.value === 'Kategori') return ['Nama', 'Model Kategori', 'Status']
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

function isTenantActive(row) {
  return row?.isActive === true || row?.status === 'Aktif'
}

function isTenantArchived(row) {
  return Boolean(row?.isArchived)
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function isValidEmail(value) {
  if (!value) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
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

function resetTenantIdentityForm() {
  tenantIdentityForm.name = ''
  tenantIdentityForm.code = ''
}

function resetTenantTelegramForm() {
  tenantTelegramForm.botToken = ''
  tenantTelegramForm.chatId = ''
  tenantTelegramForm.isEnabled = false
  tenantTelegramForm.sendOnChecklistExport = true
  tenantTelegramForm.hasBotToken = false
  tenantTelegramForm.botTokenMasked = ''
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
      api.listCategories(authStore.accessToken, { includeInactive: 'true' }),
    ])

    let usersData = []
    let tenantsData = []
    if (canManageUsers.value) {
      ;[usersData, tenantsData] = await Promise.all([
        api.listUsers(authStore.accessToken),
        api.listTenants(authStore.accessToken, {
          includeArchived: showArchivedTenants.value ? 'true' : 'false',
        }),
      ])
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
      kode: categoryModelLabel(item.type || 'CONSUMABLE'),
      status: 'Aktif',
    }))

    tenants.value = tenantsData.map((item) => ({
      id: item.id,
      nama: item.name,
      kode: item.code,
      isActive: Boolean(item.isActive),
      isArchived: Boolean(item.archivedAt),
      status: item.archivedAt ? 'Arsip' : item.isActive ? 'Aktif' : 'Nonaktif',
    }))
    selectedTenantIds.value = selectedTenantIds.value.filter((id) => tenants.value.some((row) => row.id === id))
  } catch (error) {
    notifications.showPopup('Gagal memuat data', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

function toggleTenantSelection(id) {
  if (!id) return
  if (selectedTenantIds.value.includes(id)) {
    selectedTenantIds.value = selectedTenantIds.value.filter((rowId) => rowId !== id)
    return
  }
  selectedTenantIds.value.push(id)
}

function clearTenantSelection() {
  selectedTenantIds.value = []
}

async function applyBulkTenantAction(action, label) {
  if (activeTab.value !== 'Tenant') return
  if (!selectedTenantIds.value.length) {
    notifications.showPopup('Belum ada pilihan', 'Pilih minimal 1 tenant untuk aksi bulk.', 'error')
    return
  }

  const ok = window.confirm(`Terapkan aksi bulk "${label}" untuk ${selectedTenantIds.value.length} tenant?`)
  if (!ok) return

  try {
    const result = await api.bulkTenantAction(authStore.accessToken, {
      ids: selectedTenantIds.value,
      action,
    })

    if (result.failedCount > 0) {
      const firstFailure = result.failures?.[0]?.message || 'Sebagian tenant gagal diproses.'
      notifications.showPopup('Bulk selesai sebagian', `${result.message} ${firstFailure}`, 'error')
    } else {
      notifications.showPopup('Bulk berhasil', result.message, 'success')
    }

    clearTenantSelection()
    await loadData()
  } catch (error) {
    notifications.showPopup('Bulk tenant gagal', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function saveData() {
  try {
    if (activeTab.value === 'Tenant') {
      if (!canManageUsers.value) {
        notifications.showPopup('Akses ditolak', 'Hanya Super Admin yang dapat menambahkan tenant.', 'error')
        return
      }

      const tenantName = form.name.trim()
      const tenantCode = slugify(form.code || form.name)
      if (tenantName.length < 3 || tenantCode.length < 3) {
        notifications.showPopup('Data tenant belum valid', 'Nama dan kode tenant minimal 3 karakter.', 'error')
        return
      }

      await api.createTenant(authStore.accessToken, {
        name: tenantName,
        code: tenantCode,
      })
    } else if (activeTab.value === 'Pengguna') {
      if (!canManageUsers.value) {
        notifications.showPopup('Akses ditolak', 'Hanya Super Admin yang dapat menambahkan pengguna.', 'error')
        return
      }

      const name = form.name.trim()
      const username = form.username.trim()
      const email = form.email.trim()
      if (name.length < 2 || username.length < 3) {
        notifications.showPopup('Data pengguna belum valid', 'Nama minimal 2 karakter dan username minimal 3 karakter.', 'error')
        return
      }
      if (!isValidEmail(email)) {
        notifications.showPopup('Email tidak valid', 'Format email pengguna belum benar.', 'error')
        return
      }
      if (String(form.password || '').length < 6) {
        notifications.showPopup('Password belum valid', 'Password minimal 6 karakter.', 'error')
        return
      }

      await api.createUser(authStore.accessToken, {
        name,
        username,
        email: email || undefined,
        role: form.role,
        password: form.password,
      })
    } else if (activeTab.value === 'Lokasi') {
      const name = form.name.trim()
      const description = form.description.trim()
      if (name.length < 2) {
        notifications.showPopup('Nama lokasi wajib', 'Nama lokasi minimal 2 karakter.', 'error')
        return
      }

      await api.createLocation(authStore.accessToken, {
        name,
        description: description || undefined,
      })
    } else {
      const name = form.name.trim()
      if (!name) {
        notifications.showPopup('Nama kategori wajib', 'Isi nama kategori dulu.', 'error')
        return
      }

      await api.createCategory(authStore.accessToken, {
        name,
        type: form.categoryType,
      })
    }

    showInputModal.value = false
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
    const [detail, telegramSettings] = await Promise.all([
      api.getTenantDetail(authStore.accessToken, row.id),
      api.getTenantTelegramSettings(authStore.accessToken, row.id),
    ])
    selectedTenant.value = detail.tenant
    tenantUsers.value = detail.users || []
    tenantLocations.value = detail.locations || []
    selectedTenantUserIds.value = []
    tenantIdentityForm.name = detail.tenant?.name || ''
    tenantIdentityForm.code = detail.tenant?.code || ''
    tenantTelegramForm.botToken = ''
    tenantTelegramForm.chatId = telegramSettings.chatId || ''
    tenantTelegramForm.isEnabled = Boolean(telegramSettings.isEnabled)
    tenantTelegramForm.sendOnChecklistExport = telegramSettings.sendOnChecklistExport !== false
    tenantTelegramForm.hasBotToken = Boolean(telegramSettings.hasBotToken)
    tenantTelegramForm.botTokenMasked = telegramSettings.botTokenMasked || ''
    resetTenantUserForm()
    resetTenantLocationForm()
    showTenantDetailModal.value = true
  } catch (error) {
    notifications.showPopup('Gagal memuat tenant', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function saveTenantIdentity() {
  if (!selectedTenant.value) return
  const name = tenantIdentityForm.name.trim()
  const code = slugify(tenantIdentityForm.code || tenantIdentityForm.name)

  if (name.length < 3 || code.length < 3) {
    notifications.showPopup('Detail tenant belum valid', 'Nama dan kode tenant minimal 3 karakter.', 'error')
    return
  }

  try {
    const response = await api.updateTenant(authStore.accessToken, selectedTenant.value.id, {
      name,
      code,
    })

    selectedTenant.value = response.tenant
    tenantIdentityForm.name = response.tenant?.name || name
    tenantIdentityForm.code = response.tenant?.code || code
    notifications.showPopup('Tenant diperbarui', 'Nama dan kode tenant berhasil disimpan.', 'success')
    await loadData()
  } catch (error) {
    notifications.showPopup('Gagal update tenant', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function saveTenantTelegramSettings() {
  if (!selectedTenant.value) return
  if (!selectedTenant.value.isActive) {
    notifications.showPopup('Tenant nonaktif', 'Aktifkan tenant dulu sebelum menyimpan integrasi Telegram.', 'error')
    return
  }
  try {
    if (tenantTelegramForm.isEnabled) {
      const hasTokenInput = tenantTelegramForm.botToken.trim().length >= 20
      const hasTokenSaved = tenantTelegramForm.hasBotToken
      if (!hasTokenInput && !hasTokenSaved) {
        notifications.showPopup('Bot token wajib', 'Isi bot token Telegram atau simpan token terlebih dulu.', 'error')
        return
      }
      if (!tenantTelegramForm.chatId.trim()) {
        notifications.showPopup('Chat ID wajib', 'Isi chat ID Telegram untuk tenant ini.', 'error')
        return
      }
    }

    const result = await api.updateTenantTelegramSettings(authStore.accessToken, selectedTenant.value.id, {
      botToken: tenantTelegramForm.botToken.trim() || undefined,
      chatId: tenantTelegramForm.chatId.trim() || undefined,
      isEnabled: tenantTelegramForm.isEnabled,
      sendOnChecklistExport: tenantTelegramForm.sendOnChecklistExport,
    })

    tenantTelegramForm.botToken = ''
    tenantTelegramForm.hasBotToken = Boolean(result.hasBotToken)
    tenantTelegramForm.botTokenMasked = result.botTokenMasked || ''
    tenantTelegramForm.chatId = result.chatId || tenantTelegramForm.chatId
    tenantTelegramForm.isEnabled = Boolean(result.isEnabled)
    tenantTelegramForm.sendOnChecklistExport = result.sendOnChecklistExport !== false

    notifications.showPopup('Integrasi Telegram disimpan', 'Pengaturan Telegram tenant berhasil diperbarui.', 'success')
  } catch (error) {
    notifications.showPopup('Gagal simpan Telegram', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function removeTenant(row) {
  if (!row?.id) return
  if (isTenantArchived(row)) {
    notifications.showPopup('Tenant sudah diarsipkan', 'Gunakan restore untuk memulihkan tenant.', 'info')
    return
  }
  const ok = window.confirm(`Arsipkan tenant \"${row.nama}\"? Tenant akan disembunyikan dari daftar utama, namun masih bisa dipulihkan.`)
  if (!ok) return

  try {
    await api.deleteTenant(authStore.accessToken, row.id)
    if (selectedTenant.value?.id === row.id) {
      showTenantDetailModal.value = false
      selectedTenant.value = null
      tenantUsers.value = []
      tenantLocations.value = []
      resetTenantTelegramForm()
    }
    notifications.showPopup('Tenant diarsipkan', 'Tenant berhasil dipindahkan ke arsip.', 'success')
    await loadData()
  } catch (error) {
    notifications.showPopup('Gagal arsipkan tenant', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function reactivateTenant(row) {
  if (!row?.id) return
  if (isTenantArchived(row)) {
    notifications.showPopup('Tenant diarsipkan', 'Restore tenant dulu dari arsip.', 'info')
    return
  }
  if (isTenantActive(row)) {
    notifications.showPopup('Tenant sudah aktif', 'Tenant ini sudah aktif dan bisa digunakan.', 'info')
    return
  }

  const ok = window.confirm(`Aktifkan kembali tenant \"${row.nama}\"?`)
  if (!ok) return

  try {
    await api.reactivateTenant(authStore.accessToken, row.id)
    notifications.showPopup('Tenant diaktifkan', 'Tenant berhasil diaktifkan kembali.', 'success')
    await loadData()
    if (selectedTenant.value?.id === row.id) {
      await openTenantDetail({ id: row.id })
    }
  } catch (error) {
    notifications.showPopup('Gagal aktifkan tenant', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function deactivateTenant(row) {
  if (!row?.id) return
  if (isTenantArchived(row)) {
    notifications.showPopup('Tenant diarsipkan', 'Tenant arsip tidak bisa diubah status aktifnya.', 'info')
    return
  }
  if (!isTenantActive(row)) {
    notifications.showPopup('Tenant sudah nonaktif', 'Tenant ini sudah nonaktif.', 'info')
    return
  }
  const ok = window.confirm(`Nonaktifkan tenant \"${row.nama}\"?`)
  if (!ok) return

  try {
    await api.updateTenantStatus(authStore.accessToken, row.id, { isActive: false })
    notifications.showPopup('Tenant dinonaktifkan', 'Tenant berhasil dinonaktifkan.', 'success')
    await loadData()
  } catch (error) {
    notifications.showPopup('Gagal nonaktifkan tenant', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function restoreArchivedTenant(row) {
  if (!row?.id) return
  if (!isTenantArchived(row)) {
    notifications.showPopup('Tenant bukan arsip', 'Tenant ini tidak berada di arsip.', 'info')
    return
  }

  const ok = window.confirm(`Pulihkan tenant \"${row.nama}\" dari arsip?`)
  if (!ok) return

  try {
    await api.restoreTenant(authStore.accessToken, row.id)
    notifications.showPopup('Tenant dipulihkan', 'Tenant berhasil dipulihkan dari arsip.', 'success')
    await loadData()
  } catch (error) {
    notifications.showPopup('Gagal restore tenant', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function addUserToTenant() {
  if (!selectedTenant.value) return
  if (!selectedTenant.value.isActive) {
    notifications.showPopup('Tenant nonaktif', 'Aktifkan tenant dulu sebelum menambah atau edit user tenant.', 'error')
    return
  }
  try {
    if (!tenantUserForm.name.trim() || !tenantUserForm.username.trim() || !tenantUserForm.jabatan.trim()) {
      notifications.showPopup('Form user tenant belum lengkap', 'Isi nama, username, dan jabatan.', 'error')
      return
    }

    if (!tenantUserForm.id && !tenantUserForm.password) {
      notifications.showPopup('Password wajib', 'Password wajib diisi saat menambah user tenant.', 'error')
      return
    }

    const name = tenantUserForm.name.trim()
    const username = tenantUserForm.username.trim()
    const email = tenantUserForm.email?.trim() || ''
    const jabatan = tenantUserForm.jabatan.trim()
    const password = tenantUserForm.password || ''

    if (name.length < 2 || username.length < 3 || jabatan.length < 2) {
      notifications.showPopup('Data user tenant belum valid', 'Nama minimal 2 karakter, username 3 karakter, dan jabatan 2 karakter.', 'error')
      return
    }

    if (!isValidEmail(email)) {
      notifications.showPopup('Email tidak valid', 'Format email user tenant belum benar.', 'error')
      return
    }

    if (!tenantUserForm.id && password.length < 6) {
      notifications.showPopup('Password wajib', 'Password minimal 6 karakter saat menambah user tenant.', 'error')
      return
    }

    if (tenantUserForm.id && password && password.length < 6) {
      notifications.showPopup('Password belum valid', 'Password reset minimal 6 karakter.', 'error')
      return
    }

    const visibility = modeToFlags(tenantUserForm.visibilityMode)
    const payload = {
      name,
      username,
      email: email || undefined,
      role: tenantUserForm.role,
      jabatan,
      canView: visibility.canView,
      canEdit: visibility.canEdit,
      password,
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

function toggleTenantUserSelection(userId) {
  if (selectedTenantUserIds.value.includes(userId)) {
    selectedTenantUserIds.value = selectedTenantUserIds.value.filter((id) => id !== userId)
    return
  }
  selectedTenantUserIds.value.push(userId)
}

function clearTenantUserSelection() {
  selectedTenantUserIds.value = []
}

async function applyBulkTenantUserAction() {
  if (!selectedTenant.value) return
  if (!selectedTenantUserIds.value.length) {
    notifications.showPopup('Belum ada user dipilih', 'Pilih minimal 1 user tenant untuk aksi bulk.', 'error')
    return
  }

  const ok = window.confirm(`Terapkan aksi ${tenantUserBulkAction.value} ke ${selectedTenantUserIds.value.length} user tenant?`)
  if (!ok) return

  try {
    const result = await api.bulkTenantUserAction(authStore.accessToken, selectedTenant.value.id, {
      userIds: selectedTenantUserIds.value,
      action: tenantUserBulkAction.value,
    })
    notifications.showPopup('Bulk user tenant selesai', result.message || 'Aksi bulk user tenant berhasil diproses.', 'success')
    clearTenantUserSelection()
    await openTenantDetail({ id: selectedTenant.value.id })
  } catch (error) {
    notifications.showPopup('Bulk user tenant gagal', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function addLocationToTenant() {
  if (!selectedTenant.value) return
  if (!selectedTenant.value.isActive) {
    notifications.showPopup('Tenant nonaktif', 'Aktifkan tenant dulu sebelum menambah atau edit lokasi.', 'error')
    return
  }
  try {
    if (!tenantLocationForm.name.trim()) {
      notifications.showPopup('Nama lokasi wajib', 'Isi nama lokasi tenant.', 'error')
      return
    }

    const name = tenantLocationForm.name.trim()
    const description = tenantLocationForm.description.trim()
    if (name.length < 2) {
      notifications.showPopup('Nama lokasi belum valid', 'Nama lokasi tenant minimal 2 karakter.', 'error')
      return
    }

    if (tenantLocationForm.id) {
      await api.updateTenantLocation(authStore.accessToken, selectedTenant.value.id, tenantLocationForm.id, {
        name,
        description: description || undefined,
      })
    } else {
      await api.addTenantLocation(authStore.accessToken, selectedTenant.value.id, {
        name,
        description: description || undefined,
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
          v-if="activeTab === 'Tenant' && selectedTenantIds.length"
          class="rounded-lg border border-amber-200 px-3 py-2 text-sm font-bold text-amber-700"
          @click="applyBulkTenantAction('DEACTIVATE', 'Nonaktifkan')"
        >
          Bulk Nonaktifkan ({{ selectedTenantIds.length }})
        </button>
        <button
          v-if="activeTab === 'Tenant' && selectedTenantIds.length"
          class="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-bold text-emerald-700"
          @click="applyBulkTenantAction('ACTIVATE', 'Aktifkan')"
        >
          Bulk Aktifkan
        </button>
        <button
          v-if="activeTab === 'Tenant' && selectedTenantIds.length"
          class="rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700"
          @click="applyBulkTenantAction('ARCHIVE', 'Arsipkan')"
        >
          Bulk Arsipkan
        </button>
        <button
          v-if="activeTab === 'Tenant' && selectedTenantIds.length"
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700"
          @click="applyBulkTenantAction('RESTORE', 'Restore')"
        >
          Bulk Restore
        </button>
        <button
          v-if="activeTab === 'Tenant' && selectedTenantIds.length"
          class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
          @click="clearTenantSelection"
        >
          Reset Pilihan
        </button>
        <button
          v-if="activeTab === 'Tenant' && canManageUsers"
          class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
          @click="showArchivedTenants = !showArchivedTenants; loadData()"
        >
          {{ showArchivedTenants ? 'Sembunyikan Arsip' : 'Lihat Arsip' }}
        </button>
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

      <div class="space-y-2 sm:hidden">
        <article
          v-for="row in currentRows"
          :key="`m-${row.id || row.nama}`"
          class="rounded-lg border border-slate-200 p-3"
        >
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-sm font-bold text-slate-900">{{ row.nama }}</p>
              <p class="text-xs text-slate-500">{{ row.role || row.deskripsi || row.kode }}</p>
            </div>
            <div class="flex items-center gap-2">
              <input
                v-if="activeTab === 'Tenant'"
                :checked="selectedTenantIds.includes(row.id)"
                type="checkbox"
                @change="toggleTenantSelection(row.id)"
              />
              <span
                class="rounded-full px-2 py-0.5 text-[11px] font-bold"
                :class="(row.status || 'Aktif') === 'Aktif' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'"
              >
                {{ row.status || 'Aktif' }}
              </span>
            </div>
          </div>
          <div v-if="activeTab === 'Tenant'" class="mt-2 text-right">
            <div class="inline-flex flex-wrap gap-2">
              <button class="text-xs font-bold text-blue-600" @click="openTenantDetail(row)">Buka Detail Tenant</button>
              <button
                class="text-xs font-bold"
                :class="isTenantArchived(row) ? 'text-emerald-700' : 'text-amber-700'"
                @click="isTenantArchived(row) ? restoreArchivedTenant(row) : deactivateTenant(row)"
              >
                {{ isTenantArchived(row) ? 'Restore Arsip' : 'Nonaktifkan' }}
              </button>
              <button class="text-xs font-bold text-rose-700" @click="removeTenant(row)">Arsipkan</button>
              <button
                v-if="!isTenantArchived(row) && !isTenantActive(row)"
                class="text-xs font-bold text-emerald-700"
                @click="reactivateTenant(row)"
              >
                Aktifkan
              </button>
            </div>
          </div>
        </article>
      </div>

      <div class="hidden overflow-x-auto sm:block">
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
                <input
                  v-if="activeTab === 'Tenant'"
                  :checked="selectedTenantIds.includes(row.id)"
                  type="checkbox"
                  class="mr-2 align-middle"
                  @click.stop
                  @change="toggleTenantSelection(row.id)"
                />
                <span
                  class="rounded-full px-2.5 py-1 text-xs font-bold"
                  :class="(row.status || 'Aktif') === 'Aktif' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'"
                >
                  {{ row.status || 'Aktif' }}
                </span>
                <button
                  v-if="activeTab === 'Tenant'"
                  class="ml-2 rounded border border-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-700"
                  @click.stop="isTenantArchived(row) ? restoreArchivedTenant(row) : deactivateTenant(row)"
                >
                  {{ isTenantArchived(row) ? 'Restore' : 'Nonaktifkan' }}
                </button>
                <button
                  v-if="activeTab === 'Tenant'"
                  class="ml-2 rounded border border-rose-200 px-2 py-0.5 text-[11px] font-bold text-rose-700"
                  @click.stop="removeTenant(row)"
                >
                  Arsip
                </button>
                <button
                  v-if="activeTab === 'Tenant' && !isTenantArchived(row) && !isTenantActive(row)"
                  class="ml-2 rounded border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-700"
                  @click.stop="reactivateTenant(row)"
                >
                  Aktifkan
                </button>
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
          <span class="mb-1 block text-sm font-semibold text-slate-700">Model Kategori Operasional</span>
          <select v-model="form.categoryType" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="CONSUMABLE">Barang habis beli lagi</option>
            <option value="GAS">Habis tapi isi ulang</option>
            <option value="ASSET">Tidak habis tapi bisa rusak</option>
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
        <div class="flex justify-end">
          <button
            v-if="selectedTenant"
            class="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-700"
            @click="selectedTenant.archivedAt ? restoreArchivedTenant({ id: selectedTenant.id, nama: selectedTenant.name, isArchived: true }) : deactivateTenant({ id: selectedTenant.id, nama: selectedTenant.name, status: selectedTenant.isActive ? 'Aktif' : 'Nonaktif', isActive: selectedTenant.isActive })"
          >
            {{ selectedTenant.archivedAt ? 'Restore Tenant Dari Arsip' : 'Nonaktifkan Tenant Ini' }}
          </button>
          <button
            v-if="selectedTenant"
            class="ml-2 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700"
            @click="removeTenant({ id: selectedTenant.id, nama: selectedTenant.name, status: selectedTenant.isActive ? 'Aktif' : 'Nonaktif', isActive: selectedTenant.isActive, isArchived: Boolean(selectedTenant.archivedAt) })"
          >
            Arsipkan Tenant Ini
          </button>
          <button
            v-if="selectedTenant && !selectedTenant.archivedAt && !selectedTenant.isActive"
            class="ml-2 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700"
            @click="reactivateTenant({ id: selectedTenant.id, nama: selectedTenant.name, status: 'Nonaktif', isActive: false })"
          >
            Aktifkan Tenant Ini
          </button>
        </div>

        <section class="rounded-lg border border-slate-200 p-3">
          <p class="text-sm font-bold text-slate-900">Detail Tenant</p>
          <p class="mt-1 text-xs text-slate-500">Ubah nama tenant dan kode tenant untuk identitas sistem.</p>

          <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              v-model="tenantIdentityForm.name"
              class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              placeholder="Nama tenant"
            />
            <input
              v-model="tenantIdentityForm.code"
              class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              placeholder="kode-tenant"
            />
            <div class="flex justify-end">
              <button class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white" @click="saveTenantIdentity">
                Simpan Detail Tenant
              </button>
            </div>
          </div>
        </section>

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
          <div class="mt-2 flex flex-wrap items-center justify-end gap-2">
            <select v-model="tenantUserBulkAction" class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700">
              <option value="ACCESS_NONE">Bulk Tidak Bisa Akses</option>
              <option value="ACCESS_VIEW">Bulk Lihat Saja</option>
              <option value="ACCESS_EDIT">Bulk Bisa Edit</option>
              <option value="DEACTIVATE">Bulk Nonaktifkan Akun</option>
              <option value="ACTIVATE">Bulk Aktifkan Akun</option>
            </select>
            <button
              class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
              :disabled="!selectedTenantUserIds.length"
              @click="applyBulkTenantUserAction"
            >
              Terapkan Bulk ({{ selectedTenantUserIds.length }})
            </button>
            <button
              v-if="selectedTenantUserIds.length"
              class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
              @click="clearTenantUserSelection"
            >
              Reset Pilihan
            </button>
          </div>
          <div class="mt-3 space-y-2 sm:hidden">
            <article v-for="u in tenantUsers" :key="`mu-${u.id}`" class="rounded-lg border border-slate-200 p-2 text-xs">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="font-bold text-slate-900">{{ u.name }}</p>
                  <p class="text-slate-500">{{ u.username }} - {{ u.role }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <input :checked="selectedTenantUserIds.includes(u.id)" type="checkbox" @change="toggleTenantUserSelection(u.id)" />
                  <span class="rounded-full px-2 py-0.5 font-bold" :class="u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'">
                    {{ u.isActive ? 'Aktif' : 'Nonaktif' }}
                  </span>
                </div>
              </div>
              <p class="mt-1 text-slate-600">Jabatan: {{ u.jabatan || '-' }}</p>
              <p class="text-slate-600">Mode: {{ u.canView ? (u.canEdit ? 'Bisa Edit' : 'Lihat Saja') : 'Tidak Bisa Akses' }}</p>
              <p class="text-slate-600">Email: {{ u.email || '-' }}</p>
              <div class="mt-2 text-right">
                <button class="rounded border border-slate-200 px-2 py-1 font-semibold text-slate-700" @click="editTenantUser(u)">Edit</button>
              </div>
            </article>
          </div>
          <div class="mt-3 hidden overflow-x-auto sm:block">
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
                  <td class="px-2 py-2">
                    <input class="mr-2 align-middle" :checked="selectedTenantUserIds.includes(u.id)" type="checkbox" @change="toggleTenantUserSelection(u.id)" />
                    {{ u.isActive ? 'Aktif' : 'Nonaktif' }}
                  </td>
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
          <div class="mt-3 space-y-2 sm:hidden">
            <article v-for="loc in tenantLocations" :key="`ml-${loc.id}`" class="rounded-lg border border-slate-200 p-2 text-xs">
              <p class="font-bold text-slate-900">{{ loc.name }}</p>
              <p class="mt-1 text-slate-600">{{ loc.description || '-' }}</p>
              <div class="mt-2 text-right">
                <button class="rounded border border-slate-200 px-2 py-1 font-semibold text-slate-700" @click="editTenantLocation(loc)">Edit</button>
              </div>
            </article>
          </div>
          <div class="mt-3 hidden overflow-x-auto sm:block">
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

        <section class="rounded-lg border border-slate-200 p-3">
          <p class="text-sm font-bold text-slate-900">Integrasi Telegram</p>
          <p class="mt-1 text-xs text-slate-500">Setiap export checklist akan print hardcopy dan kirim PDF ke Telegram tenant jika aktif.</p>

          <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-xs font-semibold text-slate-700">Bot Token</span>
              <input
                v-model="tenantTelegramForm.botToken"
                class="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                placeholder="Isi token baru jika ingin ganti"
              />
              <p v-if="tenantTelegramForm.hasBotToken" class="mt-1 text-[11px] text-slate-500">
                Token tersimpan: {{ tenantTelegramForm.botTokenMasked || '********' }}
              </p>
            </label>

            <label class="block">
              <span class="mb-1 block text-xs font-semibold text-slate-700">Chat ID / UID</span>
              <input
                v-model="tenantTelegramForm.chatId"
                class="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                placeholder="Contoh: 123456789"
              />
            </label>
          </div>

          <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label class="inline-flex items-center gap-2 text-xs text-slate-700">
              <input v-model="tenantTelegramForm.isEnabled" type="checkbox" />
              Aktifkan integrasi Telegram tenant
            </label>
            <label class="inline-flex items-center gap-2 text-xs text-slate-700">
              <input v-model="tenantTelegramForm.sendOnChecklistExport" type="checkbox" />
              Kirim otomatis saat export checklist
            </label>
          </div>

          <div class="mt-3 flex justify-end">
            <button class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white" @click="saveTenantTelegramSettings">
              Simpan Integrasi Telegram
            </button>
          </div>
        </section>
      </div>
    </BaseModal>
  </div>
</template>
