<script setup>
import { computed } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '',
  },
  message: {
    type: String,
    default: '',
  },
  variant: {
    type: String,
    default: 'info',
  },
})

const emit = defineEmits(['close'])

const variantClass = computed(() => {
  if (props.variant === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  if (props.variant === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (props.variant === 'error') return 'border-rose-200 bg-rose-50 text-rose-900'
  return 'border-blue-200 bg-blue-50 text-blue-900'
})

const variantIcon = computed(() => {
  if (props.variant === 'success') return 'check_circle'
  if (props.variant === 'warning') return 'warning'
  if (props.variant === 'error') return 'error'
  return 'info'
})
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-fade">
      <div v-if="show" class="fixed right-4 top-4 z-[120] w-[calc(100%-2rem)] max-w-sm sm:right-6 sm:top-6">
        <div :class="['rounded-xl border p-3 shadow-lg backdrop-blur', variantClass]">
          <div class="flex items-start gap-2">
            <span class="material-symbols-outlined mt-0.5 text-base">{{ variantIcon }}</span>
            <div class="flex-1">
              <p class="text-sm font-extrabold">{{ title }}</p>
              <p class="mt-1 text-sm">{{ message }}</p>
            </div>
            <button class="rounded p-0.5 text-xs opacity-70 hover:opacity-100" @click="emit('close')">
              <span class="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
