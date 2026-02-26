import { defineStore } from 'pinia'
import { api } from '../lib/api'

const ACCESS_TOKEN_KEY = 'sppg_access_token'
const USER_KEY = 'sppg_user'
const DEFAULT_TENANT_NAME = 'SPPG Tambak Wedi'

const roleLabelMap = {
  SUPER_ADMIN: 'SUPER ADMIN',
  TENANT_ADMIN: 'ADMIN TENANT',
  ADMIN: 'ADMIN',
  PIC: 'PIC',
  WAREHOUSE: 'GUDANG',
  KOORD_DAPUR: 'KOORDINATOR DAPUR',
  KOORD_KEBERSIHAN: 'KOORDINATOR KEBERSIHAN',
  KOORD_LAPANGAN: 'KOORDINATOR LAPANGAN',
  STAFF: 'STAFF',
  VIEWER: 'VIEWER',
}

function roleToLabel(role) {
  if (!role) return 'OPERASIONAL'
  return roleLabelMap[role] || String(role).replaceAll('_', ' ')
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: '',
    user: null,
    availableTenants: [],
    isHydrated: false,
    isLoading: false,
    errorMessage: '',
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken && state.user),
    tenantName: (state) => state.user?.tenant?.name || DEFAULT_TENANT_NAME,
    operationalLabel: (state) => roleToLabel(state.user?.role),
    isSuperAdmin: (state) => state.user?.role === 'SUPER_ADMIN',
  },

  actions: {
    hydrate() {
      if (this.isHydrated) return

      const token = localStorage.getItem(ACCESS_TOKEN_KEY)
      const rawUser = localStorage.getItem(USER_KEY)

      this.accessToken = token || ''
      this.user = rawUser ? JSON.parse(rawUser) : null
      this.availableTenants = this.user?.availableTenants || []
      this.isHydrated = true
    },

    setSession(accessToken, user) {
      this.accessToken = accessToken
      this.user = user
      this.availableTenants = user?.availableTenants || []
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
      localStorage.setItem(USER_KEY, JSON.stringify(user))
    },

    clearSession() {
      this.accessToken = ''
      this.user = null
      this.availableTenants = []
      this.errorMessage = ''
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    },

    async login(username, password) {
      this.isLoading = true
      this.errorMessage = ''

      try {
        const data = await api.login({ username, password })
        this.setSession(data.accessToken, data.user)
        return true
      } catch (error) {
        this.errorMessage = error instanceof Error ? error.message : 'Login gagal.'
        this.clearSession()
        return false
      } finally {
        this.isLoading = false
      }
    },

    async fetchMe() {
      if (!this.accessToken) return false

      try {
        const user = await api.me(this.accessToken)
        this.user = user
        this.availableTenants = user?.availableTenants || this.availableTenants
        localStorage.setItem(USER_KEY, JSON.stringify(user))
        return true
      } catch {
        return false
      }
    },

    async refreshSession() {
      try {
        const refreshed = await api.refresh()
        this.accessToken = refreshed.accessToken
        localStorage.setItem(ACCESS_TOKEN_KEY, refreshed.accessToken)

        const userOk = await this.fetchMe()
        return userOk
      } catch {
        this.clearSession()
        return false
      }
    },

    async fetchTenants() {
      if (!this.accessToken) return []

      try {
        const rows = await api.listMyTenants(this.accessToken)
        this.availableTenants = Array.isArray(rows) ? rows : []
        if (this.user) {
          this.user = {
            ...this.user,
            availableTenants: this.availableTenants,
          }
          localStorage.setItem(USER_KEY, JSON.stringify(this.user))
        }
        return this.availableTenants
      } catch {
        return this.availableTenants
      }
    },

    async switchTenant(tenantId) {
      if (!this.accessToken) return false

      try {
        const data = await api.selectTenant(this.accessToken, tenantId)
        this.setSession(data.accessToken, data.user)
        return true
      } catch (error) {
        this.errorMessage = error instanceof Error ? error.message : 'Gagal mengganti tenant.'
        return false
      }
    },

    async logout() {
      try {
        await api.logout()
      } finally {
        this.clearSession()
      }
    },
  },
})
