<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** Кнопка/элемент, относительно которого позиционируем меню. */
    anchorEl: HTMLElement | null;
    /** Предпочтительное выравнивание по правому краю. */
    align?: "left" | "right";
  }>(),
  { align: "left" }
);

const emit = defineEmits<{
  close: [];
}>();

const menuRef = ref<HTMLElement | null>(null);
const top = ref(0);
const left = ref(0);
const minWidth = ref<number | null>(null);

const styleObj = computed(() => ({
  top: `${top.value}px`,
  left: `${left.value}px`,
  minWidth: minWidth.value ? `${minWidth.value}px` : undefined,
}));

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

async function position() {
  if (!props.open || !props.anchorEl) return;
  await nextTick();
  const a = props.anchorEl.getBoundingClientRect();
  const m = menuRef.value?.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const w = m?.width ?? 220;
  const h = m?.height ?? 160;

  const gap = 6;
  const desiredTop = a.bottom + gap;
  const placeAbove = desiredTop + h > vh - 8;
  const y = placeAbove ? a.top - h - gap : desiredTop;

  const x =
    props.align === "right" ? a.right - w : a.left;

  top.value = clamp(Math.round(y), 8, Math.max(8, vh - h - 8));
  left.value = clamp(Math.round(x), 8, Math.max(8, vw - w - 8));
  minWidth.value = Math.round(a.width);
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === "Escape") {
    e.preventDefault();
    emit("close");
  }
}

function onPointerDown(e: PointerEvent) {
  if (!props.open) return;
  const t = e.target as Node | null;
  if (!t) return;
  if (menuRef.value?.contains(t)) return;
  if (props.anchorEl?.contains(t)) return;
  emit("close");
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("resize", position);
  window.removeEventListener("scroll", position, true);
});

watch(
  () => [props.open, props.anchorEl, props.align] as const,
  () => {
    void position();
  }
);
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="app-context-menu" :style="styleObj" ref="menuRef" role="menu">
      <slot />
    </div>
  </teleport>
</template>

<style scoped>
.app-context-menu {
  position: fixed;
  z-index: 50;
  padding: 0.35rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-md);
}
</style>

