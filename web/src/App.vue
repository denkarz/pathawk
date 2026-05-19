<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import HttpRequestPanel from "./components/organisms/HttpRequestPanel.vue";
import VariablesWorkspacePanel from "./components/organisms/VariablesWorkspacePanel.vue";
import EnvironmentsSidebar from "./components/organisms/EnvironmentsSidebar.vue";
import CollectionsSidebar from "./components/organisms/CollectionsSidebar.vue";
import GitRepositoriesSidebar from "./components/organisms/GitRepositoriesSidebar.vue";
import ActivityRail, {
  type RailModule,
} from "./components/organisms/ActivityRail.vue";
import AppShell from "./components/templates/AppShell.vue";
import ThemeSwitcher from "./components/molecules/ThemeSwitcher.vue";
import AppInput from "./components/atoms/AppInput.vue";
import AppButton from "./components/atoms/AppButton.vue";
import AppModal from "./components/atoms/AppModal.vue";
import DiagnosticsPanel from "./components/organisms/DiagnosticsPanel.vue";
import type { CollectionDoc, SavedRequest } from "./types/collection";
import { normalizeCollection } from "./types/collection";
import {
  addRootFolder,
  addSubfolder,
  addRequestToTarget,
  removeFolder,
  removeRequestById,
  renameRequestById,
  renameFolder,
  updateRequestById,
} from "./lib/collectionTree";
import type { EnvironmentDoc } from "./types/environment";
import { normalizeEnvironment } from "./types/environment";
import { useTheme } from "./composables/useTheme";
import type { UiTheme } from "./composables/useTheme";
import { useDiagnostics } from "./composables/useDiagnostics";
import { useGitWorkspaceSettings } from "./composables/useGitWorkspaceSettings";
import {
  activeGitSyncIntervalMinutes,
  runGitSync,
  shouldGitSyncOnSave,
} from "./composables/useGitSync";

const ACTIVE_ENV_STORAGE = "pathawk-active-environment-id";
const WORKSPACE_VARS_STORAGE = "pathawk-workspace-variables";

const { theme, setTheme } = useTheme();
const diagnostics = useDiagnostics();

const collections = ref<{ id: string; name: string }[]>([]);
const environments = ref<{ id: string; name: string }[]>([]);
const message = ref("");
const loading = ref(false);
const isAgent = ref(false);

const gitWs = useGitWorkspaceSettings();
let gitIntervalHandle: ReturnType<typeof setInterval> | null = null;

async function maybeGitSyncAfterMutation() {
  if (!isAgent.value) return;
  await gitWs.load();
  if (!shouldGitSyncOnSave(gitWs.settings.value)) return;
  const res = await runGitSync();
  if (!res.ok) diagnostics.addWarning(`Git после сохранения: ${res.error}`);
}

function setupGitInterval() {
  if (gitIntervalHandle) {
    clearInterval(gitIntervalHandle);
    gitIntervalHandle = null;
  }
  if (!isAgent.value) return;
  const mins = activeGitSyncIntervalMinutes(gitWs.settings.value);
  if (mins == null) return;
  gitIntervalHandle = setInterval(() => {
    void (async () => {
      await gitWs.load();
      if (activeGitSyncIntervalMinutes(gitWs.settings.value) == null) {
        if (gitIntervalHandle) clearInterval(gitIntervalHandle);
        gitIntervalHandle = null;
        return;
      }
      const res = await runGitSync();
      if (!res.ok) diagnostics.addWarning(`Git по расписанию: ${res.error}`);
    })();
  }, mins * 60_000);
}

watch(message, (m) => {
  const trimmed = String(m ?? "").trim();
  if (!trimmed) return;
  diagnostics.addError(trimmed);
  message.value = "";
});

const selectedCollectionId = ref<string>("");
const collectionDetail = ref<CollectionDoc | null>(null);
/** Куда класть новый запрос: `null` = корень `requests`. */
const saveTargetFolderId = ref<string | null>(null);
/** Подсветка активного запроса в дереве коллекции. */
const activeCollectionRequestId = ref<string | null>(null);
const httpPanelRef = ref<InstanceType<typeof HttpRequestPanel> | null>(null);
let draftSaveTimer: number | null = null;

const selectedEnvironmentId = ref<string>("");
const envVariablesText = ref("{}");
const workspaceVariablesText = ref("{}");
const currentEnvMeta = ref<{ id: string; name: string } | null>(null);
const didBootstrapEnv = ref(false);

function parseVariablesJson(text: string): Record<string, string> {
  try {
    const o = JSON.parse(text || "{}") as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      out[k] = String(v ?? "");
    }
    return out;
  } catch {
    return {};
  }
}

const substitutionVars = computed((): Record<string, string> => {
  const ws = parseVariablesJson(workspaceVariablesText.value);
  const collVarsRaw = collectionDetail.value?.variables;
  const coll: Record<string, string> =
    collVarsRaw && typeof collVarsRaw === "object" && !Array.isArray(collVarsRaw)
      ? Object.fromEntries(
          Object.entries(collVarsRaw as Record<string, unknown>).map(([k, v]) => [
            k,
            String(v ?? ""),
          ])
        )
      : {};
  const env = parseVariablesJson(envVariablesText.value);
  return { ...ws, ...coll, ...env };
});

const railModule = ref<RailModule>("collections");

const requestBreadcrumb = computed(() => {
  const c = collectionDetail.value;
  if (c?.name) return `${c.name} / Запрос`;
  return "Запрос";
});

const statusLineLeft = computed(() =>
  isAgent.value ? "Pathawk · локальный агент" : "Браузер (без агента)"
);

const statusLineRight = computed(() => {
  if (currentEnvMeta.value?.name) return `Окружение: ${currentEnvMeta.value.name}`;
  return "Окружение не выбрано";
});

const saveTargetPath = computed((): string => {
  const c = collectionDetail.value;
  const id = saveTargetFolderId.value;
  if (!c) return "./";
  if (id === null) return "./";
  const walk = (nodes: CollectionDoc["folders"], prefix: string[]): string[] | null => {
    for (const n of nodes) {
      const next = [...prefix, n.name];
      if (n.id === id) return next;
      const inner = walk(n.folders, next);
      if (inner) return inner;
    }
    return null;
  };
  const parts = walk(c.folders, []);
  return parts && parts.length ? `./${parts.join(" / ")}` : "./";
});

const nameDialogOpen = ref(false);
const nameDialogTitle = ref("");
const nameDialogPlaceholder = ref("");
const nameDialogValue = ref("");
let nameDialogResolve: ((v: string | null) => void) | null = null;
const nameDialogAuto = ref<
  | { kind: "collection"; id: string }
  | { kind: "folder"; id: string }
  | { kind: "request"; id: string }
  | null
>(null);
let nameDialogAutoTimer: number | null = null;
let persistQueue: Promise<void> = Promise.resolve();

function closeNameDialog(v: string | null) {
  nameDialogOpen.value = false;
  nameDialogAuto.value = null;
  if (nameDialogAutoTimer != null) {
    window.clearTimeout(nameDialogAutoTimer);
    nameDialogAutoTimer = null;
  }
  const r = nameDialogResolve;
  nameDialogResolve = null;
  r?.(v);
}

function queuePersist(next: CollectionDoc) {
  // Оптимистично обновляем дерево сразу.
  collectionDetail.value = next;
  persistQueue = persistQueue.then(async () => {
    await persistCollection(next);
  });
}

function scheduleActiveRequestSave(
  patch: Pick<SavedRequest, "method" | "url" | "headers" | "body">,
  immediate: boolean
) {
  const reqId = activeCollectionRequestId.value;
  const cur = collectionDetail.value;
  if (!reqId || !cur) return;
  const next = updateRequestById(cur, reqId, patch);
  const run = () => queuePersist(next);
  if (immediate) {
    if (draftSaveTimer != null) {
      window.clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
    }
    run();
    return;
  }
  if (draftSaveTimer != null) window.clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(run, 500);
}

function openAutoRename(
  kind: "collection" | "folder" | "request",
  id: string,
  initial: string
) {
  nameDialogTitle.value =
    kind === "collection"
      ? "Переименовать коллекцию"
      : kind === "folder"
        ? "Переименовать папку"
        : "Переименовать запрос";
  nameDialogPlaceholder.value = "Новое имя…";
  nameDialogValue.value = initial;
  nameDialogAuto.value = { kind, id } as typeof nameDialogAuto.value;
  nameDialogOpen.value = true;
}

watch(
  () => (nameDialogOpen.value ? nameDialogValue.value : null),
  (v) => {
    if (!nameDialogOpen.value) return;
    const auto = nameDialogAuto.value;
    if (!auto) return;
    if (nameDialogAutoTimer != null) window.clearTimeout(nameDialogAutoTimer);
    nameDialogAutoTimer = window.setTimeout(() => {
      const cur = collectionDetail.value;
      const raw = String(v ?? "");
      const nm = raw.trim();
      if (!cur || !nm) return;
      if (auto.kind === "collection") {
        if (cur.id !== auto.id) return;
        if (cur.name === nm) return;
        queuePersist({ ...cur, name: nm });
        return;
      }
      if (auto.kind === "folder") {
        queuePersist(renameFolder(cur, auto.id, nm));
        return;
      }
      queuePersist(renameRequestById(cur, auto.id, nm));
    }, 350);
  }
);

async function askName(title: string, placeholder: string, initial = ""): Promise<string | null> {
  nameDialogTitle.value = title;
  nameDialogPlaceholder.value = placeholder;
  nameDialogValue.value = initial;
  nameDialogOpen.value = true;
  return await new Promise<string | null>((resolve) => {
    nameDialogResolve = resolve;
  });
}

const confirmDialogOpen = ref(false);
const confirmDialogTitle = ref("");
const confirmDialogMessage = ref("");
let confirmResolve: ((v: boolean) => void) | null = null;

function askConfirm(title: string, message: string): Promise<boolean> {
  confirmDialogTitle.value = title;
  confirmDialogMessage.value = message;
  confirmDialogOpen.value = true;
  return new Promise<boolean>((resolve) => {
    confirmResolve = resolve;
  });
}

function closeConfirm(result: boolean) {
  const r = confirmResolve;
  confirmResolve = null;
  confirmDialogOpen.value = false;
  r?.(result);
}

watch(confirmDialogOpen, (open) => {
  if (open || !confirmResolve) return;
  const r = confirmResolve;
  confirmResolve = null;
  r(false);
});

function onThemeSelect(t: UiTheme) {
  setTheme(t);
}

async function load() {
  loading.value = true;
  message.value = "";
  try {
    if (!window.agent) {
      message.value =
        "Окружение без Electron: коллекции доступны только в десктопе.";
      collections.value = [];
      environments.value = [];
      return;
    }
    collections.value = await window.agent.listCollections();
    environments.value = await window.agent.listEnvironments();
    const ids = new Set(collections.value.map((c) => c.id));
    if (selectedCollectionId.value && !ids.has(selectedCollectionId.value)) {
      selectedCollectionId.value = "";
      collectionDetail.value = null;
    }
    const eids = new Set(environments.value.map((e) => e.id));
    if (selectedEnvironmentId.value && !eids.has(selectedEnvironmentId.value)) {
      selectedEnvironmentId.value = "";
      envVariablesText.value = "{}";
      currentEnvMeta.value = null;
    }

    // Bootstrap: на чистой установке создаём одно окружение, чтобы подстановка работала из коробки.
    if (!didBootstrapEnv.value && environments.value.length === 0) {
      didBootstrapEnv.value = true;
      const id = crypto.randomUUID();
      const doc: EnvironmentDoc = {
        id,
        name: "Локальное",
        variables: { baseUrl: "https://httpbin.org" },
      };
      await window.agent.saveEnvironment(
        id,
        doc as unknown as Record<string, unknown>
      );
      environments.value = await window.agent.listEnvironments();
      selectedEnvironmentId.value = id;
    }
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function loadCollectionDetail(id: string) {
  if (!id) {
    collectionDetail.value = null;
    return;
  }
  if (!window.agent) {
    collectionDetail.value = null;
    return;
  }
  try {
    const raw = await window.agent.getCollection(id);
    collectionDetail.value = normalizeCollection(raw);
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e);
    collectionDetail.value = null;
  }
}

async function loadEnvironmentDetail(id: string) {
  if (!id || !window.agent) {
    currentEnvMeta.value = null;
    envVariablesText.value = "{}";
    return;
  }
  try {
    const raw = await window.agent.getEnvironment(id);
    const doc: EnvironmentDoc = normalizeEnvironment(raw);
    currentEnvMeta.value = { id: doc.id, name: doc.name };
    envVariablesText.value = JSON.stringify(doc.variables, null, 2);
    localStorage.setItem(ACTIVE_ENV_STORAGE, id);
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e);
    currentEnvMeta.value = null;
    envVariablesText.value = "{}";
  }
}

watch(selectedCollectionId, (id) => {
  saveTargetFolderId.value = null;
  activeCollectionRequestId.value = null;
  void loadCollectionDetail(id);
});

watch(selectedEnvironmentId, (id) => {
  void loadEnvironmentDetail(id);
});

async function newEmptyCollection() {
  if (!window.agent) return;
  loading.value = true;
  message.value = "";
  try {
    const id = crypto.randomUUID();
    await window.agent.saveCollection(id, {
      id,
      name: "Новая коллекция",
      variables: {},
      folders: [],
      requests: [],
    });
    await load();
    selectedCollectionId.value = id;
    await maybeGitSyncAfterMutation();
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function newEnvironment() {
  if (!window.agent) return;
  message.value = "";
  try {
    const id = crypto.randomUUID();
    const doc: EnvironmentDoc = {
      id,
      name: "Локальное",
      variables: { baseUrl: "https://httpbin.org" },
    };
    await window.agent.saveEnvironment(id, doc as unknown as Record<string, unknown>);
    await load();
    selectedEnvironmentId.value = id;
    await maybeGitSyncAfterMutation();
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e);
  }
}

async function saveEnvironmentDoc() {
  if (!window.agent || !currentEnvMeta.value) return;
  let variables: Record<string, string>;
  try {
    const o = JSON.parse(envVariablesText.value) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) {
      throw new Error("Переменные: нужен JSON-объект");
    }
    variables = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      variables[k] = String(v ?? "");
    }
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e);
    return;
  }
  message.value = "";
  const doc: EnvironmentDoc = {
    id: currentEnvMeta.value.id,
    name: currentEnvMeta.value.name,
    variables,
  };
  try {
    await window.agent.saveEnvironment(
      doc.id,
      doc as unknown as Record<string, unknown>
    );
    await load();
    await loadEnvironmentDetail(doc.id);
    await maybeGitSyncAfterMutation();
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e);
  }
}

async function removeEnvironmentById(id: string) {
  if (!window.agent || !id) return;
  if (
    !(await askConfirm(
      "Удалить окружение?",
      "Документ будет удалён с диска. Это действие нельзя отменить."
    ))
  ) {
    return;
  }
  message.value = "";
  try {
    await window.agent.deleteEnvironment(id);
    if (localStorage.getItem(ACTIVE_ENV_STORAGE) === id) {
      localStorage.removeItem(ACTIVE_ENV_STORAGE);
    }
    if (selectedEnvironmentId.value === id) {
      selectedEnvironmentId.value = "";
      currentEnvMeta.value = null;
      envVariablesText.value = "{}";
    }
    await load();
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e);
  }
}

async function renameEnvironment(id: string) {
  if (!window.agent) return;
  const meta = environments.value.find((e) => e.id === id);
  const currentName =
    currentEnvMeta.value?.id === id ? currentEnvMeta.value.name : (meta?.name ?? "");
  const nm = await askName("Переименовать окружение", "Имя окружения", currentName);
  const trimmed = nm?.trim() ?? "";
  if (!trimmed) return;
  message.value = "";
  try {
    let doc: EnvironmentDoc;
    if (currentEnvMeta.value?.id === id) {
      doc = {
        id,
        name: trimmed,
        variables: parseVariablesJson(envVariablesText.value),
      };
    } else {
      const raw = await window.agent.getEnvironment(id);
      const prev = normalizeEnvironment(raw);
      doc = { ...prev, name: trimmed };
    }
    await window.agent.saveEnvironment(id, doc as unknown as Record<string, unknown>);
    await load();
    if (selectedEnvironmentId.value === id) {
      await loadEnvironmentDetail(id);
    }
    await maybeGitSyncAfterMutation();
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e);
  }
}

async function removeCollection(id: string) {
  if (!window.agent) return;
  const meta = collections.value.find((c) => c.id === id);
  const name = meta?.name ?? "коллекция";
  if (
    !(await askConfirm(
      "Удалить коллекцию?",
      `Коллекция «${name}» и все её запросы будут удалены с диска. Это действие нельзя отменить.`
    ))
  ) {
    return;
  }
  loading.value = true;
  message.value = "";
  try {
    await window.agent.deleteCollection(id);
    if (selectedCollectionId.value === id) {
      selectedCollectionId.value = "";
      collectionDetail.value = null;
    }
    await load();
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function renameCollection(id: string) {
  if (!window.agent || !collectionDetail.value || collectionDetail.value.id !== id) return;
  openAutoRename("collection", id, collectionDetail.value.name);
}

function onUpdateCollectionVariables(vars: Record<string, string>) {
  const cur = collectionDetail.value;
  if (!cur) return;
  queuePersist({
    ...cur,
    variables: Object.keys(vars).length ? vars : undefined,
  });
}

function applyRequest(req: SavedRequest) {
  activeCollectionRequestId.value = req.id;
  httpPanelRef.value?.ensureTabForRequest?.(req);
}

async function persistCollection(doc: CollectionDoc) {
  if (!window.agent) return;
  message.value = "";
  // Оптимистично обновляем UI сразу, даже если сохранение/перезагрузка будут медленными.
  collectionDetail.value = doc;
  try {
    await window.agent.saveCollection(doc.id, doc as unknown as Record<string, unknown>);
    await loadCollectionDetail(doc.id);
    await load();
    await maybeGitSyncAfterMutation();
  } catch (e) {
    message.value = e instanceof Error ? e.message : String(e);
  }
}

async function addEmptyRequestToRoot() {
  if (!window.agent || !collectionDetail.value) return;
  const req: SavedRequest = {
    id: crypto.randomUUID(),
    name: "Новый запрос",
    method: "GET",
    url: "",
    headers: {},
    body: null,
  };
  activeCollectionRequestId.value = req.id;
  await persistCollection(addRequestToTarget(collectionDetail.value, null, req));
}

async function addEmptyRequestToFolder(folderId: string) {
  if (!window.agent || !collectionDetail.value) return;
  const req: SavedRequest = {
    id: crypto.randomUUID(),
    name: "Новый запрос",
    method: "GET",
    url: "",
    headers: {},
    body: null,
  };
  activeCollectionRequestId.value = req.id;
  await persistCollection(addRequestToTarget(collectionDetail.value, folderId, req));
}

async function renameRequest(reqId: string) {
  if (!window.agent || !collectionDetail.value) return;
  // Попытаемся найти текущее имя для удобства.
  const cur = collectionDetail.value;
  const fromRoot = cur.requests.find((r) => r.id === reqId)?.name;
  function findInFolders(nodes: any[]): string | undefined {
    for (const n of nodes) {
      const hit = n.requests?.find((r: any) => r.id === reqId)?.name;
      if (hit) return hit;
      const inner = findInFolders(n.folders ?? []);
      if (inner) return inner;
    }
    return undefined;
  }
  const existing = fromRoot ?? findInFolders(cur.folders as any[]) ?? "Новый запрос";
  openAutoRename("request", reqId, existing);
}

async function deleteRequest(reqId: string) {
  if (!window.agent || !collectionDetail.value) return;
  const cur = collectionDetail.value;
  const fromRoot = cur.requests.find((r) => r.id === reqId)?.name;
  function findInFolders(nodes: CollectionDoc["folders"]): string | undefined {
    for (const n of nodes) {
      const hit = n.requests.find((r) => r.id === reqId)?.name;
      if (hit) return hit;
      const inner = findInFolders(n.folders);
      if (inner) return inner;
    }
    return undefined;
  }
  const reqName = fromRoot ?? findInFolders(cur.folders);
  if (
    !(await askConfirm(
      "Удалить запрос?",
      reqName
        ? `Запрос «${reqName}» будет удалён из коллекции. Это действие нельзя отменить.`
        : "Запрос будет удалён из коллекции. Это действие нельзя отменить."
    ))
  ) {
    return;
  }
  if (activeCollectionRequestId.value === reqId) activeCollectionRequestId.value = null;
  const next = removeRequestById(collectionDetail.value, reqId);
  await persistCollection(next);
}

async function onAddRootFolder() {
  if (!collectionDetail.value) return;
  await persistCollection(addRootFolder(collectionDetail.value, "Новая папка"));
}

async function onAddSubfolder(parentId: string) {
  if (!collectionDetail.value) return;
  await persistCollection(addSubfolder(collectionDetail.value, parentId, "Новая папка"));
}

async function onDeleteFolder(folderId: string) {
  if (!collectionDetail.value) return;
  if (
    !(await askConfirm(
      "Удалить папку?",
      "Будут удалены папка и всё содержимое: подпапки и запросы. Это действие нельзя отменить."
    ))
  ) {
    return;
  }
  if (saveTargetFolderId.value === folderId) saveTargetFolderId.value = null;
  await persistCollection(removeFolder(collectionDetail.value, folderId));
}

async function onRenameFolder(folderId: string) {
  if (!collectionDetail.value) return;
  const cur = collectionDetail.value;
  function findFolderName(nodes: any[]): string | undefined {
    for (const n of nodes) {
      if (n.id === folderId) return n.name;
      const inner = findFolderName(n.folders ?? []);
      if (inner) return inner;
    }
    return undefined;
  }
  const existing = findFolderName(cur.folders as any[]) ?? "Новая папка";
  openAutoRename("folder", folderId, existing);
}

async function onImportedCollection(id: string) {
  await load();
  selectedCollectionId.value = id;
  await maybeGitSyncAfterMutation();
}

function exportCollectionJson() {
  if (!collectionDetail.value) return;
  const text = JSON.stringify(collectionDetail.value, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const safe = collectionDetail.value.name.replace(/[^\w\-]+/g, "_") || "collection";
  a.download = `${safe}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

onMounted(async () => {
  isAgent.value = typeof window !== "undefined" && !!window.agent;
  try {
    const w = localStorage.getItem(WORKSPACE_VARS_STORAGE);
    workspaceVariablesText.value = w && w.trim() ? w : "{}";
  } catch {
    workspaceVariablesText.value = "{}";
  }
  await load();
  const saved = localStorage.getItem(ACTIVE_ENV_STORAGE);
  if (saved && environments.value.some((e) => e.id === saved)) {
    selectedEnvironmentId.value = saved;
  }
  if (isAgent.value) {
    await gitWs.load();
    setupGitInterval();
  }
});

watch(
  () => gitWs.settings.value,
  () => {
    setupGitInterval();
  },
  { deep: true }
);

watch(isAgent, (v) => {
  if (v) {
    void gitWs.load().then(() => setupGitInterval());
  } else if (gitIntervalHandle) {
    clearInterval(gitIntervalHandle);
    gitIntervalHandle = null;
  }
});

onUnmounted(() => {
  if (gitIntervalHandle) clearInterval(gitIntervalHandle);
});

watch(workspaceVariablesText, (v) => {
  try {
    localStorage.setItem(WORKSPACE_VARS_STORAGE, v);
  } catch {
    /* ignore quota / private mode */
  }
});
</script>

<template>
  <AppShell>
    <template #header-actions>
      <ThemeSwitcher :active="theme" @select="onThemeSelect" />
    </template>

    <template #activity>
      <ActivityRail v-if="isAgent" v-model="railModule" />
      <div v-else class="activity-spacer" aria-hidden="true" />
    </template>

    <template #nav>
      <CollectionsSidebar
        v-if="isAgent && railModule === 'collections'"
        v-model:selected-collection-id="selectedCollectionId"
        v-model:save-target-folder-id="saveTargetFolderId"
        embedded
        :active-request-id="activeCollectionRequestId"
        :collections="collections"
        :collection-detail="collectionDetail"
        :loading="loading"
        :message="''"
        :import-enabled="isAgent"
        @refresh="load"
        @new-empty-collection="newEmptyCollection"
        @export-json="exportCollectionJson"
        @remove-collection="removeCollection"
        @rename-collection="renameCollection"
        @apply-request="applyRequest"
        @add-empty-request-to-root="addEmptyRequestToRoot"
        @add-empty-request-to-folder="addEmptyRequestToFolder"
        @rename-request="renameRequest"
        @delete-request="deleteRequest"
        @add-root-folder="onAddRootFolder"
        @add-subfolder="onAddSubfolder"
        @delete-folder="onDeleteFolder"
        @rename-folder="onRenameFolder"
        @imported="onImportedCollection"
      />
      <EnvironmentsSidebar
        v-else-if="isAgent && railModule === 'environments'"
        embedded
        :environments="environments"
        :selected-environment-id="selectedEnvironmentId"
        :loading="loading"
        @update:selected-environment-id="selectedEnvironmentId = $event"
        @new-environment="newEnvironment"
        @rename-environment="renameEnvironment"
        @delete-environment="removeEnvironmentById"
      />
      <GitRepositoriesSidebar
        v-else-if="isAgent && railModule === 'git'"
        embedded
        :agent-desktop="isAgent"
      />
      <DiagnosticsPanel
        v-else-if="isAgent && railModule === 'info'"
        :entries="diagnostics.entries"
        :errors-count="diagnostics.errorsCount"
        :warnings-count="diagnostics.warningsCount"
        @clear="diagnostics.clear"
      />
      <div v-else class="nav-fallback">
        <p class="nav-fallback__text">
          {{
            isAgent
              ? "Выберите раздел на панели слева."
              : "Коллекции и окружения доступны в десктопе (Electron + local-agent)."
          }}
        </p>
      </div>
    </template>

    <HttpRequestPanel
      v-show="!isAgent || railModule !== 'environments'"
      ref="httpPanelRef"
      :variables="substitutionVars"
      :breadcrumb="requestBreadcrumb"
      @active-request-changed="activeCollectionRequestId = $event"
      @draft-changed="scheduleActiveRequestSave($event, false)"
      @draft-blur="scheduleActiveRequestSave($event, true)"
    />
    <VariablesWorkspacePanel
      v-if="isAgent"
      v-show="railModule === 'environments'"
      v-model:env-variables-text="envVariablesText"
      v-model:workspace-variables-text="workspaceVariablesText"
      :selected-environment-id="selectedEnvironmentId"
      :has-current-env="!!currentEnvMeta"
      :collection-detail="collectionDetail"
      @save-environment="saveEnvironmentDoc"
      @update-collection-variables="onUpdateCollectionVariables"
    />

    <template #statusbar>
      <span class="status-l">{{ statusLineLeft }}</span>
      <span class="status-r">
        <span class="status-item">Сохранение: <strong>{{ saveTargetPath }}</strong></span>
        <span class="status-sep" aria-hidden="true">·</span>
        <span class="status-item">{{ statusLineRight }}</span>
      </span>
    </template>
  </AppShell>

  <AppModal v-model:open="confirmDialogOpen" :title="confirmDialogTitle">
    <p class="app-confirm__text">{{ confirmDialogMessage }}</p>
    <div class="app-confirm__actions">
      <AppButton type="button" variant="secondary" @click="closeConfirm(false)">
        Отмена
      </AppButton>
      <AppButton type="button" variant="danger" @click="closeConfirm(true)">
        Удалить
      </AppButton>
    </div>
  </AppModal>

  <teleport to="body">
    <div
      v-if="nameDialogOpen"
      class="name-dialog__backdrop"
      role="presentation"
      @click.self="closeNameDialog(null)"
    >
      <div class="name-dialog" role="dialog" aria-modal="true" :aria-label="nameDialogTitle">
        <div class="name-dialog__title">{{ nameDialogTitle }}</div>
        <AppInput
          v-model="nameDialogValue"
          class="name-dialog__input"
          :placeholder="nameDialogPlaceholder"
          autocomplete="off"
          @keydown.enter.prevent="closeNameDialog(nameDialogValue)"
          @keydown.esc.prevent="closeNameDialog(null)"
        />
        <div class="name-dialog__actions">
          <AppButton type="button" variant="secondary" @click="closeNameDialog(null)">
            Отмена
          </AppButton>
          <AppButton
            type="button"
            variant="primary"
            :disabled="!nameDialogValue.trim()"
            @click="closeNameDialog(nameDialogValue)"
          >
            Закрыть
          </AppButton>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.activity-spacer {
  width: 100%;
  height: 100%;
  min-height: 48px;
  border-right: 1px solid var(--chrome-divider);
  background: var(--chrome-rail);
}
.nav-fallback {
  padding: 1rem 0.85rem;
}
.nav-fallback__text {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
}
.status-l,
.status-r {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-r {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
  text-align: right;
  max-width: 55%;
}
.status-item strong {
  font-weight: 700;
  color: var(--text-secondary);
}
.status-sep {
  opacity: 0.65;
}
.name-dialog__backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}
[data-theme="dark"] .name-dialog__backdrop {
  background: rgba(0, 0, 0, 0.45);
}
.name-dialog {
  width: min(520px, 100%);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-md);
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.name-dialog__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}
.name-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.35rem;
}
.app-confirm__text {
  margin: 0 0 1rem;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}
.app-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}
</style>
