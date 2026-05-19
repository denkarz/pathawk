<script setup lang="ts">
import type { KvRow } from "../../lib/requestEditor";
import { ensureTrailingEmptyRow } from "../../lib/requestEditor";

const props = withDefaults(
  defineProps<{
    modelValue: KvRow[];
    /** Подписи колонок */
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    /** Скрыть колонку «включено» (область задаётся снаружи). */
    hideEnabledColumn?: boolean;
  }>(),
  { hideEnabledColumn: false }
);

const emit = defineEmits<{
  "update:modelValue": [rows: KvRow[]];
}>();

const keyPh = props.keyPlaceholder ?? "Ключ";
const valuePh = props.valuePlaceholder ?? "Значение";

function patchRow(index: number, patch: Partial<KvRow>) {
  const next = props.modelValue.map((r, i) =>
    i === index ? { ...r, ...patch, id: r.id } : r
  );
  emit("update:modelValue", ensureTrailingEmptyRow(next));
}

function onFieldInput(index: number, field: "key" | "value", value: string) {
  patchRow(index, { [field]: value });
}

function onToggle(index: number, enabled: boolean) {
  patchRow(index, { enabled });
}
</script>

<template>
  <div class="kv-table-wrap">
    <table class="kv-table" aria-label="Ключ и значение">
      <thead>
        <tr>
          <th
            v-if="!props.hideEnabledColumn"
            class="kv-table__th kv-table__th--check"
            scope="col"
          />
          <th class="kv-table__th" scope="col">Ключ</th>
          <th class="kv-table__th" scope="col">Значение</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in modelValue" :key="row.id" class="kv-table__tr">
          <td v-if="!props.hideEnabledColumn" class="kv-table__td kv-table__td--check">
            <input
              type="checkbox"
              class="kv-table__cb"
              :checked="row.enabled"
              :aria-label="row.key.trim() || 'Строка'"
              @change="onToggle(i, ($event.target as HTMLInputElement).checked)"
            />
          </td>
          <td class="kv-table__td">
            <input
              class="kv-table__input"
              type="text"
              :value="row.key"
              :placeholder="keyPh"
              spellcheck="false"
              @input="onFieldInput(i, 'key', ($event.target as HTMLInputElement).value)"
            />
          </td>
          <td class="kv-table__td">
            <input
              class="kv-table__input"
              type="text"
              :value="row.value"
              :placeholder="valuePh"
              spellcheck="false"
              @input="onFieldInput(i, 'value', ($event.target as HTMLInputElement).value)"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.kv-table-wrap {
  border: 1px solid var(--chrome-divider);
  border-radius: var(--radius-sm);
  overflow: auto;
  background: var(--chrome-main);
}
.kv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.kv-table__th {
  text-align: left;
  font-weight: 600;
  color: var(--text-muted);
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--chrome-divider);
  background: var(--chrome-nav);
  white-space: nowrap;
}
.kv-table__th--check {
  width: 36px;
  text-align: center;
}
.kv-table__tr {
  border-bottom: 1px solid var(--chrome-divider);
}
.kv-table__tr:last-child {
  border-bottom: none;
}
.kv-table__td {
  padding: 0;
  vertical-align: middle;
}
.kv-table__td--check {
  text-align: center;
  padding: 0.2rem;
}
.kv-table__cb {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--accent);
}
.kv-table__input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  margin: 0;
  padding: 0.4rem 0.5rem;
  font: inherit;
  font-size: 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  outline: none;
}
.kv-table__input::placeholder {
  color: var(--text-muted);
  opacity: 0.75;
}
.kv-table__input:focus {
  background: var(--accent-muted);
}
</style>
