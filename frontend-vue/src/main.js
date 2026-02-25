import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import router from './router'
import { pinia } from './stores'
import { useAuthStore } from './stores/auth'

const app = createApp(App)

app.use(pinia)
app.use(VueQueryPlugin)
app.use(router)

const authStore = useAuthStore(pinia)
authStore.hydrate()

app.mount('#app')
