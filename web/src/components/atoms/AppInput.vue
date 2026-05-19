<script setup lang="ts">
defineProps<{
  modelValue: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  autocomplete?: string;
  inputmode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
}>();

const emit = defineEmits<{
  "update:modelValue": [v: string];
}>();
</script>

<template>
  <input
    class="app-input"
    :type="type ?? 'text'"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :autocomplete="autocomplete"
    :inputmode="inputmode"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.app-input {
  width: 100%;
  min-width: 0;
  font: inherit;
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  outline: none;
  transition:
    border-color 0.12s ease,
    box-shadow 0.12s ease;
}
.app-input::placeholder {
  color: var(--text-muted);
}
.app-input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 2px var(--accent-muted);
}
.app-input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
