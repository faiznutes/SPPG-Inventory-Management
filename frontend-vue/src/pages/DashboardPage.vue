<script setup>
import { ref } from 'vue'
import PageHeader from '../components/common/PageHeader.vue'
import BaseModal from '../components/common/BaseModal.vue'
import { useNotificationsStore } from '../stores/notifications'

const stats = [
  { label: 'Item Terdaftar', value: '245', info: 'Aktif di seluruh lokasi' },
  { label: 'Stok Menipis', value: '17', info: 'Perlu diprioritaskan' },
  { label: 'Checklist Belum Submit', value: '4', info: 'Shift hari ini' },
  { label: 'PR Aktif', value: '9', info: 'Menunggu proses' },
]

const notifications = useNotificationsStore()
const showQuickAction = ref(false)
const selectedAction = ref('IN')

const actionMap = {
  IN: 'Barang Masuk',
  OUT: 'Barang Keluar',
  CHECKLIST: 'Isi Checklist',
}

function openQuickAction(action) {
  selectedAction.value = action
  showQuickAction.value = true
}

function submitQuickAction() {
  showQuickAction.value = false
  const actionLabel = actionMap[selectedAction.value]
  notifications.addNotification('Aksi cepat diproses', `${actionLabel} berhasil disimpan dari dashboard.`)
  notifications.showPopup('Berhasil', `${actionLabel} berhasil disimpan.`, 'success')
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader title="Dashboard" subtitle="Ringkasan operasional inventory dan checklist hari ini" />

    <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="item in stats" :key="item.label" class="rounded-xl border border-slate-200 bg-white p-4">
        <p class="text-sm font-semibold text-slate-500">{{ item.label }}</p>
        <p class="mt-1 text-3xl font-extrabold text-slate-900">{{ item.value }}</p>
        <p class="mt-1 text-xs text-slate-500">{{ item.info }}</p>
      </article>
    </section>

    <section class="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div class="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-2">
        <p class="text-sm font-bold text-slate-900">Stok Menipis Teratas</p>
        <ul class="mt-3 space-y-2 text-sm">
          <li class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span>Gas 3kg - Dapur A</span><span class="font-bold text-amber-600">1 tabung</span>
          </li>
          <li class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span>Sabun Cuci - Dapur B</span><span class="font-bold text-amber-600">2 botol</span>
          </li>
          <li class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span>Tissue Gulung - Gudang</span><span class="font-bold text-amber-600">3 pack</span>
          </li>
        </ul>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-4">
        <p class="text-sm font-bold text-slate-900">Aksi Cepat</p>
        <div class="mt-3 flex flex-col gap-2">
          <button class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white" @click="openQuickAction('IN')">+ Barang Masuk</button>
          <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="openQuickAction('OUT')">+ Barang Keluar</button>
          <button class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="openQuickAction('CHECKLIST')">+ Isi Checklist</button>
        </div>
      </div>
    </section>

    <BaseModal :show="showQuickAction" :title="`Form ${actionMap[selectedAction]}`" @close="showQuickAction = false">
      <form class="space-y-3" @submit.prevent="submitQuickAction">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Item</span>
          <input class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Pilih item" />
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Lokasi</span>
          <input class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Contoh: Dapur A" />
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Jumlah</span>
          <input class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Masukkan jumlah" />
        </label>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" @click="showQuickAction = false">Batal</button>
          <button type="submit" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Simpan</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
