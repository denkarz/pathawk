<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
  PhArrowsClockwise,
  PhFileArrowDown,
  PhFileArrowUp,
  PhPencilSimple,
  PhPlus,
  PhTrash,
} from "@phosphor-icons/vue";
import type { CollectionDoc, FolderNode, SavedRequest } from "../../types/collection";
import LabeledSelect from "../molecules/LabeledSelect.vue";
import AppButton from "../atoms/AppButton.vue";
import AppContextMenu from "../atoms/AppContextMenu.vue";
import AppModal from "../atoms/AppModal.vue";
import CollectionFolderNode from "./CollectionFolderNode.vue";
import { importFromFileText } from "../../lib/import";
import { countAllRequests } from "../../lib/collectionTree";
const props = withDefaults(
  defineProps<{
  collections: { id: string; name: string }[];
  selectedCollectionId: string;
  collectionDetail: CollectionDoc | null;
  loading: boolean;
  message: string;
  /** `null` — сохранять в корень (`requests`). */
  saveTargetFolderId: string | null;
  /** Импорт доступен (Electron + agent). */
  importEnabled: boolean;
  /** Режим встроенной боковой колонки в основном окне */
  embedded?: boolean;
  /** Подсветка запроса, открытого в редакторе */
  activeRequestId?: string | null;
}>(),
  { embedded: false, activeRequestId: null }
);

const emit = defineEmits<{
  "update:selectedCollectionId": [id: string];
  "update:saveTargetFolderId": [id: string | null];
  refresh: [];
  newEmptyCollection: [];
  exportJson: [];
  removeCollection: [id: string];
  renameCollection: [id: string];
  addEmptyRequestToRoot: [];
  addEmptyRequestToFolder: [folderId: string];
  renameRequest: [reqId: string];
  applyRequest: [req: SavedRequest];
  deleteRequest: [id: string];
  addRootFolder: [];
  addSubfolder: [parentId: string];
  deleteFolder: [folderId: string];
  renameFolder: [folderId: string];
  imported: [collectionId: string];
}>();

const importOpen = ref(false);
const importBusy = ref(false);
const importNote = ref("");
const pasteText = ref("");
const dropActive = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
}

const sortedRootFolders = computed(() => {
  if (!props.collectionDetail) return [];
  return [...props.collectionDetail.folders].sort(byName);
});

const sortedRootRequests = computed(() => {
  if (!props.collectionDetail) return [];
  return [...props.collectionDetail.requests].sort(byName);
});

const collMenuOpen = ref(false);
const collMenuAnchor = ref<HTMLElement | null>(null);

function toggleCollMenu(e: MouseEvent) {
  collMenuAnchor.value = e.currentTarget as HTMLElement | null;
  collMenuOpen.value = !collMenuOpen.value;
}

function closeCollMenu() {
  collMenuOpen.value = false;
}

const exportMenuOpen = ref(false);
const exportMenuAnchor = ref<HTMLElement | null>(null);

function toggleExportMenu(e: MouseEvent) {
  exportMenuAnchor.value = e.currentTarget as HTMLElement | null;
  exportMenuOpen.value = !exportMenuOpen.value;
}

function closeExportMenu() {
  exportMenuOpen.value = false;
}

/** Распарсили файл, но в списке уже есть коллекция с тем же именем. */
const importConflict = ref<{
  doc: CollectionDoc;
  existingId: string;
  existingName: string;
} | null>(null);

function normalizeCollName(name: string): string {
  return name.trim().toLowerCase();
}

watch(importOpen, (open) => {
  if (!open) {
    importNote.value = "";
    pasteText.value = "";
    dropActive.value = false;
    importConflict.value = null;
  }
});

async function runImport(text: string) {
  const trimmed = text.trim();
  if (!trimmed || !props.importEnabled || !window.agent || importBusy.value) return;
  importBusy.value = true;
  importNote.value = "";
  importConflict.value = null;
  try {
    const doc = importFromFileText(trimmed);
    const dup = props.collections.find(
      (c) => normalizeCollName(c.name) === normalizeCollName(doc.name)
    );
    if (dup) {
      importConflict.value = {
        doc,
        existingId: dup.id,
        existingName: dup.name,
      };
      return;
    }
    await window.agent.saveCollection(
      doc.id,
      doc as unknown as Record<string, unknown>
    );
    importNote.value = `Готово: «${doc.name}», запросов: ${countAllRequests(doc)}`;
    pasteText.value = "";
    emit("imported", doc.id);
  } catch (err) {
    importNote.value = err instanceof Error ? err.message : String(err);
  } finally {
    importBusy.value = false;
  }
}

async function confirmImportReplace() {
  const c = importConflict.value;
  if (!c || !window.agent || importBusy.value) return;
  importBusy.value = true;
  importNote.value = "";
  try {
    const body: CollectionDoc = { ...c.doc, id: c.existingId };
    await window.agent.saveCollection(
      c.existingId,
      body as unknown as Record<string, unknown>
    );
    importConflict.value = null;
    importNote.value = `Заменено: «${body.name}», запросов: ${countAllRequests(body)}`;
    pasteText.value = "";
    emit("imported", c.existingId);
  } catch (err) {
    importNote.value = err instanceof Error ? err.message : String(err);
  } finally {
    importBusy.value = false;
  }
}

async function confirmImportAsCopy() {
  const c = importConflict.value;
  if (!c || !window.agent || importBusy.value) return;
  importBusy.value = true;
  importNote.value = "";
  try {
    await window.agent.saveCollection(
      c.doc.id,
      c.doc as unknown as Record<string, unknown>
    );
    importConflict.value = null;
    importNote.value = `Сохранена копия: «${c.doc.name}», запросов: ${countAllRequests(c.doc)}`;
    pasteText.value = "";
    emit("imported", c.doc.id);
  } catch (err) {
    importNote.value = err instanceof Error ? err.message : String(err);
  } finally {
    importBusy.value = false;
  }
}

function cancelImportConflict() {
  importConflict.value = null;
}

function openFilePicker() {
  fileInputRef.value?.click();
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const text = await file.text();
  await runImport(text);
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  dropActive.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (!file || importBusy.value) return;
  void file.text().then((t) => runImport(t));
}

function importPasted() {
  void runImport(pasteText.value);
}

const expandedMap = reactive<Record<string, boolean>>({});

watch(
  () => props.collectionDetail?.id,
  () => {
    for (const k of Object.keys(expandedMap)) {
      delete expandedMap[k];
    }
  }
);

function toggleExpand(id: string) {
  const cur = expandedMap[id] !== false;
  expandedMap[id] = !cur;
}

// Путь сохранения выводим в статусбаре (внизу, рядом с окружением).
</script>

<template>
  <div class="collections-sidebar" :class="{ 'collections-sidebar--embed': embedded }">
    <div class="collections-sidebar__header">
      <div class="collections-sidebar__header-top">
        <h1 class="collections-sidebar__h">Коллекции</h1>
        <div class="collections-sidebar__header-actions">
          <div class="collections-sidebar__action-group" role="group" aria-label="Действия коллекций">
            <AppButton
              type="button"
              variant="ghost"
              class="collections-sidebar__icon-btn"
              aria-label="Новая коллекция"
              title="Новая коллекция"
              @click="emit('newEmptyCollection')"
            >
              <PhPlus
                :size="18"
                weight="bold"
                aria-hidden="true"
                class="collections-sidebar__header-ico"
              />
            </AppButton>
            <AppButton
              type="button"
              variant="ghost"
              class="collections-sidebar__icon-btn"
              :disabled="!selectedCollectionId"
              aria-label="Экспорт"
              title="Экспорт"
              @click="toggleExportMenu"
            >
              <PhFileArrowUp
                :size="18"
                weight="regular"
                aria-hidden="true"
                class="collections-sidebar__header-ico"
              />
            </AppButton>
            <AppButton
              type="button"
              variant="ghost"
              class="collections-sidebar__icon-btn"
              :disabled="!importEnabled"
              aria-label="Импорт коллекции"
              title="Импорт"
              @click="importOpen = true"
            >
              <PhFileArrowDown
                :size="18"
                weight="regular"
                aria-hidden="true"
                class="collections-sidebar__header-ico"
              />
            </AppButton>
            <AppButton
              type="button"
              variant="ghost"
              class="collections-sidebar__icon-btn"
              aria-label="Обновить список коллекций"
              title="Обновить"
              @click="emit('refresh')"
            >
              <PhArrowsClockwise
                :size="18"
                weight="regular"
                aria-hidden="true"
                class="collections-sidebar__header-ico"
              />
            </AppButton>
          </div>
          <AppContextMenu
            :open="exportMenuOpen"
            :anchor-el="exportMenuAnchor"
            align="right"
            @close="closeExportMenu"
          >
            <button
              type="button"
              class="collections-sidebar__menu-item"
              role="menuitem"
              :disabled="!selectedCollectionId"
              @click="
                closeExportMenu();
                emit('exportJson');
              "
            >
              Экспорт JSON
            </button>
          </AppContextMenu>
        </div>
      </div>
      <p class="collections-sidebar__workspace">Личное рабочее пространство</p>
    </div>

    <AppModal v-model:open="importOpen" title="Импорт коллекции">
      <div class="collections-sidebar__import-modal">
        <input
          ref="fileInputRef"
          type="file"
          class="collections-sidebar__import-file"
          accept=".json,.yaml,.yml,application/json,text/yaml"
          @change="onFileChange"
        />
        <div
          class="collections-sidebar__drop"
          :class="{
            'collections-sidebar__drop--active': dropActive,
            'collections-sidebar__drop--busy': importBusy,
          }"
          role="presentation"
          @dragenter.prevent="dropActive = true"
          @dragleave.prevent="dropActive = false"
          @dragover.prevent
          @drop="onDrop"
        >
          <p class="collections-sidebar__drop-title">Файл</p>
          <p class="collections-sidebar__drop-text">
            Перетащите сюда или
            <button type="button" class="collections-sidebar__drop-link" @click.stop="openFilePicker">
              выберите на диске
            </button>
          </p>
          <p class="collections-sidebar__drop-formats">Коллекция JSON v2 · OpenAPI 3 (JSON / YAML)</p>
        </div>

        <label class="collections-sidebar__paste-label" for="collection-import-paste-modal">
          Или вставьте текст
        </label>
        <textarea
          id="collection-import-paste-modal"
          v-model="pasteText"
          class="collections-sidebar__paste"
          rows="6"
          spellcheck="false"
          placeholder="Вставьте содержимое JSON или YAML…"
        />
        <AppButton
          type="button"
          variant="secondary"
          block
          :disabled="importBusy || !!importConflict || !pasteText.trim()"
          @click="importPasted"
        >
          {{ importBusy ? "Импорт…" : "Импортировать из буфера" }}
        </AppButton>

        <div v-if="importConflict" class="collections-sidebar__import-conflict">
          <p class="collections-sidebar__import-conflict-text">
            Коллекция «{{ importConflict.existingName }}» уже есть. Заменить существующую (тот же id) или
            сохранить вторую копию с новым id?
          </p>
          <div class="collections-sidebar__import-conflict-actions">
            <AppButton
              type="button"
              variant="primary"
              :disabled="importBusy"
              @click="confirmImportReplace"
            >
              {{ importBusy ? "…" : "Заменить" }}
            </AppButton>
            <AppButton
              type="button"
              variant="secondary"
              :disabled="importBusy"
              @click="confirmImportAsCopy"
            >
              Новая копия
            </AppButton>
            <AppButton type="button" variant="ghost" :disabled="importBusy" @click="cancelImportConflict">
              Отмена
            </AppButton>
          </div>
        </div>

        <p v-if="importNote" class="collections-sidebar__import-note">{{ importNote }}</p>
      </div>
    </AppModal>

    <!-- Ошибки/варнинги выводим в Info вкладке -->
    <p v-if="loading" class="collections-sidebar__muted">Загрузка…</p>

    <template v-if="!loading">
      <div class="collections-sidebar__controls">
        <LabeledSelect
          :model-value="selectedCollectionId"
          label="Активная коллекция"
          class="collections-sidebar__select"
          @update:model-value="emit('update:selectedCollectionId', $event)"
        >
          <option value="">— не выбрано —</option>
          <option v-for="c in collections" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </LabeledSelect>
      </div>

      <div v-if="collectionDetail" class="collections-sidebar__detail">
        <div class="collections-sidebar__title-row">
          <h2 class="collections-sidebar__name">{{ collectionDetail.name }}</h2>
          <div class="collections-sidebar__title-actions">
              <AppButton
                type="button"
                variant="ghost"
                class="collections-sidebar__title-btn"
                title="Добавить…"
                aria-label="Добавить…"
                @click="toggleCollMenu"
              >
                <PhPlus :size="16" weight="bold" aria-hidden="true" />
              </AppButton>
              <AppContextMenu
                :open="collMenuOpen"
                :anchor-el="collMenuAnchor"
                align="right"
                @close="closeCollMenu"
              >
                <button
                  type="button"
                  class="collections-sidebar__menu-item"
                  role="menuitem"
                  @click="
                    closeCollMenu();
                    emit('addEmptyRequestToRoot');
                  "
                >
                  Добавить запрос
                </button>
                <button
                  type="button"
                  class="collections-sidebar__menu-item"
                  role="menuitem"
                  @click="
                    closeCollMenu();
                    emit('addRootFolder');
                  "
                >
                  Добавить папку
                </button>
              </AppContextMenu>
            <AppButton
              type="button"
              variant="ghost"
              class="collections-sidebar__title-btn"
              title="Переименовать коллекцию"
              aria-label="Переименовать коллекцию"
              @click="emit('renameCollection', collectionDetail.id)"
            >
              <PhPencilSimple :size="16" weight="bold" aria-hidden="true" />
            </AppButton>
            <AppButton
              type="button"
              variant="danger"
              class="collections-sidebar__title-btn"
              title="Удалить коллекцию"
              aria-label="Удалить коллекцию"
              @click="emit('removeCollection', collectionDetail.id)"
            >
              <PhTrash :size="16" weight="bold" aria-hidden="true" />
            </AppButton>
          </div>
        </div>

        <h3 class="collections-sidebar__sub">Структура</h3>

        <div v-if="collectionDetail.folders.length" class="collections-sidebar__tree">
          <CollectionFolderNode
            v-for="f in sortedRootFolders"
            :key="f.id"
            :folder="f"
            :depth="0"
            :active-request-id="activeRequestId"
            :save-target-folder-id="saveTargetFolderId"
            :expanded-map="expandedMap"
            @toggle-expand="toggleExpand"
            @select-save-target="emit('update:saveTargetFolderId', $event)"
            @add-empty-request-to-folder="emit('addEmptyRequestToFolder', $event)"
            @add-subfolder="emit('addSubfolder', $event)"
            @delete-folder="emit('deleteFolder', $event)"
            @rename-folder="emit('renameFolder', $event)"
            @apply-request="emit('applyRequest', $event)"
            @rename-request="emit('renameRequest', $event)"
            @delete-request="emit('deleteRequest', $event)"
          />
        </div>

        <ul v-if="collectionDetail.requests.length" class="collections-sidebar__tree-list">
          <li v-for="r in sortedRootRequests" :key="r.id" class="collections-sidebar__tree-li">
            <button
              type="button"
              class="collections-sidebar__tree-req"
              :class="{
                'collections-sidebar__tree-req--active': activeRequestId === r.id,
              }"
              @click="emit('applyRequest', r)"
            >
              <span class="collections-sidebar__tree-method">{{ r.method }}</span>
              <span class="collections-sidebar__tree-req-name">{{ r.name }}</span>
            </button>
            <AppButton
              type="button"
              variant="ghost"
              class="collections-sidebar__tree-req-act collections-sidebar__tree-req-act--rename"
              title="Переименовать запрос"
              aria-label="Переименовать запрос"
              @click.stop="emit('renameRequest', r.id)"
            >
              <PhPencilSimple :size="16" weight="bold" aria-hidden="true" />
            </AppButton>
            <AppButton
              type="button"
              variant="danger"
              class="collections-sidebar__tree-req-act collections-sidebar__tree-req-act--delete"
              title="Удалить запрос"
              aria-label="Удалить запрос"
              @click.stop="emit('deleteRequest', r.id)"
            >
              <PhTrash :size="16" weight="bold" aria-hidden="true" />
            </AppButton>
          </li>
        </ul>
        <p
          v-if="!collectionDetail.requests.length && !collectionDetail.folders.length"
          class="collections-sidebar__muted"
        >
          Пока нет папок и запросов. Создайте папку или сохраните запрос в корень.
        </p>
      </div>
      <p v-else-if="selectedCollectionId" class="collections-sidebar__muted">
        Загрузка коллекции…
      </p>
    </template>
  </div>
</template>

<style scoped>
.collections-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.85rem 0.9rem 1.25rem;
  min-height: 100%;
}
.collections-sidebar--embed {
  flex: 1;
  min-height: 0;
  padding: 0.65rem 0.75rem 0.85rem;
}
.collections-sidebar__header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.collections-sidebar__header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.collections-sidebar__workspace {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}
.collections-sidebar__header-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.collections-sidebar__action-group {
  display: inline-flex;
  align-items: center;
  gap: 0;
}

.collections-sidebar__action-group :deep(.app-btn.collections-sidebar__icon-btn) {
  padding: 0.25rem;
  min-width: 2rem;
  min-height: 2rem;
}
.collections-sidebar__header-ico {
  flex-shrink: 0;
  color: currentColor;
}
.collections-sidebar__h {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.collections-sidebar__msg {
  margin: 0;
  font-size: 12px;
  color: #b45309;
}
[data-theme="dark"] .collections-sidebar__msg {
  color: #fbbf24;
}
.collections-sidebar__muted {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}
.collections-sidebar__controls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.collections-sidebar__select {
  width: 100%;
}
.collections-sidebar__select :deep(.app-select) {
  width: 100%;
  min-width: 0;
}
.collections-sidebar__import-modal {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.collections-sidebar__import-file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.collections-sidebar__drop {
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  padding: 0.65rem 0.75rem;
  background: var(--bg-subtle);
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}
.collections-sidebar__drop--active {
  border-color: var(--accent);
  background: var(--accent-muted);
}
.collections-sidebar__drop--busy {
  opacity: 0.55;
  pointer-events: none;
}
.collections-sidebar__drop-title {
  margin: 0 0 0.25rem;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.collections-sidebar__drop-text {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}
.collections-sidebar__drop-link {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
}
.collections-sidebar__drop-link:hover {
  color: var(--accent-hover);
}
.collections-sidebar__drop-formats {
  margin: 0.4rem 0 0;
  font-size: 10px;
  color: var(--text-muted);
}
.collections-sidebar__paste-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}
.collections-sidebar__paste {
  width: 100%;
  box-sizing: border-box;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  resize: vertical;
  min-height: 4rem;
}
.collections-sidebar__paste:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-muted);
}
.collections-sidebar__import-note {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.35;
}
.collections-sidebar__import-conflict {
  padding: 0.55rem 0.65rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  background: var(--bg-subtle);
}
.collections-sidebar__import-conflict-text {
  margin: 0 0 0.5rem;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}
.collections-sidebar__import-conflict-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.collections-sidebar__detail {
  margin-top: 0.35rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.collections-sidebar__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.collections-sidebar__name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.25;
}
.collections-sidebar__title-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
.collections-sidebar__title-actions :deep(.app-btn.collections-sidebar__title-btn) {
  min-width: 1.75rem;
  min-height: 1.75rem;
  padding: 0.2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.collections-sidebar__sub {
  margin: 0.35rem 0 0.15rem;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.collections-sidebar__tree-method {
  color: var(--text-muted);
}
.collections-sidebar__tree-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.collections-sidebar__tree-li {
  position: relative;
  display: flex;
  align-items: stretch;
  margin: 0;
}
.collections-sidebar__tree-req {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  /* резерв под две кнопки справа (rename/delete); слева место под индикатор активного запроса */
  padding: 0.32rem 3.6rem 0.32rem 0.85rem;
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
.collections-sidebar__tree-req:hover {
  background: var(--bg-hover);
}
.collections-sidebar__tree-req--active {
  background: var(--bg-subtle);
}
.collections-sidebar__tree-req--active::before {
  content: "";
  position: absolute;
  left: 0.35rem;
  top: 0.2rem;
  bottom: 0.2rem;
  width: 3px;
  border-radius: 999px;
  background: var(--accent);
}
.collections-sidebar__tree-method {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  max-width: 52px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.collections-sidebar__tree-req-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.collections-sidebar__tree-req-act {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity 0.1s ease;
}
.collections-sidebar__tree-li:hover .collections-sidebar__tree-req-act,
.collections-sidebar__tree-li:focus-within .collections-sidebar__tree-req-act {
  opacity: 1;
}
.collections-sidebar__tree-req-act--rename {
  right: 1.85rem;
}
.collections-sidebar__tree-req-act--delete {
  right: 0;
}
.collections-sidebar__tree-req-act :deep(svg) {
  display: block;
}
.collections-sidebar__tree {
  margin-top: 0.15rem;
}
.collections-sidebar__menu-item {
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
.collections-sidebar__menu-item:hover {
  background: var(--bg-hover);
}
</style>
