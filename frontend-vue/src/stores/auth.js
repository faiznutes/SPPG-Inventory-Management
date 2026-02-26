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
    isHydrated: false,
    isLoading: false,
    errorMessage: '',
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken && state.user),
    tenantName: (state) => state.user?.tenant?.name || DEFAULT_TENANT_NAME,
    operationalLabel: (state) => roleToLabel(state.user?.role),
  },

  actions: {
    hydrate() {
      if (this.isHydrated) return

      const token = localStorage.getItem(ACCESS_TOKEN_KEY)
      const rawUser = localStorage.getItem(USER_KEY)

      this.accessToken = token || ''
      this.user = rawUser ? JSON.parse(rawUser) : null
      this.isHydrated = true
    },

    setSession(accessToken, user) {
      this.accessToken = accessToken
      this.user = user
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
      localStorage.setItem(USER_KEY, JSON.stringify(user))
    },

    clearSession() {
      this.accessToken = ''
      this.user = null
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

    async logout() {
      try {
        await api.logout()
      } finally {
        this.clearSession()
      }
    },
  },
})
