<script setup>
import { reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const form = reactive({
  username: '',
  password: '',
})

async function submitLogin() {
  const ok = await authStore.login(form.username, form.password)
  if (!ok) return

  const redirectPath = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
  router.push(redirectPath)
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-4">
    <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div class="mb-6 text-center">
        <p class="text-sm font-semibold text-blue-600">Inventory SPPG / MBG</p>
        <h1 class="mt-1 text-2xl font-extrabold text-slate-900">Masuk Sistem</h1>
        <p class="mt-1 text-sm text-slate-500">Gunakan akun petugas untuk melanjutkan</p>
      </div>

      <form class="space-y-4" @submit.prevent="submitLogin">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Username</span>
          <input
            v-model="form.username"
            class="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            placeholder="contoh: admin"
            autocomplete="username"
          />
        </label>

        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Password</span>
          <input
            v-model="form.password"
            type="password"
            class="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            placeholder="Masukkan password"
            autocomplete="current-password"
          />
        </label>

        <p v-if="authStore.errorMessage" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {{ authStore.errorMessage }}
        </p>

        <button
          type="submit"
          class="mt-2 flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
          :disabled="authStore.isLoading"
        >
          {{ authStore.isLoading ? 'Memproses...' : 'Masuk' }}
        </button>

        <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Akun dev default: <span class="font-semibold text-slate-700">admin / admin12345</span>
        </p>
      </form>
    </div>
  </div>
</template>
