const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const ACCESS_TOKEN_KEY = 'sppg_access_token'
const USER_KEY = 'sppg_user'

let refreshPromise = null

function getStoredAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || ''
}

function setStoredAccessToken(accessToken) {
  if (!accessToken) return
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
}

function clearStoredSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok || !payload.accessToken) {
        throw new Error(payload.message || 'Sesi berakhir. Silakan login ulang.')
      }

      setStoredAccessToken(payload.accessToken)
      return payload.accessToken
    })().finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}

function redirectToLogin() {
  const currentPath = `${window.location.pathname}${window.location.search}`
  const redirectParam = encodeURIComponent(currentPath)
  window.location.assign(`/login?redirect=${redirectParam}`)
}

function shouldSkipRefresh(path) {
  return path.startsWith('/auth/login') || path.startsWith('/auth/refresh') || path.startsWith('/auth/logout')
}

async function request(path, options = {}) {
  const mergedHeaders = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: mergedHeaders,
  })

  const payload = await response.json().catch(() => ({}))

  if (response.status === 401 && !options._retry && !shouldSkipRefresh(path)) {
    try {
      const refreshedAccessToken = await refreshAccessToken()
      return request(path, {
        ...options,
        _retry: true,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${refreshedAccessToken}`,
        },
      })
    } catch {
      clearStoredSession()
      redirectToLogin()
      throw new Error('Sesi berakhir. Silakan login ulang.')
    }
  }

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload))
  }

  return payload
}

async function requestBlob(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
  })

  if (response.status === 401 && !options._retry && !shouldSkipRefresh(path)) {
    try {
      const refreshedAccessToken = await refreshAccessToken()
      return requestBlob(path, {
        ...options,
        _retry: true,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${refreshedAccessToken}`,
        },
      })
    } catch {
      clearStoredSession()
      redirectToLogin()
      throw new Error('Sesi berakhir. Silakan login ulang.')
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(extractErrorMessage(payload))
  }

  return response.blob()
}

function extractErrorMessage(payload) {
  if (payload?.code === 'VALIDATION_ERROR' && payload?.details?.fieldErrors) {
    const entries = Object.entries(payload.details.fieldErrors).filter(([, messages]) => Array.isArray(messages) && messages.length)
    if (entries.length) {
      const [field, messages] = entries[0]
      return `${field}: ${messages[0]}`
    }
  }

  if (payload?.code === 'VALIDATION_ERROR' && Array.isArray(payload?.details?.formErrors) && payload.details.formErrors.length) {
    return payload.details.formErrors[0]
  }

  if (payload?.message) return payload.message
  return 'Request gagal diproses.'
}

function authHeader(accessToken) {
  const latestToken = getStoredAccessToken()
  const finalToken = latestToken || accessToken
  return finalToken ? { Authorization: `Bearer ${finalToken}` } : {}
}

function withQuery(path, query = {}) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    params.set(key, String(value))
  })
  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}

export const api = {
  login: (body) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  refresh: () =>
    request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  me: (accessToken) =>
    request('/auth/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  listMyTenants: (accessToken) =>
    request('/auth/tenants', {
      headers: authHeader(accessToken),
    }),
  selectTenant: (accessToken, tenantId) =>
    request('/auth/tenant/select', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify({ tenantId }),
    }),
  changePassword: (accessToken, body) =>
    request('/auth/change-password', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),
  logout: () =>
    request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  listUsers: (accessToken) =>
    request('/users', {
      headers: authHeader(accessToken),
    }),

  createUser: (accessToken, body) =>
    request('/users', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  listTenants: (accessToken, query = {}) =>
    request(withQuery('/tenants', query), {
      headers: authHeader(accessToken),
    }),

  createTenant: (accessToken, body) =>
    request('/tenants', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  updateTenant: (accessToken, tenantId, body) =>
    request(`/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  deleteTenant: (accessToken, tenantId) =>
    request(`/tenants/${tenantId}`, {
      method: 'DELETE',
      headers: authHeader(accessToken),
    }),

  updateTenantStatus: (accessToken, tenantId, body) =>
    request(`/tenants/${tenantId}/status`, {
      method: 'PATCH',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  reactivateTenant: (accessToken, tenantId) =>
    request(`/tenants/${tenantId}/reactivate`, {
      method: 'POST',
      headers: authHeader(accessToken),
    }),

  restoreTenant: (accessToken, tenantId) =>
    request(`/tenants/${tenantId}/restore`, {
      method: 'POST',
      headers: authHeader(accessToken),
    }),

  bulkTenantAction: (accessToken, body) =>
    request('/tenants/bulk/action', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  getTenantDetail: (accessToken, tenantId) =>
    request(`/tenants/${tenantId}`, {
      headers: authHeader(accessToken),
    }),

  addTenantUser: (accessToken, tenantId, body) =>
    request(`/tenants/${tenantId}/users`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  bulkTenantUserAction: (accessToken, tenantId, body) =>
    request(`/tenants/${tenantId}/users/bulk/action`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  updateTenantUser: (accessToken, tenantId, userId, body) =>
    request(`/tenants/${tenantId}/users/${userId}`, {
      method: 'PATCH',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  addTenantLocation: (accessToken, tenantId, body) =>
    request(`/tenants/${tenantId}/locations`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  bulkTenantLocationAction: (accessToken, tenantId, body) =>
    request(`/tenants/${tenantId}/locations/bulk/action`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  updateTenantLocation: (accessToken, tenantId, locationId, body) =>
    request(`/tenants/${tenantId}/locations/${locationId}`, {
      method: 'PATCH',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  getTenantTelegramSettings: (accessToken, tenantId) =>
    request(`/tenants/${tenantId}/telegram-settings`, {
      headers: authHeader(accessToken),
    }),

  updateTenantTelegramSettings: (accessToken, tenantId, body) =>
    request(`/tenants/${tenantId}/telegram-settings`, {
      method: 'PUT',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  listLocations: (accessToken) =>
    request('/locations', {
      headers: authHeader(accessToken),
    }),

  createLocation: (accessToken, body) =>
    request('/locations', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  listCategories: (accessToken, query = {}) =>
    request(withQuery('/categories', query), {
      headers: authHeader(accessToken),
    }),

  createCategory: (accessToken, body) =>
    request('/categories', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  updateCategory: (accessToken, id, body) =>
    request(`/categories/${id}`, {
      method: 'PATCH',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  deleteCategory: (accessToken, id) =>
    request(`/categories/${id}`, {
      method: 'DELETE',
      headers: authHeader(accessToken),
    }),

  updateCategoryStatus: (accessToken, id, body) =>
    request(`/categories/${id}/status`, {
      method: 'PATCH',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  bulkCategoryAction: (accessToken, body) =>
    request('/categories/bulk/action', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  listItems: (accessToken, query = {}) =>
    request(withQuery('/items', query), {
      headers: authHeader(accessToken),
    }),

  createItem: (accessToken, body) =>
    request('/items', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  bulkItemAction: (accessToken, body) =>
    request('/items/bulk/action', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  listStocks: (accessToken) =>
    request('/stocks', {
      headers: authHeader(accessToken),
    }),

  listTransactions: (accessToken, query = {}) =>
    request(withQuery('/transactions', query), {
      headers: authHeader(accessToken),
    }),

  createTransaction: (accessToken, body) =>
    request('/transactions', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  bulkAdjustTransactions: (accessToken, body) =>
    request('/transactions/bulk/adjust', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  getTodayChecklist: (accessToken) =>
    request('/checklists/today', {
      headers: authHeader(accessToken),
    }),

  getChecklistMonitoring: (accessToken, query = {}) =>
    request(withQuery('/checklists/monitoring', query), {
      headers: authHeader(accessToken),
    }),

  submitTodayChecklist: (accessToken, body) =>
    request('/checklists/today/submit', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  sendChecklistExportTelegram: (accessToken, body) =>
    request('/checklists/today/export/send-telegram', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  sendChecklistMonitoringExportTelegram: (accessToken, body) =>
    request('/checklists/monitoring/export/send-telegram', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  listPurchaseRequests: (accessToken, query = {}) =>
    request(withQuery('/purchase-requests', query), {
      headers: authHeader(accessToken),
    }),

  createPurchaseRequest: (accessToken, body) =>
    request('/purchase-requests', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  getPurchaseRequestDetail: (accessToken, id) =>
    request(`/purchase-requests/${id}`, {
      headers: authHeader(accessToken),
    }),

  updatePurchaseRequestStatus: (accessToken, id, body) =>
    request(`/purchase-requests/${id}/status`, {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  bulkUpdatePurchaseRequestStatus: (accessToken, body) =>
    request('/purchase-requests/bulk/status', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  listNotifications: (accessToken) =>
    request('/notifications', {
      headers: authHeader(accessToken),
    }),

  listAuditLogs: (accessToken, query = {}) =>
    request(withQuery('/audit-logs', query), {
      headers: authHeader(accessToken),
    }),

  getAuditLogDetail: (accessToken, id) =>
    request(`/audit-logs/${id}`, {
      headers: authHeader(accessToken),
    }),

  exportAuditLogsCsv: (accessToken, query = {}) =>
    requestBlob(withQuery('/audit-logs/export', query), {
      headers: authHeader(accessToken),
    }),

  getDashboardSummary: (accessToken) =>
    request('/dashboard/summary', {
      headers: authHeader(accessToken),
    }),

  getDashboardLowStock: (accessToken) =>
    request('/dashboard/low-stock', {
      headers: authHeader(accessToken),
    }),
}
