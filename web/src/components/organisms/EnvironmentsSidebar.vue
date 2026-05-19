<script setup lang="ts">
import { PhPencilSimple, PhPlus, PhTrash } from "@phosphor-icons/vue";
import AppButton from "../atoms/AppButton.vue";

withDefaults(
  defineProps<{
    environments: { id: string; name: string }[];
    selectedEnvironmentId: string;
    loading?: boolean;
    embedded?: boolean;
  }>(),
  { loading: false, embedded: false }
);

const emit = defineEmits<{
  "update:selectedEnvironmentId": [id: string];
  newEnvironment: [];
  renameEnvironment: [id: string];
  deleteEnvironment: [id: string];
}>();
</script>

<template>
  <div class="env-sidebar" :class="{ 'env-sidebar--embed': embedded }">
    <div class="env-sidebar__header">
      <div class="env-sidebar__header-top">
        <h1 class="env-sidebar__h">Окружения</h1>
        <AppButton
          type="button"
          variant="ghost"
          class="env-sidebar__icon-btn"
          aria-label="Новое окружение"
          title="Новое окружение"
          :disabled="loading"
          @click="emit('newEnvironment')"
        >
          <PhPlus :size="18" weight="bold" aria-hidden="true" />
        </AppButton>
      </div>
      <p class="env-sidebar__sub">Документы на диске · выберите для редактирования переменных</p>
    </div>

    <p v-if="loading" class="env-sidebar__muted">Загрузка…</p>

    <template v-else>
      <ul v-if="environments.length" class="env-sidebar__list" role="list">
        <li v-for="e in environments" :key="e.id" class="env-sidebar__li">
          <button
            type="button"
            class="env-sidebar__row"
            :class="{ 'env-sidebar__row--active': e.id === selectedEnvironmentId }"
            @click="emit('update:selectedEnvironmentId', e.id)"
          >
            <span class="env-sidebar__name">{{ e.name }}</span>
          </button>
          <AppButton
            type="button"
            variant="ghost"
            class="env-sidebar__act env-sidebar__act--rename"
            title="Переименовать"
            aria-label="Переименовать"
            @click.stop="emit('renameEnvironment', e.id)"
          >
            <PhPencilSimple :size="16" weight="bold" aria-hidden="true" />
          </AppButton>
          <AppButton
            type="button"
            variant="danger"
            class="env-sidebar__act env-sidebar__act--delete"
            title="Удалить"
            aria-label="Удалить"
            @click.stop="emit('deleteEnvironment', e.id)"
          >
            <PhTrash :size="16" weight="bold" aria-hidden="true" />
          </AppButton>
        </li>
      </ul>
      <p v-else class="env-sidebar__muted">Нет окружений. Нажмите «+», чтобы создать.</p>
    </template>
  </div>
</template>

<style scoped>
.env-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.85rem 0.9rem 1.25rem;
  min-height: 100%;
}
.env-sidebar--embed {
  flex: 1;
  min-height: 0;
  padding: 0.65rem 0.75rem 0.85rem;
}
.env-sidebar__header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.env-sidebar__h {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.env-sidebar__sub {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-muted);
}
.env-sidebar__icon-btn {
  min-width: 2rem;
  min-height: 2rem;
  padding: 0.25rem;
}
.env-sidebar__muted {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}
.env-sidebar__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.env-sidebar__li {
  display: flex;
  align-items: stretch;
  margin: 0;
  border-bottom: 1px solid var(--chrome-divider);
}
.env-sidebar__li:last-child {
  border-bottom: none;
}
.env-sidebar__row {
  flex: 1;
  min-width: 0;
  display: block;
  text-align: left;
  padding: 0.45rem 0.35rem 0.45rem 0.5rem;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 0;
  transition: background 0.1s ease;
}
.env-sidebar__row:hover {
  background: var(--bg-hover);
}
.env-sidebar__row--active {
  background: var(--accent-muted);
  box-shadow: inset 2px 0 0 0 var(--accent);
}
.env-sidebar__name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.env-sidebar__act {
  flex-shrink: 0;
  min-width: 1.75rem;
  min-height: 100%;
  padding: 0.2rem;
  border-radius: 0;
}
</style>
