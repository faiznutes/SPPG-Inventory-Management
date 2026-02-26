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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
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
    throw new Error(payload.message || 'Request gagal diproses.')
  }

  return payload
}

function authHeader(accessToken) {
  const latestToken = getStoredAccessToken()
  const finalToken = latestToken || accessToken
  return finalToken ? { Authorization: `Bearer ${finalToken}` } : {}
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

  listCategories: (accessToken) =>
    request('/categories', {
      headers: authHeader(accessToken),
    }),

  createCategory: (accessToken, body) =>
    request('/categories', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  listItems: (accessToken) =>
    request('/items', {
      headers: authHeader(accessToken),
    }),

  createItem: (accessToken, body) =>
    request('/items', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  listStocks: (accessToken) =>
    request('/stocks', {
      headers: authHeader(accessToken),
    }),

  listTransactions: (accessToken) =>
    request('/transactions', {
      headers: authHeader(accessToken),
    }),

  createTransaction: (accessToken, body) =>
    request('/transactions', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  getTodayChecklist: (accessToken) =>
    request('/checklists/today', {
      headers: authHeader(accessToken),
    }),

  submitTodayChecklist: (accessToken, body) =>
    request('/checklists/today/submit', {
      method: 'POST',
      headers: authHeader(accessToken),
      body: JSON.stringify(body),
    }),

  listPurchaseRequests: (accessToken) =>
    request('/purchase-requests', {
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

  listNotifications: (accessToken) =>
    request('/notifications', {
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
