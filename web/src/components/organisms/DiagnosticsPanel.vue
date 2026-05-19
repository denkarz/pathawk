<script setup lang="ts">
import { computed, unref, type MaybeRef } from "vue";
import AppButton from "../atoms/AppButton.vue";
import type { DiagnosticEntry } from "../../composables/useDiagnostics";

const props = defineProps<{
  entries: readonly DiagnosticEntry[];
  errorsCount: MaybeRef<number>;
  warningsCount: MaybeRef<number>;
}>();

const emit = defineEmits<{
  clear: [];
}>();

const errors = computed(() => unref(props.errorsCount));
const warnings = computed(() => unref(props.warningsCount));

function fmt(ts: number): string {
  try {
    return new Date(ts).toLocaleString("ru-RU");
  } catch {
    return "";
  }
}
</script>

<template>
  <section class="diag" aria-label="Ошибки и предупреждения">
    <div class="diag__top">
      <div class="diag__title">
        <div class="diag__h">Информация</div>
        <div class="diag__meta">
          <span class="diag__pill diag__pill--err">Ошибки: {{ errors }}</span>
          <span class="diag__pill diag__pill--warn">Варнинги: {{ warnings }}</span>
        </div>
      </div>
      <AppButton type="button" variant="ghost" :disabled="entries.length === 0" @click="emit('clear')">
        Очистить
      </AppButton>
    </div>

    <ul v-if="entries.length" class="diag__list">
      <li v-for="e in entries" :key="e.id" class="diag__item" :class="`diag__item--${e.level}`">
        <div class="diag__row">
          <span class="diag__lvl">{{ e.level === 'error' ? 'Ошибка' : 'Warning' }}</span>
          <span class="diag__ts">{{ fmt(e.ts) }}</span>
        </div>
        <div class="diag__msg">{{ e.message }}</div>
      </li>
    </ul>
    <p v-else class="diag__empty">Пока нет ошибок и предупреждений.</p>
  </section>
</template>

<style scoped>
.diag {
  flex: 1;
  min-height: 0;
  padding: 0.75rem 0.85rem 1rem;
}
.diag__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.diag__h {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.diag__meta {
  margin-top: 0.35rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.diag__pill {
  font-size: 11px;
  padding: 0.15rem 0.45rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-default);
  background: var(--bg-subtle);
  color: var(--text-secondary);
}
.diag__pill--err {
  border-color: rgba(220, 38, 38, 0.25);
}
.diag__pill--warn {
  border-color: rgba(245, 158, 11, 0.25);
}
.diag__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.diag__item {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.6rem;
  background: var(--bg-elevated);
}
.diag__item--error {
  border-color: rgba(220, 38, 38, 0.28);
}
.diag__item--warning {
  border-color: rgba(245, 158, 11, 0.28);
}
.diag__row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  font-size: 11px;
  color: var(--text-muted);
}
.diag__lvl {
  font-weight: 700;
}
.diag__msg {
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.4;
  white-space: pre-wrap;
}
.diag__empty {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}
</style>

