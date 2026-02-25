<script setup>
defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
  maxWidthClass: {
    type: String,
    default: 'max-w-lg',
  },
})

const emit = defineEmits(['close'])
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/55" @click="emit('close')" />
        <div :class="['relative z-10 w-full rounded-2xl border border-slate-200 bg-white shadow-xl', maxWidthClass]">
          <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p class="text-base font-extrabold text-slate-900">{{ title }}</p>
            <button class="rounded-md p-1 text-slate-500 hover:bg-slate-100" @click="emit('close')">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="p-4">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
