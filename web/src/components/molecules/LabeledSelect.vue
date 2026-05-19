<script setup lang="ts">
import AppSelect from "../atoms/AppSelect.vue";

defineProps<{
  modelValue: string;
  label: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [v: string];
}>();
</script>

<template>
  <label class="labeled-select">
    <span class="labeled-select__label">{{ label }}</span>
    <AppSelect
      :model-value="modelValue"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <slot />
    </AppSelect>
  </label>
</template>

<style scoped>
.labeled-select {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}
.labeled-select__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.labeled-select :deep(.app-select) {
  width: 100%;
}
</style>
