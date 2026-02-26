import { defineStore } from 'pinia'

let toastTimeoutId

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    toast: {
      show: false,
      title: '',
      message: '',
      variant: 'info',
    },
    items: [],
  }),
  actions: {
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
      }, 2500)
    },
    closePopup() {
      this.toast.show = false
      clearTimeout(toastTimeoutId)
    },
    addNotification(title, message) {
      this.items.unshift({
        id: Date.now(),
        title,
        message,
        time: 'Baru saja',
      })
    },
  },
})
