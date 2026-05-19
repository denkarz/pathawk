<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import AppButton from "../atoms/AppButton.vue";
import RequestKvTable from "../molecules/RequestKvTable.vue";
import type { CollectionDoc } from "../../types/collection";
import {
  kvRowsFromRecord,
  keyValueRowsToRecord,
  ensureTrailingEmptyRow,
} from "../../lib/requestEditor";

const props = defineProps<{
  selectedEnvironmentId: string;
  envVariablesText: string;
  hasCurrentEnv: boolean;
  collectionDetail: CollectionDoc | null;
  workspaceVariablesText: string;
}>();

const emit = defineEmits<{
  "update:envVariablesText": [text: string];
  "update:workspaceVariablesText": [text: string];
  saveEnvironment: [];
  updateCollectionVariables: [vars: Record<string, string>];
}>();

function recordFromJson(text: string): Record<string, string> {
  const o = JSON.parse(text || "{}") as unknown;
  if (!o || typeof o !== "object" || Array.isArray(o)) {
    throw new Error("not an object");
  }
  const rec: Record<string, string> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    rec[k] = String(v ?? "");
  }
  return rec;
}

const envRows = ref(ensureTrailingEmptyRow([]));
let syncingEnv = false;
watch(
  () => props.envVariablesText,
  (text) => {
    syncingEnv = true;
    try {
      envRows.value = kvRowsFromRecord(recordFromJson(text));
    } catch {
      envRows.value = ensureTrailingEmptyRow([]);
    } finally {
      void nextTick(() => {
        syncingEnv = false;
      });
    }
  },
  { immediate: true }
);
watch(
  envRows,
  () => {
    if (syncingEnv) return;
    emit("update:envVariablesText", JSON.stringify(keyValueRowsToRecord(envRows.value), null, 2));
  },
  { deep: true }
);

const collRows = ref(ensureTrailingEmptyRow([]));
let syncingColl = false;
watch(
  () => props.collectionDetail,
  (c) => {
    syncingColl = true;
    try {
      const raw = c?.variables;
      const rec: Record<string, string> =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? Object.fromEntries(
              Object.entries(raw as Record<string, unknown>).map(([k, v]) => [
                k,
                String(v ?? ""),
              ])
            )
          : {};
      collRows.value = kvRowsFromRecord(rec);
    } finally {
      void nextTick(() => {
        syncingColl = false;
      });
    }
  },
  { immediate: true }
);
watch(
  collRows,
  () => {
    if (!props.collectionDetail || syncingColl) return;
    emit("updateCollectionVariables", keyValueRowsToRecord(collRows.value));
  },
  { deep: true }
);

const wsRows = ref(ensureTrailingEmptyRow([]));
let syncingWs = false;
watch(
  () => props.workspaceVariablesText,
  (text) => {
    syncingWs = true;
    try {
      wsRows.value = kvRowsFromRecord(recordFromJson(text));
    } catch {
      wsRows.value = ensureTrailingEmptyRow([]);
    } finally {
      void nextTick(() => {
        syncingWs = false;
      });
    }
  },
  { immediate: true }
);
watch(
  wsRows,
  () => {
    if (syncingWs) return;
    emit(
      "update:workspaceVariablesText",
      JSON.stringify(keyValueRowsToRecord(wsRows.value), null, 2)
    );
  },
  { deep: true }
);
</script>

<template>
  <section class="vars-workspace">
    <header class="vars-workspace__header">
      <h2 class="vars-workspace__title">Переменные</h2>
      <p class="vars-workspace__lead">
        Порядок ниже — по силе переопределения: верх перекрывает низ при одинаковом имени
        <code v-pre class="vars-workspace__code">{{…}}</code>
        (окружение → коллекция → воркспейс).
      </p>
      <div class="vars-workspace__toolbar">
        <AppButton
          type="button"
          variant="secondary"
          :disabled="!hasCurrentEnv"
          @click="emit('saveEnvironment')"
        >
          Сохранить переменные окружения на диск
        </AppButton>
      </div>
    </header>

    <div class="vars-workspace__scroll">
      <section class="vars-workspace__block">
        <h3 class="vars-workspace__block-title">1. Окружение</h3>
        <p class="vars-workspace__block-hint">
          Высший приоритет. Окружение выбирается в средней колонке; сохранение — кнопкой выше.
        </p>
        <div
          class="vars-workspace__table-wrap"
          :class="{ 'vars-workspace__table-wrap--disabled': !selectedEnvironmentId }"
        >
          <RequestKvTable
            v-model="envRows"
            hide-enabled-column
            key-placeholder="Имя переменной"
            value-placeholder="Значение"
          />
        </div>
      </section>

      <section class="vars-workspace__block">
        <h3 class="vars-workspace__block-title">2. Коллекция</h3>
        <p class="vars-workspace__block-hint">
          {{
            collectionDetail
              ? `«${collectionDetail.name}» — сохраняется вместе с коллекцией при изменении таблицы.`
              : "Выберите коллекцию на вкладке «Коллекции», чтобы редактировать её переменные."
          }}
        </p>
        <div
          class="vars-workspace__table-wrap"
          :class="{ 'vars-workspace__table-wrap--disabled': !collectionDetail }"
        >
          <RequestKvTable
            v-model="collRows"
            hide-enabled-column
            key-placeholder="Имя переменной"
            value-placeholder="Значение"
          />
        </div>
      </section>

      <section class="vars-workspace__block">
        <h3 class="vars-workspace__block-title">3. Воркспейс (глобально)</h3>
        <p class="vars-workspace__block-hint">
          Базовый слой для этого браузера/профиля (localStorage), без синхронизации между машинами.
        </p>
        <div class="vars-workspace__table-wrap">
          <RequestKvTable
            v-model="wsRows"
            hide-enabled-column
            key-placeholder="Имя переменной"
            value-placeholder="Значение"
          />
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.vars-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0.85rem 1rem 1rem;
  overflow: hidden;
}
.vars-workspace__header {
  flex-shrink: 0;
}
.vars-workspace__title {
  margin: 0 0 0.35rem;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}
.vars-workspace__lead {
  margin: 0 0 0.75rem;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
  max-width: 52rem;
}
.vars-workspace__code {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 0.1rem 0.3rem;
  border-radius: var(--radius-sm);
  background: var(--bg-code);
}
.vars-workspace__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.5rem;
}
.vars-workspace__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding-top: 0.35rem;
}
.vars-workspace__block {
  flex-shrink: 0;
}
.vars-workspace__block-title {
  margin: 0 0 0.2rem;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}
.vars-workspace__block-hint {
  margin: 0 0 0.45rem;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-muted);
  max-width: 48rem;
}
.vars-workspace__table-wrap {
  max-width: 56rem;
}
.vars-workspace__table-wrap--disabled {
  opacity: 0.5;
  pointer-events: none;
}
.vars-workspace__table-wrap :deep(.kv-table-wrap) {
  max-height: 220px;
}
</style>
