<script setup>
import { computed } from 'vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useNotificationsStore } from '../stores/notifications'

const notifications = useNotificationsStore()

const rows = computed(() => notifications.items)
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Notifikasi" subtitle="Daftar notifikasi aktivitas sistem" />

    <section class="rounded-xl border border-slate-200 bg-white p-4">
      <div v-if="rows.length === 0" class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
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
          <p class="mt-1 text-xs text-slate-400">{{ item.time }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
