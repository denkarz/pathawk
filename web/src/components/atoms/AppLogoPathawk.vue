<script setup lang="ts">
import logoUrl from "../../assets/branding/pathhawk-eagle.svg";

withDefaults(
  defineProps<{
    title?: string;
  }>(),
  { title: "Pathawk" }
);
</script>

<template>
  <img class="app-logo-pathawk" :src="logoUrl" :alt="title" />
</template>

<style scoped>
.app-logo-pathawk {
  display: inline-block;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.12));
}

[data-theme="dark"] .app-logo-pathawk :deep(svg) {
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.45));
}
</style>
