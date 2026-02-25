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

const variantClass = computed(() => {
  if (props.variant === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  if (props.variant === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (props.variant === 'error') return 'border-rose-200 bg-rose-50 text-rose-900'
  return 'border-blue-200 bg-blue-50 text-blue-900'
})
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-fade">
      <div v-if="show" class="fixed right-4 top-4 z-[120] w-[calc(100%-2rem)] max-w-sm">
        <div :class="['rounded-xl border p-3 shadow-lg', variantClass]">
          <p class="text-sm font-extrabold">{{ title }}</p>
          <p class="mt-1 text-sm">{{ message }}</p>
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
