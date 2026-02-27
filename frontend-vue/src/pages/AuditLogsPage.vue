<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '../components/common/PageHeader.vue'
import BaseModal from '../components/common/BaseModal.vue'
import { useAuthStore } from '../stores/auth'
import { useNotificationsStore } from '../stores/notifications'
import { api } from '../lib/api'

const authStore = useAuthStore()
const notifications = useNotificationsStore()
const route = useRoute()
const router = useRouter()

const FILTER_STORAGE_KEY = 'audit_logs_filters_v1'
const PRESET_STORAGE_KEY = 'audit_logs_presets_v1'

const rows = ref([])
const stats = ref({
  total: 0,
  byAction: [],
  byEntityType: [],
})
const tenantOptions = ref([])
const selectedLog = ref(null)
const isLoadingDetail = ref(false)
const isLoading = ref(false)
const quickDays = ref(14)
const presetName = ref('')
const selectedPresetId = ref('')
const presetOptions = ref([])
const presetImportInputRef = ref(null)
const autoApplyNotice = ref('')
const lastAppliedFilterSignature = ref('')
const suppressAutoApply = ref(false)
const isActorDebouncing = ref(false)
const isEntityDebouncing = ref(false)

let actorDebounceTimer = null
let entityDebounceTimer = null
let autoApplyNoticeTimer = null
const pagination = reactive({
  page: 1,
  pageSize: 25,
  total: 0,
})

const filters = reactive({
  fromDate: '',
  toDate: '',
  tenantId: '',
  actorUserId: '',
  entityType: '',
  entityId: '',
  action: '',
})

const actionOptions = [
  { value: '', label: 'Semua action' },
  { value: 'CREATE', label: 'CREATE' },
  { value: 'UPDATE', label: 'UPDATE' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'ACTIVATE', label: 'ACTIVATE' },
  { value: 'DEACTIVATE', label: 'DEACTIVATE' },
  { value: 'STATUS_UPDATE', label: 'STATUS_UPDATE' },
  { value: 'SUBMIT', label: 'SUBMIT' },
  { value: 'VIEW', label: 'VIEW' },
  { value: 'SEND_TELEGRAM', label: 'SEND_TELEGRAM' },
  { value: 'BULK_ACTIVATE', label: 'BULK_ACTIVATE' },
  { value: 'BULK_DEACTIVATE', label: 'BULK_DEACTIVATE' },
  { value: 'BULK_DELETE', label: 'BULK_DELETE' },
  { value: 'BULK_UPDATE', label: 'BULK_UPDATE' },
  { value: 'BULK_ADJUST', label: 'BULK_ADJUST' },
]

const entityTypeOptions = [
  { value: '', label: 'Semua entity' },
  { value: 'items', label: 'items' },
  { value: 'categories', label: 'categories' },
  { value: 'inventory_transactions', label: 'inventory_transactions' },
  { value: 'purchase_requests', label: 'purchase_requests' },
  { value: 'checklist_runs', label: 'checklist_runs' },
  { value: 'checklist_monitoring', label: 'checklist_monitoring' },
  { value: 'checklist_exports', label: 'checklist_exports' },
  { value: 'checklist_monitoring_exports', label: 'checklist_monitoring_exports' },
  { value: 'tenants', label: 'tenants' },
  { value: 'tenant_users', label: 'tenant_users' },
  { value: 'tenant_locations', label: 'tenant_locations' },
  { value: 'tenant_telegram_settings', label: 'tenant_telegram_settings' },
]

const canFilterTenant = computed(() => authStore.user?.role === 'SUPER_ADMIN')
const totalPages = computed(() => Math.max(1, Math.ceil((pagination.total || 0) / pagination.pageSize)))
const activeFilterEntries = computed(() => {
  const entries = []
  if (filters.fromDate) entries.push({ key: 'fromDate', label: `Dari: ${filters.fromDate}` })
  if (filters.toDate) entries.push({ key: 'toDate', label: `Sampai: ${filters.toDate}` })
  if (filters.tenantId && canFilterTenant.value) {
    const tenantName = tenantOptions.value.find((item) => item.id === filters.tenantId)?.name || filters.tenantId
    entries.push({ key: 'tenantId', label: `Tenant: ${tenantName}` })
  }
  if (filters.entityType) entries.push({ key: 'entityType', label: `Entity: ${filters.entityType}` })
  if (filters.entityId) entries.push({ key: 'entityId', label: `Entity ID: ${filters.entityId}` })
  if (filters.action) entries.push({ key: 'action', label: `Action: ${filters.action}` })
  if (filters.actorUserId) entries.push({ key: 'actorUserId', label: `Actor: ${filters.actorUserId}` })
  return entries
})
const activeFilterCount = computed(() => activeFilterEntries.value.length)
const hasPendingFilterChanges = computed(() => buildFilterSignature() !== lastAppliedFilterSignature.value)
const exportRangeWarning = computed(() => {
  if (!filters.fromDate || !filters.toDate) return ''
  const from = new Date(`${filters.fromDate}T00:00:00.000Z`)
  const to = new Date(`${filters.toDate}T23:59:59.999Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return ''
  if (to < from) return 'Tanggal akhir harus lebih besar atau sama dengan tanggal awal.'
  const maxRangeMs = 31 * 24 * 60 * 60 * 1000
  if (to.getTime() - from.getTime() > maxRangeMs) return 'Rentang export maksimal 31 hari.'
  return ''
})

function toIsoStart(dateOnly) {
  if (!dateOnly) return undefined
  return `${dateOnly}T00:00:00.000Z`
}

function toIsoEnd(dateOnly) {
  if (!dateOnly) return undefined
  return `${dateOnly}T23:59:59.999Z`
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('id-ID')
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

async function loadTenants() {
  if (!canFilterTenant.value || !authStore.accessToken) return
  try {
    const rowsData = await api.listTenants(authStore.accessToken, { includeArchived: 'false' })
    tenantOptions.value = Array.isArray(rowsData) ? rowsData : []
  } catch {
    tenantOptions.value = []
  }
}

async function loadData() {
  if (!authStore.accessToken) return
  isLoading.value = true

  try {
    const payload = await api.listAuditLogs(authStore.accessToken, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      from: toIsoStart(filters.fromDate),
      to: toIsoEnd(filters.toDate),
      tenantId: canFilterTenant.value ? filters.tenantId : undefined,
      actorUserId: filters.actorUserId || undefined,
      entityType: filters.entityType.trim() || undefined,
      entityId: filters.entityId.trim() || undefined,
      action: filters.action.trim() || undefined,
      sort: 'createdAt:desc',
    })

    rows.value = payload.data || []
    pagination.total = payload.pagination?.total || 0
    pagination.page = payload.pagination?.page || pagination.page
    pagination.pageSize = payload.pagination?.pageSize || pagination.pageSize
  } catch (error) {
    notifications.showPopup('Gagal memuat audit log', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoading.value = false
  }
}

function parsePositiveInt(value, fallback) {
  const next = Number(value)
  if (!Number.isInteger(next) || next < 1) return fallback
  return next
}

function buildFilterSnapshot() {
  return {
    fromDate: filters.fromDate || '',
    toDate: filters.toDate || '',
    tenantId: filters.tenantId || '',
    actorUserId: filters.actorUserId || '',
    entityType: filters.entityType || '',
    entityId: filters.entityId || '',
    action: filters.action || '',
    page: pagination.page,
    pageSize: pagination.pageSize,
    quickDays: quickDays.value,
  }
}

function buildPresetPayload() {
  return {
    fromDate: filters.fromDate || '',
    toDate: filters.toDate || '',
    tenantId: filters.tenantId || '',
    actorUserId: filters.actorUserId || '',
    entityType: filters.entityType || '',
    entityId: filters.entityId || '',
    action: filters.action || '',
    quickDays: quickDays.value,
  }
}

function buildFilterSignature() {
  return JSON.stringify({
    fromDate: filters.fromDate || '',
    toDate: filters.toDate || '',
    tenantId: filters.tenantId || '',
    actorUserId: filters.actorUserId || '',
    entityType: filters.entityType || '',
    entityId: filters.entityId || '',
    action: filters.action || '',
  })
}

function markFiltersAsApplied() {
  lastAppliedFilterSignature.value = buildFilterSignature()
}

function applyFilterSnapshot(snapshot = {}) {
  suppressAutoApply.value = true
  filters.fromDate = typeof snapshot.fromDate === 'string' ? snapshot.fromDate : ''
  filters.toDate = typeof snapshot.toDate === 'string' ? snapshot.toDate : ''
  filters.tenantId = typeof snapshot.tenantId === 'string' ? snapshot.tenantId : ''
  filters.actorUserId = typeof snapshot.actorUserId === 'string' ? snapshot.actorUserId : ''
  filters.entityType = typeof snapshot.entityType === 'string' ? snapshot.entityType : ''
  filters.entityId = typeof snapshot.entityId === 'string' ? snapshot.entityId : ''
  filters.action = typeof snapshot.action === 'string' ? snapshot.action : ''
  pagination.page = parsePositiveInt(snapshot.page, 1)
  pagination.pageSize = parsePositiveInt(snapshot.pageSize, 25)
  quickDays.value = parsePositiveInt(snapshot.quickDays, 14)
  suppressAutoApply.value = false
}

function persistFilters() {
  localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(buildFilterSnapshot()))
}

function loadPresetsFromStorage() {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY)
    if (!raw) {
      presetOptions.value = []
      return
    }
    const parsed = JSON.parse(raw)
    const normalized = Array.isArray(parsed)
      ? parsed
          .filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string')
          .map((item) => ({
            id: item.id,
            name: item.name,
            payload: item.payload && typeof item.payload === 'object' ? item.payload : {},
            updatedAt: item.updatedAt || null,
            isDefault: Boolean(item.isDefault),
          }))
      : []

    const defaultIndex = normalized.findIndex((item) => item.isDefault)
    if (defaultIndex >= 0) {
      normalized.forEach((item, index) => {
        if (index !== defaultIndex) item.isDefault = false
      })
    }

    presetOptions.value = normalized
  } catch {
    presetOptions.value = []
  }
}

function persistPresetsToStorage() {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presetOptions.value))
}

function showAutoApplyNotice(message) {
  autoApplyNotice.value = message
  if (autoApplyNoticeTimer) clearTimeout(autoApplyNoticeTimer)
  autoApplyNoticeTimer = setTimeout(() => {
    autoApplyNotice.value = ''
  }, 2000)
}

function hasQueryFilters() {
  return Object.values(route.query).some((value) => value !== undefined && value !== null && String(value).length)
}

function getDefaultPreset() {
  return presetOptions.value.find((item) => item.isDefault) || null
}

function syncQuery() {
  const query = {}
  const snapshot = buildFilterSnapshot()
  Object.entries(snapshot).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 1 || (key === 'pageSize' && value === 25) || (key === 'quickDays' && value === 14)) return
    query[key] = String(value)
  })

  router.replace({
    query,
  })
}

async function copyShareLink() {
  syncQuery()
  const shareUrl = `${window.location.origin}${route.fullPath}`

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl)
    } else {
      const input = document.createElement('input')
      input.value = shareUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }

    notifications.showPopup('Link tersalin', 'Link filter audit berhasil disalin.', 'success')
  } catch {
    notifications.showPopup('Gagal menyalin link', 'Salin manual URL pada browser.', 'error')
  }
}

function openShareLinkInNewTab() {
  syncQuery()
  const shareUrl = `${window.location.origin}${route.fullPath}`
  window.open(shareUrl, '_blank', 'noopener,noreferrer')
}

async function resetToDefaultRange() {
  quickDays.value = 7
  await applyQuickRange(7)
}

async function clearSingleFilter(key) {
  if (!(key in filters)) return
  suppressAutoApply.value = true
  filters[key] = ''
  suppressAutoApply.value = false
  pagination.page = 1
  persistFilters()
  syncQuery()
  await Promise.all([loadData(), loadStats()])
  markFiltersAsApplied()
}

function saveCurrentPreset() {
  const name = presetName.value.trim()
  if (!name) {
    notifications.showPopup('Nama preset kosong', 'Isi nama preset sebelum menyimpan.', 'error')
    return
  }

  const existingIndex = presetOptions.value.findIndex((item) => item.name.toLowerCase() === name.toLowerCase())
  const nextPreset = {
    id: existingIndex >= 0 ? presetOptions.value[existingIndex].id : `preset-${Date.now()}`,
    name,
    payload: buildPresetPayload(),
    updatedAt: new Date().toISOString(),
    isDefault: existingIndex >= 0 ? Boolean(presetOptions.value[existingIndex].isDefault) : false,
  }

  if (existingIndex >= 0) {
    presetOptions.value.splice(existingIndex, 1, nextPreset)
  } else {
    presetOptions.value.unshift(nextPreset)
  }

  selectedPresetId.value = nextPreset.id
  persistPresetsToStorage()
  presetName.value = ''
  notifications.showPopup('Preset disimpan', `Preset "${name}" berhasil disimpan.`, 'success')
}

function setSelectedPresetAsDefault() {
  if (!selectedPresetId.value) return
  let targetName = ''
  presetOptions.value = presetOptions.value.map((item) => {
    const isTarget = item.id === selectedPresetId.value
    if (isTarget) targetName = item.name
    return {
      ...item,
      isDefault: isTarget,
    }
  })
  persistPresetsToStorage()
  if (targetName) {
    notifications.showPopup('Preset default diperbarui', `Preset "${targetName}" dijadikan default.`, 'success')
  }
}

function clearDefaultPreset() {
  const hasDefault = presetOptions.value.some((item) => item.isDefault)
  if (!hasDefault) return
  presetOptions.value = presetOptions.value.map((item) => ({
    ...item,
    isDefault: false,
  }))
  persistPresetsToStorage()
  notifications.showPopup('Default preset dilepas', 'Halaman audit tidak lagi memakai preset default otomatis.', 'success')
}

async function applySelectedPreset() {
  if (!selectedPresetId.value) return
  const found = presetOptions.value.find((item) => item.id === selectedPresetId.value)
  if (!found) return

  applyFilterSnapshot({
    ...found.payload,
    page: 1,
    pageSize: pagination.pageSize,
  })
  await applyFilters({ source: 'preset' })
}

function deleteSelectedPreset() {
  if (!selectedPresetId.value) return
  const found = presetOptions.value.find((item) => item.id === selectedPresetId.value)
  presetOptions.value = presetOptions.value.filter((item) => item.id !== selectedPresetId.value)
  persistPresetsToStorage()
  selectedPresetId.value = ''
  if (found) {
    notifications.showPopup('Preset dihapus', `Preset "${found.name}" telah dihapus.`, 'success')
  }
}

function renameSelectedPreset() {
  if (!selectedPresetId.value) return
  const name = presetName.value.trim()
  if (!name) {
    notifications.showPopup('Nama preset kosong', 'Isi nama baru preset terlebih dahulu.', 'error')
    return
  }

  const found = presetOptions.value.find((item) => item.id === selectedPresetId.value)
  if (!found) return

  const duplicate = presetOptions.value.find(
    (item) => item.id !== selectedPresetId.value && item.name.toLowerCase() === name.toLowerCase(),
  )
  if (duplicate) {
    notifications.showPopup('Nama sudah dipakai', 'Gunakan nama preset lain.', 'error')
    return
  }

  found.name = name
  found.updatedAt = new Date().toISOString()
  persistPresetsToStorage()
  presetName.value = ''
  notifications.showPopup('Preset diubah', `Nama preset menjadi "${name}".`, 'success')
}

function exportPresetsToJson() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: presetOptions.value,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `audit-presets-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  notifications.showPopup('Preset diexport', 'File preset JSON berhasil diunduh.', 'success')
}

function openPresetImportDialog() {
  if (!presetImportInputRef.value) return
  presetImportInputRef.value.value = ''
  presetImportInputRef.value.click()
}

async function importPresetsFromJson(event) {
  const input = event.target
  const file = input?.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const incoming = Array.isArray(parsed?.presets)
      ? parsed.presets
      : Array.isArray(parsed)
        ? parsed
        : []

    if (!incoming.length) {
      notifications.showPopup('Import gagal', 'Preset tidak ditemukan pada file.', 'error')
      return
    }

    const normalized = incoming
      .filter((item) => item && typeof item === 'object' && typeof item.name === 'string')
      .map((item, index) => ({
        id: typeof item.id === 'string' ? item.id : `import-${Date.now()}-${index}`,
        name: item.name,
        payload: item.payload && typeof item.payload === 'object' ? item.payload : {},
        updatedAt: item.updatedAt || new Date().toISOString(),
        isDefault: Boolean(item.isDefault),
      }))

    if (!normalized.length) {
      notifications.showPopup('Import gagal', 'Struktur preset tidak valid.', 'error')
      return
    }

    const existingNames = new Set(presetOptions.value.map((item) => item.name.toLowerCase()))
    const overwriteCount = normalized.filter((item) => existingNames.has(item.name.toLowerCase())).length
    const newCount = normalized.length - overwriteCount
    const incomingDefaultCount = normalized.filter((item) => item.isDefault).length
    const previewNames = normalized.slice(0, 5).map((item) => `- ${item.name}`).join('\n')
    const previewText = [
      `File: ${file.name}`,
      `Total preset terdeteksi: ${normalized.length}`,
      `Preset baru: ${newCount}`,
      `Preset overwrite: ${overwriteCount}`,
      `Preset default di file: ${incomingDefaultCount}`,
      '',
      'Contoh preset:',
      previewNames || '- (kosong)',
      normalized.length > 5 ? `...dan ${normalized.length - 5} preset lainnya` : '',
      '',
      'Lanjutkan import?',
    ]
      .filter(Boolean)
      .join('\n')

    const shouldContinue = window.confirm(previewText)
    if (!shouldContinue) {
      notifications.showPopup('Import dibatalkan', 'Preset tidak diubah.', 'info')
      return
    }

    const byName = new Map(presetOptions.value.map((item) => [item.name.toLowerCase(), item]))
    for (const item of normalized) {
      byName.set(item.name.toLowerCase(), item)
    }

    const merged = [...byName.values()]
    const defaultIndex = merged.findIndex((item) => item.isDefault)
    if (defaultIndex >= 0) {
      merged.forEach((item, index) => {
        if (index !== defaultIndex) item.isDefault = false
      })
    }

    presetOptions.value = merged
    persistPresetsToStorage()
    notifications.showPopup('Import berhasil', `${normalized.length} preset diproses.`, 'success')
  } catch {
    notifications.showPopup('Import gagal', 'File JSON tidak valid.', 'error')
  }
}

function restoreFilters() {
  const querySnapshot = {
    fromDate: typeof route.query.fromDate === 'string' ? route.query.fromDate : '',
    toDate: typeof route.query.toDate === 'string' ? route.query.toDate : '',
    tenantId: typeof route.query.tenantId === 'string' ? route.query.tenantId : '',
    actorUserId: typeof route.query.actorUserId === 'string' ? route.query.actorUserId : '',
    entityType: typeof route.query.entityType === 'string' ? route.query.entityType : '',
    entityId: typeof route.query.entityId === 'string' ? route.query.entityId : '',
    action: typeof route.query.action === 'string' ? route.query.action : '',
    page: typeof route.query.page === 'string' ? route.query.page : undefined,
    pageSize: typeof route.query.pageSize === 'string' ? route.query.pageSize : undefined,
    quickDays: typeof route.query.quickDays === 'string' ? route.query.quickDays : undefined,
  }

  const hasQuery = Object.values(querySnapshot).some((value) => value !== '' && value !== undefined)
  if (hasQuery) {
    applyFilterSnapshot(querySnapshot)
    return
  }

  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    applyFilterSnapshot(parsed)
  } catch {
    // ignore invalid persisted filters
  }
}

async function loadStats() {
  if (!authStore.accessToken) return
  try {
    stats.value = await api.getAuditLogStats(authStore.accessToken, {
      from: toIsoStart(filters.fromDate),
      to: toIsoEnd(filters.toDate),
      tenantId: canFilterTenant.value ? filters.tenantId : undefined,
      actorUserId: filters.actorUserId || undefined,
      entityType: filters.entityType.trim() || undefined,
      entityId: filters.entityId.trim() || undefined,
      action: filters.action.trim() || undefined,
    })
  } catch {
    stats.value = { total: 0, byAction: [], byEntityType: [] }
  }
}

async function applyFilters(options = {}) {
  const source = options.source || 'manual'
  pagination.page = 1
  persistFilters()
  syncQuery()
  await Promise.all([loadData(), loadStats()])
  markFiltersAsApplied()
  if (source === 'auto') {
    showAutoApplyNotice('Filter otomatis diterapkan')
  }
}

async function resetFilters() {
  suppressAutoApply.value = true
  filters.fromDate = ''
  filters.toDate = ''
  filters.tenantId = ''
  filters.actorUserId = ''
  filters.entityType = ''
  filters.entityId = ''
  filters.action = ''
  suppressAutoApply.value = false
  pagination.page = 1
  persistFilters()
  syncQuery()
  await Promise.all([loadData(), loadStats()])
  markFiltersAsApplied()
}

async function goToPage(nextPage) {
  if (nextPage < 1 || nextPage > totalPages.value || nextPage === pagination.page) return
  pagination.page = nextPage
  persistFilters()
  syncQuery()
  await loadData()
}

function formatDateOnly(date) {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function applyQuickRange(days) {
  const end = new Date()
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  filters.fromDate = formatDateOnly(start)
  filters.toDate = formatDateOnly(end)
  await applyFilters()
}

async function applyCustomRange() {
  const days = Number(quickDays.value)
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    notifications.showPopup('Rentang tidak valid', 'Isi rentang 1 sampai 365 hari.', 'error')
    return
  }
  await applyQuickRange(days)
}

async function forceApplyNow() {
  if (actorDebounceTimer) {
    clearTimeout(actorDebounceTimer)
    actorDebounceTimer = null
  }
  if (entityDebounceTimer) {
    clearTimeout(entityDebounceTimer)
    entityDebounceTimer = null
  }
  isActorDebouncing.value = false
  isEntityDebouncing.value = false

  if (!hasPendingFilterChanges.value || isLoading.value) return
  await applyFilters()
}

function onFilterInputEnter(event) {
  event.preventDefault()
  forceApplyNow()
}

function buildExportQuery() {
  return {
    from: toIsoStart(filters.fromDate),
    to: toIsoEnd(filters.toDate),
    tenantId: canFilterTenant.value ? filters.tenantId : undefined,
    actorUserId: filters.actorUserId || undefined,
    entityType: filters.entityType.trim() || undefined,
    entityId: filters.entityId.trim() || undefined,
    action: filters.action.trim() || undefined,
    sort: 'createdAt:desc',
  }
}

async function exportCsv() {
  if (!authStore.accessToken) return
  if (exportRangeWarning.value) {
    notifications.showPopup('Export gagal', exportRangeWarning.value, 'error')
    return
  }

  try {
    const blob = await api.exportAuditLogsCsv(authStore.accessToken, buildExportQuery())
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    anchor.href = url
    anchor.download = `audit-logs-${stamp}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    notifications.showPopup('Export berhasil', 'File CSV audit log berhasil diunduh.', 'success')
  } catch (error) {
    notifications.showPopup('Export gagal', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  }
}

async function openDetail(row) {
  if (!authStore.accessToken || !row?.id) return
  isLoadingDetail.value = true
  try {
    selectedLog.value = await api.getAuditLogDetail(authStore.accessToken, row.id)
  } catch (error) {
    notifications.showPopup('Gagal memuat detail audit', error instanceof Error ? error.message : 'Terjadi kesalahan.', 'error')
  } finally {
    isLoadingDetail.value = false
  }
}

watch(
  () => filters.actorUserId,
  () => {
    if (suppressAutoApply.value) return
    if (actorDebounceTimer) clearTimeout(actorDebounceTimer)
    isActorDebouncing.value = true
    actorDebounceTimer = setTimeout(() => {
      isActorDebouncing.value = false
      if (hasPendingFilterChanges.value) {
        applyFilters({ source: 'auto' })
      }
    }, 600)
  },
)

watch(
  () => filters.entityId,
  () => {
    if (suppressAutoApply.value) return
    if (entityDebounceTimer) clearTimeout(entityDebounceTimer)
    isEntityDebouncing.value = true
    entityDebounceTimer = setTimeout(() => {
      isEntityDebouncing.value = false
      if (hasPendingFilterChanges.value) {
        applyFilters({ source: 'auto' })
      }
    }, 600)
  },
)

watch(
  () => selectedPresetId.value,
  (nextId) => {
    if (!nextId) return
    const found = presetOptions.value.find((item) => item.id === nextId)
    if (found) {
      presetName.value = found.name
    }
  },
)

onBeforeUnmount(() => {
  if (actorDebounceTimer) clearTimeout(actorDebounceTimer)
  if (entityDebounceTimer) clearTimeout(entityDebounceTimer)
  if (autoApplyNoticeTimer) clearTimeout(autoApplyNoticeTimer)
  isActorDebouncing.value = false
  isEntityDebouncing.value = false
})

onMounted(async () => {
  loadPresetsFromStorage()
  const hasQuery = hasQueryFilters()
  restoreFilters()

  const defaultPreset = getDefaultPreset()
  if (!hasQuery && defaultPreset) {
    applyFilterSnapshot({
      ...defaultPreset.payload,
      page: 1,
      pageSize: pagination.pageSize,
    })
    selectedPresetId.value = defaultPreset.id
    showAutoApplyNotice(`Preset default aktif: ${defaultPreset.name}`)
  }

  persistFilters()
  syncQuery()
  await loadTenants()
  await Promise.all([loadData(), loadStats()])
  markFiltersAsApplied()
})
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Audit Log" subtitle="Riwayat aktivitas perubahan data untuk investigasi operasional" />

    <section class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Dari tanggal</span>
          <input v-model="filters.fromDate" type="date" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Sampai tanggal</span>
          <input v-model="filters.toDate" type="date" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label class="block" v-if="canFilterTenant">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Tenant</span>
          <select v-model="filters.tenantId" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Semua tenant</option>
            <option v-for="tenant in tenantOptions" :key="tenant.id" :value="tenant.id">{{ tenant.name }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Entity type</span>
          <select v-model="filters.entityType" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option v-for="item in entityTypeOptions" :key="`entity-${item.value || 'all'}`" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Entity ID</span>
          <input
            v-model="filters.entityId"
            placeholder="UUID / key entity"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            @keydown.enter="onFilterInputEnter"
          />
          <span v-if="isEntityDebouncing" class="mt-1 block text-[11px] font-semibold text-slate-500">Menunggu input selesai...</span>
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Action</span>
          <select v-model="filters.action" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option v-for="item in actionOptions" :key="`action-${item.value || 'all'}`" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-slate-600">Actor User ID</span>
          <input
            v-model="filters.actorUserId"
            placeholder="UUID user"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            @keydown.enter="onFilterInputEnter"
          />
          <span v-if="isActorDebouncing" class="mt-1 block text-[11px] font-semibold text-slate-500">Menunggu input selesai...</span>
        </label>
      </div>

      <div class="mt-3 flex flex-wrap items-center justify-end gap-2">
        <span class="mr-auto text-xs font-semibold uppercase tracking-wide text-slate-500">Quick range</span>
        <button class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700" @click="applyQuickRange(1)">Hari ini</button>
        <button class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700" @click="applyQuickRange(7)">7 hari</button>
        <button class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700" @click="applyQuickRange(30)">30 hari</button>
        <div class="ml-2 flex items-center gap-1.5">
          <input
            v-model.number="quickDays"
            type="number"
            min="1"
            max="365"
            class="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
          <button class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700" @click="applyCustomRange">Last N hari</button>
        </div>
      </div>

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Preset</span>
        <input
          v-model="presetName"
          type="text"
          placeholder="Nama preset"
          class="w-40 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
        />
        <button class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700" @click="saveCurrentPreset">Simpan Preset</button>
        <button class="rounded-lg border border-lime-200 px-2.5 py-1.5 text-xs font-semibold text-lime-700" :disabled="!selectedPresetId" @click="renameSelectedPreset">Rename</button>
        <select v-model="selectedPresetId" class="min-w-40 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
          <option value="">Pilih preset...</option>
          <option v-for="preset in presetOptions" :key="preset.id" :value="preset.id">{{ preset.isDefault ? `★ ${preset.name}` : preset.name }}</option>
        </select>
        <button class="rounded-lg border border-cyan-200 px-2.5 py-1.5 text-xs font-semibold text-cyan-700" :disabled="!selectedPresetId" @click="applySelectedPreset">Gunakan</button>
        <button class="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700" :disabled="!selectedPresetId" @click="setSelectedPresetAsDefault">Jadikan Default</button>
        <button class="rounded-lg border border-orange-200 px-2.5 py-1.5 text-xs font-semibold text-orange-700" :disabled="!presetOptions.some((item) => item.isDefault)" @click="clearDefaultPreset">Lepas Default</button>
        <button class="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700" :disabled="!selectedPresetId" @click="deleteSelectedPreset">Hapus</button>
        <button class="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-700" :disabled="!presetOptions.length" @click="exportPresetsToJson">Export Preset</button>
        <button class="rounded-lg border border-teal-200 px-2.5 py-1.5 text-xs font-semibold text-teal-700" @click="openPresetImportDialog">Import Preset</button>
        <input ref="presetImportInputRef" type="file" accept="application/json" class="hidden" @change="importPresetsFromJson" />
      </div>

      <div class="mt-2 flex flex-wrap justify-end gap-2">
        <p v-if="exportRangeWarning" class="mr-auto self-center text-xs font-semibold text-amber-700">{{ exportRangeWarning }}</p>
        <p v-if="autoApplyNotice" class="mr-auto self-center text-xs font-semibold text-emerald-700">{{ autoApplyNotice }}</p>
        <button class="rounded-lg border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-700" @click="openShareLinkInNewTab">Open Share Link</button>
        <button class="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700" @click="copyShareLink">Copy Share Link</button>
        <button class="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700" @click="exportCsv">Export CSV</button>
        <button class="rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-700" @click="resetToDefaultRange">Reset Default 7 Hari</button>
        <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" @click="resetFilters">Reset</button>
        <button
          class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!hasPendingFilterChanges || isLoading"
          @click="applyFilters"
        >
          Terapkan Filter
        </button>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <span class="text-xs font-semibold text-slate-500">Filter aktif: {{ activeFilterCount }}</span>
        <span v-if="activeFilterCount === 0" class="text-xs text-slate-400">Belum ada filter aktif</span>
        <span
          v-for="entry in activeFilterEntries"
          :key="`active-${entry.key}`"
          class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
        >
          {{ entry.label }}
          <button class="rounded-full bg-slate-200 px-1 text-[10px] leading-none text-slate-700" @click="clearSingleFilter(entry.key)">x</button>
        </span>
      </div>
    </section>

    <section class="grid grid-cols-1 gap-3 md:grid-cols-3">
      <article class="rounded-xl border border-slate-200 bg-white p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Log</p>
        <p class="mt-2 text-2xl font-bold text-slate-900">{{ stats.total || 0 }}</p>
      </article>
      <article class="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi Teratas</p>
        <p class="mt-2 text-sm text-slate-700" v-if="!stats.byAction?.length">Belum ada data.</p>
        <div v-else class="mt-2 flex flex-wrap gap-2">
          <span v-for="item in stats.byAction" :key="`action-${item.key}`" class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
            {{ item.key }} ({{ item.count }})
          </span>
        </div>
      </article>
      <article class="rounded-xl border border-slate-200 bg-white p-4 md:col-span-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Entity Type Teratas</p>
        <p class="mt-2 text-sm text-slate-700" v-if="!stats.byEntityType?.length">Belum ada data.</p>
        <div v-else class="mt-2 flex flex-wrap gap-2">
          <span v-for="item in stats.byEntityType" :key="`entity-${item.key}`" class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            {{ item.key }} ({{ item.count }})
          </span>
        </div>
      </article>
    </section>

    <section class="rounded-xl border border-slate-200 bg-white">
      <div class="hidden overflow-x-auto sm:block">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-slate-200 text-slate-500">
            <tr>
              <th class="px-3 py-3 font-semibold">Waktu</th>
              <th class="px-3 py-3 font-semibold">Aktor</th>
              <th class="px-3 py-3 font-semibold">Tenant</th>
              <th class="px-3 py-3 font-semibold">Entity</th>
              <th class="px-3 py-3 font-semibold">Action</th>
              <th class="px-3 py-3 font-semibold">Ringkasan</th>
              <th class="px-3 py-3 font-semibold text-right">Detail</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="isLoading">
              <td class="px-3 py-3 text-slate-500" colspan="7">Memuat audit log...</td>
            </tr>
            <tr v-else-if="rows.length === 0">
              <td class="px-3 py-3 text-slate-500" colspan="7">Tidak ada data audit untuk filter ini.</td>
            </tr>
            <tr v-for="row in rows" :key="row.id" class="border-b border-slate-100">
              <td class="px-3 py-3 text-slate-700">{{ formatDateTime(row.createdAt) }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.actor?.name || row.actor?.username || row.actor?.id || '-' }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.tenant?.name || (canFilterTenant ? 'Legacy / Unknown' : '-') }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.entityType }} / {{ row.entityId }}</td>
              <td class="px-3 py-3 font-semibold text-slate-900">{{ row.action }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.summary }}</td>
              <td class="px-3 py-3 text-right">
                <button class="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700" @click="openDetail(row)">Lihat</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="space-y-2 p-3 sm:hidden">
        <article v-if="isLoading" class="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">Memuat audit log...</article>
        <article v-else-if="rows.length === 0" class="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">Tidak ada data audit untuk filter ini.</article>
        <article v-for="row in rows" :key="`m-${row.id}`" class="rounded-lg border border-slate-200 p-3">
          <p class="text-xs text-slate-500">{{ formatDateTime(row.createdAt) }}</p>
          <p class="text-sm font-bold text-slate-900">{{ row.summary }}</p>
          <p class="text-xs text-slate-600">{{ row.entityType }} / {{ row.action }}</p>
          <p class="mt-1 text-xs text-slate-600">{{ row.actor?.name || row.actor?.username || '-' }}</p>
          <div class="mt-2 text-right">
            <button class="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700" @click="openDetail(row)">Lihat Detail</button>
          </div>
        </article>
      </div>

      <div class="flex items-center justify-between border-t border-slate-200 px-3 py-3 text-sm">
        <p class="text-slate-600">Total {{ pagination.total }} data</p>
        <div class="flex items-center gap-2">
          <button
            class="rounded border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
            :disabled="pagination.page <= 1"
            @click="goToPage(pagination.page - 1)"
          >
            Sebelumnya
          </button>
          <span class="text-slate-700">Hal {{ pagination.page }} / {{ totalPages }}</span>
          <button
            class="rounded border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 disabled:opacity-40"
            :disabled="pagination.page >= totalPages"
            @click="goToPage(pagination.page + 1)"
          >
            Berikutnya
          </button>
        </div>
      </div>
    </section>

    <BaseModal :show="Boolean(selectedLog)" title="Detail Audit Log" max-width-class="max-w-3xl" @close="selectedLog = null">
      <div v-if="selectedLog" class="space-y-3 text-sm">
        <div v-if="isLoadingDetail" class="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">Memuat detail...</div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <p><span class="font-semibold text-slate-700">Waktu:</span> {{ formatDateTime(selectedLog.createdAt) }}</p>
          <p><span class="font-semibold text-slate-700">Aktor:</span> {{ selectedLog.actor?.name || selectedLog.actor?.username || selectedLog.actor?.id || '-' }}</p>
          <p><span class="font-semibold text-slate-700">Entity:</span> {{ selectedLog.entityType }}</p>
          <p><span class="font-semibold text-slate-700">Entity ID:</span> {{ selectedLog.entityId }}</p>
          <p><span class="font-semibold text-slate-700">Action:</span> {{ selectedLog.action }}</p>
          <p><span class="font-semibold text-slate-700">Tenant:</span> {{ selectedLog.tenant?.name || 'Legacy / Unknown' }}</p>
        </div>

        <div class="rounded-lg border border-slate-200">
          <p class="border-b border-slate-200 px-3 py-2 font-semibold text-slate-800">Perubahan</p>
          <div v-if="!selectedLog.diff?.length" class="px-3 py-3 text-slate-500">Tidak ada detail perubahan yang dapat ditampilkan.</div>
          <div v-else class="divide-y divide-slate-100">
            <div v-for="item in selectedLog.diff" :key="`${item.field}-${formatValue(item.after)}`" class="px-3 py-2">
              <p class="font-semibold text-slate-800">{{ item.field }}</p>
              <p class="text-xs text-slate-500">Sebelum: {{ formatValue(item.before) }}</p>
              <p class="text-xs text-slate-500">Sesudah: {{ formatValue(item.after) }}</p>
            </div>
          </div>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
