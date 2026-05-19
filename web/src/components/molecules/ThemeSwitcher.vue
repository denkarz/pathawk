<script setup lang="ts">
import { PhMoon, PhSun } from "@phosphor-icons/vue";
import type { UiTheme } from "../../composables/useTheme";
import AppButton from "../atoms/AppButton.vue";

defineProps<{
  active: UiTheme;
}>();

const emit = defineEmits<{
  select: [theme: UiTheme];
}>();
</script>

<template>
  <div class="theme-switcher" role="group" aria-label="Тема оформления">
    <AppButton
      type="button"
      variant="ghost"
      :class="{ 'theme-switcher__btn--on': active === 'light' }"
      @click="emit('select', 'light')"
    >
      <PhSun :size="18" weight="regular" aria-hidden="true" class="theme-switcher__ico" />
      Светлая
    </AppButton>
    <AppButton
      type="button"
      variant="ghost"
      :class="{ 'theme-switcher__btn--on': active === 'dark' }"
      @click="emit('select', 'dark')"
    >
      <PhMoon :size="18" weight="regular" aria-hidden="true" class="theme-switcher__ico" />
      Тёмная
    </AppButton>
  </div>
</template>

<style scoped>
.theme-switcher {
  display: inline-flex;
  padding: 2px;
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  gap: 2px;
}
.theme-switcher :deep(.app-btn) {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.65rem;
  font-size: 12px;
  font-weight: 600;
  border: none;
  box-shadow: none;
}
.theme-switcher__ico {
  flex-shrink: 0;
  color: currentColor;
  opacity: 0.9;
}
.theme-switcher__btn--on {
  background: var(--bg-elevated) !important;
  color: var(--text-primary) !important;
  box-shadow:
    inset 0 -2px 0 0 var(--accent),
    var(--shadow-sm) !important;
  border-radius: var(--radius-sm) !important;
}
</style>
