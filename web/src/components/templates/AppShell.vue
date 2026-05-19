<script setup lang="ts">
import AppLogoPathawk from "../atoms/AppLogoPathawk.vue";

withDefaults(
  defineProps<{
    productTitle?: string;
    tagline?: string;
    /** Свернуть колонку навигации (например, на вкладке переменных). */
    collapseNav?: boolean;
  }>(),
  {
    productTitle: "Pathawk",
    tagline: "офлайн · коллекции · без облака",
    collapseNav: false,
  }
);
</script>

<template>
  <div class="app-shell">
    <header class="app-shell__header">
      <div class="app-shell__header-inner">
        <div class="app-shell__brand">
          <AppLogoPathawk class="app-shell__logo" />
          <div class="app-shell__titles">
            <span class="app-shell__product">{{ productTitle }}</span>
            <span class="app-shell__tagline">{{ tagline }}</span>
          </div>
        </div>
        <div class="app-shell__header-right">
          <slot name="header-actions" />
        </div>
      </div>
    </header>

    <div class="app-shell__workbench">
      <aside class="app-shell__activity" aria-label="Панель модулей">
        <slot name="activity" />
      </aside>
      <aside
        class="app-shell__nav"
        :class="{ 'app-shell__nav--collapsed': collapseNav }"
        aria-label="Навигация"
        :aria-hidden="collapseNav ? true : undefined"
      >
        <div class="app-shell__nav-inner">
          <slot name="nav" />
        </div>
      </aside>
      <main class="app-shell__main">
        <div class="app-shell__main-inner">
          <slot />
        </div>
      </main>
    </div>

    <footer class="app-shell__status">
      <slot name="statusbar" />
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100%;
  color: var(--text-primary);
  background: var(--bg-app);
}
.app-shell__header {
  flex-shrink: 0;
  z-index: 3;
  background: var(--header-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--chrome-divider);
  box-shadow: var(--shadow-sm);
}
.app-shell__header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  height: var(--header-h);
  padding: 0 0.65rem 0 0.85rem;
  max-width: 100%;
}
.app-shell__header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;
  flex-shrink: 0;
}
.app-shell__brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}
.app-shell__logo {
  flex-shrink: 0;
}
.app-shell__titles {
  display: flex;
  flex-direction: column;
  gap: 0;
  line-height: 1.15;
  min-width: 0;
}
.app-shell__product {
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}
.app-shell__tagline {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--text-muted);
}
.app-shell__workbench {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.app-shell__activity {
  flex-shrink: 0;
  width: var(--activity-w);
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.app-shell__nav {
  flex-shrink: 0;
  width: var(--sidebar-w);
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--chrome-divider);
  background: var(--chrome-nav);
  overflow: hidden;
}
.app-shell__nav-inner {
  flex: 1;
  min-height: 0;
  min-width: var(--sidebar-w);
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.app-shell__nav--collapsed {
  width: 0 !important;
  min-width: 0 !important;
  border-right-width: 0;
  overflow: hidden;
  padding: 0;
  margin: 0;
}
.app-shell__nav--collapsed .app-shell__nav-inner {
  min-width: 0;
  width: 0;
  overflow: hidden;
}
.app-shell__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--chrome-main);
  overflow: hidden;
}
.app-shell__main-inner {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}
.app-shell__status {
  flex-shrink: 0;
  height: var(--status-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 0.75rem;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--chrome-nav);
  border-top: 1px solid var(--chrome-divider);
}
</style>
