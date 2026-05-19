<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string;
    rows?: number;
    disabled?: boolean;
    spellcheck?: boolean;
  }>(),
  { rows: 4, spellcheck: false }
);

const emit = defineEmits<{
  "update:modelValue": [v: string];
}>();
</script>

<template>
  <textarea
    class="app-textarea"
    :rows="rows"
    :value="modelValue"
    :disabled="disabled"
    :spellcheck="spellcheck"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<style scoped>
.app-textarea {
  width: 100%;
  display: block;
  font: inherit;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.45;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  resize: vertical;
  outline: none;
  transition:
    border-color 0.12s ease,
    box-shadow 0.12s ease;
}
.app-textarea::placeholder {
  color: var(--text-muted);
}
.app-textarea:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 2px var(--accent-muted);
}
.app-textarea:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
