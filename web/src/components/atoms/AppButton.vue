<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger" | "link";
    disabled?: boolean;
    type?: "button" | "submit";
    block?: boolean;
  }>(),
  { variant: "secondary", type: "button", block: false }
);
</script>

<template>
  <button
    class="app-btn"
    :class="[`app-btn--${variant}`, { 'app-btn--block': block }]"
    :type="type"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.app-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease,
    opacity 0.12s ease;
}
.app-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.app-btn--block {
  width: 100%;
}
.app-btn--primary {
  background: linear-gradient(165deg, var(--accent) 0%, #3730a3 100%);
  color: var(--text-on-accent);
  border-color: transparent;
}
[data-theme="dark"] .app-btn--primary {
  background: linear-gradient(165deg, var(--accent) 0%, #312e81 100%);
  color: var(--text-on-accent);
}
.app-btn--primary:not(:disabled):hover {
  filter: brightness(1.06);
  box-shadow: 0 0 0 1px var(--accent-muted);
}
.app-btn--secondary {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-color: var(--border-default);
  box-shadow: var(--shadow-sm);
}
.app-btn--secondary:not(:disabled):hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}
.app-btn--ghost {
  background: transparent;
  color: var(--text-secondary);
  border-color: transparent;
}
.app-btn--ghost:not(:disabled):hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.app-btn--danger {
  background: transparent;
  color: #dc2626;
  border-color: transparent;
}
[data-theme="dark"] .app-btn--danger {
  color: #f87171;
}
.app-btn--danger:not(:disabled):hover {
  background: rgba(220, 38, 38, 0.08);
}
.app-btn--link {
  background: none;
  border: none;
  padding: 0.25rem 0.35rem;
  color: var(--accent);
  text-decoration: none;
  box-shadow: none;
}
.app-btn--link:not(:disabled):hover {
  text-decoration: underline;
  color: var(--accent-hover);
}
</style>
