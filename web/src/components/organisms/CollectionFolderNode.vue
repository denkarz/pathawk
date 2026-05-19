<script setup lang="ts">
import {
  PhCaretDown,
  PhCaretRight,
  PhFolder,
  PhPencilSimple,
  PhPlus,
  PhTrash,
} from "@phosphor-icons/vue";
import { computed, ref } from "vue";
import type { FolderNode, SavedRequest } from "../../types/collection";
import AppButton from "../atoms/AppButton.vue";
import AppContextMenu from "../atoms/AppContextMenu.vue";
import CollectionFolderNode from "./CollectionFolderNode.vue";

const props = withDefaults(
  defineProps<{
    folder: FolderNode;
    depth?: number;
    saveTargetFolderId: string | null;
    expandedMap: Record<string, boolean>;
    activeRequestId?: string | null;
  }>(),
  { depth: 0, activeRequestId: null }
);

const emit = defineEmits<{
  toggleExpand: [id: string];
  selectSaveTarget: [id: string];
  addEmptyRequestToFolder: [folderId: string];
  addSubfolder: [parentId: string];
  deleteFolder: [folderId: string];
  renameFolder: [folderId: string];
  applyRequest: [req: SavedRequest];
  renameRequest: [reqId: string];
  deleteRequest: [reqId: string];
}>();

const plusMenuOpen = ref(false);
const plusMenuAnchor = ref<HTMLElement | null>(null);

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
}

const sortedSubfolders = computed(() => [...props.folder.folders].sort(byName));
const sortedRequests = computed(() => [...props.folder.requests].sort(byName));

function togglePlusMenu(e: MouseEvent) {
  plusMenuAnchor.value = e.currentTarget as HTMLElement | null;
  plusMenuOpen.value = !plusMenuOpen.value;
}

function closePlusMenu() {
  plusMenuOpen.value = false;
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function folderNote(): string {
  const folders = props.folder.folders.length;
  const reqs = props.folder.requests.length;
  const parts: string[] = [];
  if (folders) {
    parts.push(`${folders} ${pluralRu(folders, "подпапка", "подпапки", "подпапок")}`);
  }
  if (reqs) {
    parts.push(`${reqs} ${pluralRu(reqs, "запрос", "запроса", "запросов")}`);
  }
  return parts.length ? parts.join(" · ") : "пусто";
}

const isEmptyFolder = computed(
  () => props.folder.folders.length === 0 && props.folder.requests.length === 0
);

function isExpanded(id: string): boolean {
  return props.expandedMap[id] !== false;
}

function toggle(id: string) {
  emit("toggleExpand", id);
}

function selectThisFolder() {
  emit("selectSaveTarget", props.folder.id);
}
</script>

<template>
  <div class="folder">
    <div
      class="folder__row"
      :class="{
        'folder__row--target': saveTargetFolderId === folder.id,
        'folder__row--empty': isEmptyFolder,
      }"
      role="button"
      tabindex="0"
      @click="selectThisFolder"
      @keydown.enter.prevent="selectThisFolder"
      @keydown.space.prevent="selectThisFolder"
    >
      <button
        type="button"
        class="folder__chev"
        :aria-expanded="isExpanded(folder.id)"
        :aria-label="isExpanded(folder.id) ? 'Свернуть' : 'Развернуть'"
        @click.stop="toggle(folder.id)"
      >
        <PhCaretDown
          v-if="isExpanded(folder.id)"
          :size="14"
          weight="bold"
          aria-hidden="true"
        />
        <PhCaretRight v-else :size="14" weight="bold" aria-hidden="true" />
      </button>
      <PhFolder :size="18" weight="fill" class="folder__ico" aria-hidden="true" />
      <span class="folder__text">
        <span class="folder__name">{{ folder.name }}</span>
        <span class="folder__note">{{ folderNote() }}</span>
      </span>
      <div class="folder__actions">
        <AppButton
          type="button"
          variant="ghost"
          class="folder__action-btn"
          title="Добавить…"
          aria-label="Добавить…"
          @click.stop="togglePlusMenu"
        >
          <PhPlus :size="16" weight="bold" aria-hidden="true" />
        </AppButton>
        <AppContextMenu
          :open="plusMenuOpen"
          :anchor-el="plusMenuAnchor"
          align="right"
          @close="closePlusMenu"
        >
          <button
            type="button"
            class="folder__menu-item"
            role="menuitem"
            @click="
              closePlusMenu();
              emit('addEmptyRequestToFolder', folder.id);
            "
          >
            Добавить запрос
          </button>
          <button
            type="button"
            class="folder__menu-item"
            role="menuitem"
            @click="
              closePlusMenu();
              emit('addSubfolder', folder.id);
            "
          >
            Добавить папку
          </button>
        </AppContextMenu>
        <AppButton
          type="button"
          variant="ghost"
          class="folder__action-btn"
          title="Переименовать папку"
          aria-label="Переименовать папку"
          @click.stop="emit('renameFolder', folder.id)"
        >
          <PhPencilSimple :size="16" weight="bold" aria-hidden="true" />
        </AppButton>
        <AppButton
          type="button"
          variant="danger"
          class="folder__action-btn"
          title="Удалить папку"
          aria-label="Удалить папку"
          @click.stop="emit('deleteFolder', folder.id)"
        >
          <PhTrash :size="16" weight="bold" aria-hidden="true" />
        </AppButton>
      </div>
    </div>

    <div v-show="isExpanded(folder.id)" class="folder__kids">
      <ul v-if="folder.requests.length" class="folder__req-list">
        <li v-for="r in sortedRequests" :key="r.id" class="folder__req-li">
          <button
            type="button"
            class="folder__req"
            :class="{ 'folder__req--active': activeRequestId === r.id }"
            @click="emit('applyRequest', r)"
          >
            <span class="folder__req-method">{{ r.method }}</span>
            <span class="folder__req-name">{{ r.name }}</span>
          </button>
          <AppButton
            type="button"
            variant="ghost"
            class="folder__req-act folder__req-act--rename"
            title="Переименовать запрос"
            aria-label="Переименовать запрос"
            @click.stop="emit('renameRequest', r.id)"
          >
            <PhPencilSimple :size="16" weight="bold" aria-hidden="true" />
          </AppButton>
          <AppButton
            type="button"
            variant="danger"
            class="folder__req-act folder__req-act--delete"
            title="Удалить запрос"
            aria-label="Удалить запрос"
            @click.stop="emit('deleteRequest', r.id)"
          >
            <PhTrash :size="16" weight="bold" aria-hidden="true" />
          </AppButton>
        </li>
      </ul>

      <div class="folder__nested">
        <CollectionFolderNode
          v-for="ch in sortedSubfolders"
          :key="ch.id"
          :folder="ch"
          :depth="depth + 1"
          :active-request-id="activeRequestId"
          :save-target-folder-id="saveTargetFolderId"
          :expanded-map="expandedMap"
          @toggle-expand="emit('toggleExpand', $event)"
          @select-save-target="emit('selectSaveTarget', $event)"
          @add-subfolder="emit('addSubfolder', $event)"
          @delete-folder="emit('deleteFolder', $event)"
          @rename-folder="emit('renameFolder', $event)"
          @apply-request="emit('applyRequest', $event)"
          @rename-request="emit('renameRequest', $event)"
          @delete-request="emit('deleteRequest', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.folder {
  margin-bottom: 0.05rem;
}
.folder__row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.2rem;
  padding: 0.28rem 0.25rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: 1px solid transparent;
  min-width: 0;
}
.folder__row:hover {
  background: var(--bg-hover);
}
.folder__row:hover .folder__actions,
.folder__row:focus-within .folder__actions {
  opacity: 1;
}
.folder__row--target {
  border-color: var(--accent);
  background: var(--accent-muted);
}
.folder__row--empty .folder__ico,
.folder__row--empty .folder__name,
.folder__row--empty .folder__note {
  color: var(--text-muted);
}
.folder__row--empty .folder__ico {
  opacity: 0.9;
}
.folder__row--empty:hover .folder__ico,
.folder__row--empty:hover .folder__name {
  color: var(--text-secondary);
}
.folder__chev {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}
.folder__chev:hover {
  background: var(--bg-subtle);
  color: var(--text-secondary);
}
.folder__ico {
  flex-shrink: 0;
  color: var(--accent);
}
.folder__text {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
  min-width: 0;
  flex: 1;
}
.folder__name {
  font-weight: 600;
  font-size: 13px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder__note {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder__actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.1rem;
  opacity: 0;
  transition: opacity 0.12s ease;
  flex-shrink: 0;
}
.folder__actions :deep(.app-btn.folder__action-btn) {
  min-width: 1.5rem;
  min-height: 1.5rem;
  padding: 0.15rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.folder__actions :deep(.app-btn) {
  padding: 0.15rem 0.35rem;
  font-size: 10px;
}
.folder__kids {
  margin: 0.05rem 0 0.15rem 0.4rem;
  padding: 0.05rem 0 0 0.5rem;
  border-left: 1px solid var(--border-default);
}
.folder__req-list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.15rem;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.folder__req-li {
  position: relative;
  display: flex;
  align-items: stretch;
  margin: 0;
}
.folder__req {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  /* резерв справа под кнопки; слева — отступ от линии дерева и под индикатор */
  padding: 0.28rem 3.6rem 0.28rem 0.65rem;
  margin: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: var(--text-primary);
  transition: background 0.1s ease;
}
.folder__req:hover {
  background: var(--bg-hover);
}
.folder__req--active {
  background: var(--bg-subtle);
}
.folder__req--active::before {
  content: "";
  position: absolute;
  left: 0.35rem;
  top: 0.18rem;
  bottom: 0.18rem;
  width: 3px;
  border-radius: 999px;
  background: var(--accent);
}
.folder__req-method {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-muted);
  max-width: 52px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder__req-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder__req-act {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity 0.1s ease;
}
.folder__req-li:hover .folder__req-act,
.folder__req-li:focus-within .folder__req-act {
  opacity: 1;
}
.folder__req-act--rename {
  right: 1.85rem;
}
.folder__req-act--delete {
  right: 0;
}
.folder__nested {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.folder__menu-item {
  width: 100%;
  display: block;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  padding: 0.4rem 0.55rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.folder__menu-item:hover {
  background: var(--bg-hover);
}
</style>
