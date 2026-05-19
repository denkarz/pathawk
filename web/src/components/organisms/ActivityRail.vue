<script setup lang="ts">
import {
  PhFolders,
  PhGlobeHemisphereWest,
  PhGitBranch,
  PhInfo,
} from "@phosphor-icons/vue";

export type RailModule = "collections" | "environments" | "git" | "info";

defineProps<{
  modelValue: RailModule;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: RailModule];
}>();
</script>

<template>
  <nav class="activity-rail" aria-label="Разделы приложения">
    <button
      type="button"
      class="activity-rail__btn"
      :class="{ 'activity-rail__btn--on': modelValue === 'collections' }"
      title="Коллекции"
      aria-label="Коллекции"
      @click="emit('update:modelValue', 'collections')"
    >
      <PhFolders :size="22" weight="regular" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="activity-rail__btn"
      :class="{ 'activity-rail__btn--on': modelValue === 'environments' }"
      title="Окружения"
      aria-label="Окружения"
      @click="emit('update:modelValue', 'environments')"
    >
      <PhGlobeHemisphereWest :size="22" weight="regular" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="activity-rail__btn"
      :class="{ 'activity-rail__btn--on': modelValue === 'git' }"
      title="Git"
      aria-label="Git"
      @click="emit('update:modelValue', 'git')"
    >
      <PhGitBranch :size="22" weight="regular" aria-hidden="true" />
    </button>
    <div class="activity-rail__spacer" aria-hidden="true" />
    <button
      type="button"
      class="activity-rail__btn"
      :class="{ 'activity-rail__btn--on': modelValue === 'info' }"
      title="Информация"
      aria-label="Информация"
      @click="emit('update:modelValue', 'info')"
    >
      <PhInfo :size="22" weight="regular" aria-hidden="true" />
    </button>
  </nav>
</template>

<style scoped>
.activity-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 0.35rem 0;
  border-right: 1px solid var(--chrome-divider);
  background: var(--chrome-rail);
}
.activity-rail__spacer {
  flex: 1;
}
.activity-rail__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}
.activity-rail__btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.activity-rail__btn--on {
  background: var(--chrome-nav);
  color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--border-default);
}
</style>
