<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { PhX } from "@phosphor-icons/vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    /** Не закрывать по Escape и клику на подложку */
    persistent?: boolean;
  }>(),
  { title: "", persistent: false }
);

const emit = defineEmits<{
  "update:open": [v: boolean];
  close: [];
}>();

function close() {
  if (props.persistent) return;
  emit("update:open", false);
  emit("close");
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) close();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.open) {
    e.preventDefault();
    close();
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      document.addEventListener("keydown", onKeydown);
      document.body.style.overflow = "hidden";
    } else {
      document.removeEventListener("keydown", onKeydown);
      document.body.style.overflow = "";
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="app-modal-backdrop"
      role="presentation"
      @click="onBackdrop"
    >
      <div
        class="app-modal"
        role="dialog"
        :aria-labelledby="title ? 'app-modal-title' : undefined"
        aria-modal="true"
        @click.stop
      >
        <header class="app-modal__header">
          <h2 v-if="title" id="app-modal-title" class="app-modal__title">
            <slot name="title">{{ title }}</slot>
          </h2>
          <span v-else class="app-modal__title-spacer" />
          <button
            type="button"
            class="app-modal__close"
            :disabled="persistent"
            aria-label="Закрыть"
            @click="close"
          >
            <PhX :size="20" weight="regular" aria-hidden="true" />
          </button>
        </header>
        <div class="app-modal__body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.app-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
}
[data-theme="dark"] .app-modal-backdrop {
  background: rgba(0, 0, 0, 0.55);
}
.app-modal {
  width: min(100%, 440px);
  max-height: min(90vh, 720px);
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-md);
}
.app-modal__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.65rem 0.6rem 0.85rem;
  border-bottom: 1px solid var(--border-default);
  background: var(--chrome-nav);
}
.app-modal__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.25;
}
.app-modal__title-spacer {
  flex: 1;
  min-width: 0;
}
.app-modal__close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.app-modal__close:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.app-modal__close:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.app-modal__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.85rem;
}
</style>
