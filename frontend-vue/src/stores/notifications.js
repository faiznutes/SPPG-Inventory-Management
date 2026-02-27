import { defineStore } from 'pinia'
import { api } from '../lib/api'

let toastTimeoutId
const LAST_READ_AT_KEY = 'sppg_notifications_last_read_at'

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    toast: {
      show: false,
      title: '',
      message: '',
      variant: 'info',
    },
    items: [],
    lastReadAt: Number(localStorage.getItem(LAST_READ_AT_KEY) || 0),
  }),
  getters: {
    unreadCount: (state) => {
      if (!state.lastReadAt) return state.items.length
      return state.items.filter((item) => new Date(item.time).getTime() > state.lastReadAt).length
    },
  },
  actions: {
    formatRelativeTime(isoTime) {
      const date = new Date(isoTime)
      if (Number.isNaN(date.getTime())) return '-'

      const diffMs = Date.now() - date.getTime()
      const diffMin = Math.floor(diffMs / 60000)
      if (diffMin <= 0) return 'Baru saja'
      if (diffMin < 60) return `${diffMin} menit lalu`

      const diffHour = Math.floor(diffMin / 60)
      if (diffHour < 24) return `${diffHour} jam lalu`

      const diffDay = Math.floor(diffHour / 24)
      return `${diffDay} hari lalu`
    },

    async loadFromApi(accessToken) {
      if (!accessToken) return

      const rows = await api.listNotifications(accessToken)
      this.items = rows.map((item) => ({
        id: item.id,
        title: item.title,
        message: item.message,
        time: item.time,
        relativeTime: this.formatRelativeTime(item.time),
        type: item.type,
        tenantCode: item.tenantCode || '',
      }))
    },

    markAllAsRead() {
      this.lastReadAt = Date.now()
      localStorage.setItem(LAST_READ_AT_KEY, String(this.lastReadAt))
    },

    showPopup(title, message, variant = 'info') {
      this.toast = {
        show: true,
        title,
        message,
        variant,
      }

      clearTimeout(toastTimeoutId)
      toastTimeoutId = setTimeout(() => {
        this.toast.show = false
      }, 3200)
    },
    closePopup() {
      this.toast.show = false
      clearTimeout(toastTimeoutId)
    },
    addNotification(title, message, variant = 'info') {
      this.items.unshift({
        id: Date.now(),
        title,
        message,
        time: new Date().toISOString(),
        relativeTime: 'Baru saja',
        type: variant,
      })

      this.showPopup(title, message, variant)
    },
  },
})
