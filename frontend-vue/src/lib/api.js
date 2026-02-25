const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'

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

  if (!response.ok) {
    throw new Error(payload.message || 'Request gagal diproses.')
  }

  return payload
}

function authHeader(accessToken) {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
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
}
