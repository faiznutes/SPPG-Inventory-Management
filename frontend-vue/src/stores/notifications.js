import { defineStore } from 'pinia'

let toastTimeoutId

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    isListOpen: false,
    toast: {
      show: false,
      title: '',
      message: '',
      variant: 'info',
    },
    items: [
      {
        id: 1,
        title: 'Stok menipis',
        message: 'Gas 3kg di Dapur A tersisa 1 tabung.',
        time: 'Baru saja',
      },
      {
        id: 2,
        title: 'Checklist masuk',
        message: 'Checklist Harian Dapur B sudah disubmit.',
        time: '15 menit lalu',
      },
    ],
  }),
  actions: {
    openList() {
      this.isListOpen = true
    },
    closeList() {
      this.isListOpen = false
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
