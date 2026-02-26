<script setup>
import { computed, onMounted, ref } from 'vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useNotificationsStore } from '../stores/notifications'
import { useAuthStore } from '../stores/auth'

const notifications = useNotificationsStore()
const authStore = useAuthStore()
const isLoading = ref(false)

const rows = computed(() => notifications.items)

onMounted(async () => {
  if (!authStore.accessToken) return

  isLoading.value = true
  try {
    await notifications.loadFromApi(authStore.accessToken)
    notifications.markAllAsRead()
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Notifikasi" subtitle="Daftar notifikasi aktivitas sistem" />

    <section class="rounded-xl border border-slate-200 bg-white p-4">
      <div v-if="isLoading" class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
        Memuat notifikasi...
      </div>

      <div v-else-if="rows.length === 0" class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
        Belum ada notifikasi.
      </div>

      <div v-else class="space-y-2">
        <article
          v-for="item in rows"
          :key="item.id"
          class="rounded-xl border border-slate-200 bg-slate-50 p-3"
        >
          <p class="text-sm font-bold text-slate-900">{{ item.title }}</p>
          <p class="mt-1 text-sm text-slate-600">{{ item.message }}</p>
          <p class="mt-1 text-xs text-slate-400">{{ item.relativeTime }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
