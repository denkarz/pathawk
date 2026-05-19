<script setup lang="ts">
import { computed, ref, useSlots, Fragment, type VNodeChild, type VNode } from "vue";
import AppContextMenu from "./AppContextMenu.vue";

const props = defineProps<{
  modelValue: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [v: string];
}>();

type Opt = { value: string; label: string; disabled: boolean };

const slots = useSlots();

function textFromChildren(c: VNodeChild): string {
  if (c == null || c === false) return "";
  if (typeof c === "string" || typeof c === "number") return String(c);
  if (Array.isArray(c)) return c.map(textFromChildren).join("");
  if (typeof c === "object") {
    const v = c as VNode;
    return textFromChildren(v.children as VNodeChild);
  }
  return "";
}

function flattenVNodes(nodes: VNode[]): VNode[] {
  const out: VNode[] = [];
  for (const n of nodes) {
    if (!n) continue;
    if (n.type === Fragment) {
      const ch = n.children;
      if (Array.isArray(ch)) out.push(...flattenVNodes(ch as VNode[]));
      continue;
    }
    out.push(n);
  }
  return out;
}

const options = computed<Opt[]>(() => {
  const nodes = flattenVNodes((slots.default?.() ?? []) as VNode[]);
  const out: Opt[] = [];
  for (const n of nodes) {
    // ожидаем <option> как VNode с type === "option"
    if (!n || (n as any).type !== "option") continue;
    const p = ((n as VNode).props ?? {}) as Record<string, unknown>;
    const value = String(p.value ?? "");
    const disabled = Boolean(p.disabled);
    const labelRaw = textFromChildren((n as VNode).children as VNodeChild).trim();
    const label = labelRaw || value;
    out.push({ value, label, disabled });
  }
  return out;
});

const currentLabel = computed(() => {
  const hit = options.value.find((o) => o.value === props.modelValue);
  return hit?.label ?? String(props.modelValue ?? "");
});

const open = ref(false);
const anchorEl = ref<HTMLElement | null>(null);

function toggle(e: MouseEvent) {
  if (props.disabled) return;
  anchorEl.value = e.currentTarget as HTMLElement | null;
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function pick(v: string) {
  emit("update:modelValue", v);
  close();
}
</script>

<template>
  <button
    type="button"
    class="app-select"
    :class="{ 'app-select--disabled': disabled }"
    :disabled="disabled"
    role="combobox"
    :aria-expanded="open"
    @click="toggle"
  >
    <span class="app-select__value">{{ currentLabel }}</span>
    <span class="app-select__chev" aria-hidden="true" />
  </button>
  <AppContextMenu :open="open" :anchor-el="anchorEl" align="left" @close="close">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="app-select__item"
      role="menuitem"
      :disabled="o.disabled"
      @click="pick(o.value)"
    >
      <span class="app-select__item-label">{{ o.label }}</span>
      <span v-if="o.value === modelValue" class="app-select__item-mark" aria-hidden="true">✓</span>
    </button>
  </AppContextMenu>
</template>

<style scoped>
.app-select {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: auto;
  min-width: 0;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  cursor: pointer;
  outline: none;
  min-height: 34px;
}
.app-select:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 2px var(--accent-muted);
}
.app-select:disabled,
.app-select--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.app-select__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select__chev {
  flex-shrink: 0;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid var(--text-muted);
  margin-left: 0.25rem;
}

.app-select__item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  text-align: left;
  padding: 0.45rem 0.6rem;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.app-select__item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.app-select__item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.app-select__item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select__item-mark {
  flex-shrink: 0;
  color: var(--accent);
  font-weight: 800;
}
</style>
