<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  PhPlus,
  PhTrash,
  PhCopy,
  PhStar,
  PhArrowsClockwise,
  PhTreeStructure,
} from "@phosphor-icons/vue";
import AppButton from "../atoms/AppButton.vue";
import AppInput from "../atoms/AppInput.vue";
import AppModal from "../atoms/AppModal.vue";
import AppSelect from "../atoms/AppSelect.vue";
import type { GitRepoConfig } from "../../types/git";
import { ensureSingleActive, repoPairKey } from "../../types/git";
import { useGitWorkspaceSettings } from "../../composables/useGitWorkspaceSettings";
import { runGitSync } from "../../composables/useGitSync";

withDefaults(
  defineProps<{
    embedded?: boolean;
    /** Десктоп с Electron + local-agent — Git и токены в bbolt */
    agentDesktop?: boolean;
  }>(),
  { embedded: false, agentDesktop: false }
);

const { settings, load, persist } = useGitWorkspaceSettings();

const selectedRepoId = ref<string>("");
const blockError = ref("");
const confirmDeleteOpen = ref(false);
const remoteBranches = ref<string[]>([]);
const branchesLoading = ref(false);
const branchesError = ref("");
const syncBusy = ref(false);
const syncMessage = ref("");
const httpsTokenDraft = ref("");

const validationMessages = computed(() => {
  const repos = settings.value.repos;
  const msgs: string[] = [];
  const seenNames = new Map<string, string>();
  const seenPairs = new Map<string, string>();

  for (const r of repos) {
    const nm = r.name.trim().toLowerCase();
    if (nm) {
      if (seenNames.has(nm)) {
        msgs.push(`Повторяющееся имя: «${r.name.trim()}».`);
      } else {
        seenNames.set(nm, r.id);
      }
    }
    const lp = r.localPath.trim();
    const br = r.branch.trim();
    if (lp && br) {
      const key = repoPairKey(lp, br);
      if (seenPairs.has(key) && seenPairs.get(key) !== r.id) {
        msgs.push(
          `Одинаковые локальный путь и ветка: «${lp}» / «${br}» (репозиторий «${r.name}»).`
        );
      } else if (!seenPairs.has(key)) {
        seenPairs.set(key, r.id);
      }
    }
    if (!r.branch.trim()) {
      msgs.push(`В репозитории «${r.name}» не указана ветка.`);
    }
    if (!r.collectionsPath.trim()) {
      msgs.push(`В репозитории «${r.name}» не указан путь к коллекциям.`);
    }
  }
  return msgs;
});

const hasValidationErrors = computed(() => validationMessages.value.length > 0);

const selectedRepo = computed(() =>
  settings.value.repos.find((r) => r.id === selectedRepoId.value)
);

const branchOptions = computed(() => {
  const cur = selectedRepo.value?.branch?.trim();
  const base = remoteBranches.value.slice();
  if (cur && !base.includes(cur)) base.unshift(cur);
  return base;
});

function syncSelectionFromSettings() {
  const repos = settings.value.repos;
  if (!repos.length) return;
  if (!selectedRepoId.value || !repos.some((r) => r.id === selectedRepoId.value)) {
    const active = repos.find((r) => r.isActive);
    selectedRepoId.value = active?.id ?? repos[0].id;
  }
}

async function maybeSaveHttpsToken(): Promise<void> {
  const r = selectedRepo.value;
  if (!r || r.authMode !== "https") return;
  const t = httpsTokenDraft.value.trim();
  if (!t || !window.agent?.putGitCredentials) return;
  await window.agent.putGitCredentials({
    repoId: r.id,
    httpsToken: t,
  });
  httpsTokenDraft.value = "";
  const hit = settings.value.repos.find((x) => x.id === r.id);
  if (hit) hit.httpsTokenSet = true;
}

async function flushSettings(): Promise<void> {
  await maybeSaveHttpsToken();
  await persist();
}

onMounted(async () => {
  await load();
  syncSelectionFromSettings();
});

watch(
  () => settings.value.repos.map((r) => r.id).join(","),
  () => syncSelectionFromSettings()
);

watch(selectedRepoId, () => {
  httpsTokenDraft.value = "";
  branchesError.value = "";
});

async function updateRepo<K extends keyof GitRepoConfig>(key: K, value: GitRepoConfig[K]) {
  const r = settings.value.repos.find((x) => x.id === selectedRepoId.value);
  if (!r) return;
  (r as GitRepoConfig)[key] = value;
  await flushSettings();
}

async function addRepo() {
  blockError.value = "";
  const id = crypto.randomUUID();
  const next: GitRepoConfig = {
    id,
    name: `Репозиторий ${settings.value.repos.length + 1}`,
    remoteUrl: "",
    localPath: "",
    branch: "main",
    collectionsPath: "collections",
    authMode: "none",
    isActive: false,
    syncMode: "manual",
    conflictPolicy: "lastWriteWins",
    gitCommitMode: "files",
    syncIntervalMinutes: 15,
  };
  settings.value.repos.push(next);
  selectedRepoId.value = id;
  await flushSettings();
}

async function duplicateRepo() {
  blockError.value = "";
  const cur = selectedRepo.value;
  if (!cur) return;
  const id = crypto.randomUUID();
  const copy: GitRepoConfig = {
    ...cur,
    id,
    name: `${cur.name} (копия)`,
    isActive: false,
    httpsTokenSet: false,
  };
  settings.value.repos.push(copy);
  selectedRepoId.value = id;
  await flushSettings();
}

function requestRemoveRepo() {
  blockError.value = "";
  if (settings.value.repos.length <= 1) {
    blockError.value = "Нельзя удалить последний репозиторий.";
    return;
  }
  confirmDeleteOpen.value = true;
}

async function performRemoveRepo() {
  blockError.value = "";
  if (settings.value.repos.length <= 1) return;
  const id = selectedRepoId.value;
  settings.value.repos = settings.value.repos.filter((r) => r.id !== id);
  ensureSingleActive(settings.value.repos);
  const active = settings.value.repos.find((r) => r.isActive);
  settings.value.defaultRepoId = active?.id ?? settings.value.repos[0]?.id ?? null;
  syncSelectionFromSettings();
  await flushSettings();
  if (window.agent?.putGitCredentials) {
    try {
      await window.agent.putGitCredentials({ repoId: id, httpsToken: "" });
    } catch {
      /* ignore */
    }
  }
}

function closeConfirmDelete() {
  confirmDeleteOpen.value = false;
}

async function onConfirmDelete() {
  closeConfirmDelete();
  await performRemoveRepo();
}

async function makeActive(id: string) {
  blockError.value = "";
  for (const r of settings.value.repos) {
    r.isActive = r.id === id;
  }
  settings.value.defaultRepoId = id;
  await flushSettings();
}

function onRepoSelect(id: string) {
  selectedRepoId.value = id;
  blockError.value = "";
}

async function fetchRemoteBranches() {
  const r = selectedRepo.value;
  if (!r || !window.agent?.gitListBranches) {
    branchesError.value = "Список веток доступен только в десктопе с агентом.";
    return;
  }
  if (!r.remoteUrl.trim()) {
    branchesError.value = "Укажите Remote URL.";
    return;
  }
  branchesLoading.value = true;
  branchesError.value = "";
  try {
    await flushSettings();
    const res = await window.agent.gitListBranches({ repoId: r.id });
    const list = (res as { branches?: string[] })?.branches;
    remoteBranches.value = Array.isArray(list) ? list : [];
    if (!remoteBranches.value.length) {
      branchesError.value = "Список веток пуст.";
    }
  } catch (e) {
    branchesError.value = e instanceof Error ? e.message : String(e);
    remoteBranches.value = [];
  } finally {
    branchesLoading.value = false;
  }
}

async function manualGitSync() {
  const r = selectedRepo.value;
  if (!r) return;
  syncBusy.value = true;
  syncMessage.value = "";
  blockError.value = "";
  try {
    await flushSettings();
    const res = await runGitSync(r.id);
    if (res.ok) {
      syncMessage.value =
        (res as { message?: string }).message?.trim() ||
        (res.head ? `Готово, HEAD ${res.head.slice(0, 7)}` : "Готово.");
      await load();
    } else {
      blockError.value = res.error;
    }
  } finally {
    syncBusy.value = false;
  }
}

async function clearHttpsToken() {
  const r = selectedRepo.value;
  if (!r || !window.agent?.putGitCredentials) return;
  await window.agent.putGitCredentials({ repoId: r.id, httpsToken: "" });
  r.httpsTokenSet = false;
  await load();
}
</script>

<template>
  <div class="git-sidebar" :class="{ 'git-sidebar--embed': embedded }">
    <div class="git-sidebar__header">
      <div class="git-sidebar__header-top">
        <h1 class="git-sidebar__h">Git</h1>
        <AppButton
          type="button"
          variant="ghost"
          class="git-sidebar__icon-btn"
          aria-label="Добавить репозиторий"
          title="Добавить репозиторий"
          @click="addRepo"
        >
          <PhPlus :size="18" weight="bold" aria-hidden="true" />
        </AppButton>
      </div>
      <p class="git-sidebar__sub">
        <template v-if="agentDesktop">
          Лучше завести <strong>отдельный репозиторий только под коллекции Pathawk</strong>, а не клон внутри репо с кодом —
          так не придётся фильтровать чужие коммиты и диффы.
          Синхронизация через <strong>local-agent</strong>: pull → импорт JSON → экспорт из базы; коммиты в Git — по выбранному режиму ниже.
        </template>
        <template v-else>
          Несколько подключений · настройки в <strong>localStorage</strong> этого браузера. Полный Git — в десктопе.
        </template>
      </p>
    </div>

    <div class="git-sidebar__body">
      <div v-if="selectedRepo" class="git-sidebar__form-pane">
        <div class="git-sidebar__picker">
          <label class="git-sidebar__field git-sidebar__field--repo">
            <span class="git-sidebar__label">Репозиторий</span>
            <AppSelect
              class="git-sidebar__repo-select"
              :model-value="selectedRepoId"
              @update:model-value="onRepoSelect($event)"
            >
              <option
                v-for="r in settings.repos"
                :key="r.id"
                :value="r.id"
              >
                {{ r.name }}{{ r.isActive ? " · активный" : "" }}
              </option>
            </AppSelect>
          </label>
        </div>

        <p class="git-sidebar__section-title">Настройки</p>

        <div class="git-sidebar__form-toolbar">
          <AppButton
            type="button"
            variant="ghost"
            class="git-sidebar__tb-btn"
            title="Дублировать"
            aria-label="Дублировать"
            @click="duplicateRepo"
          >
            <PhCopy :size="16" weight="bold" aria-hidden="true" />
          </AppButton>
          <AppButton
            type="button"
            variant="danger"
            class="git-sidebar__tb-btn"
            title="Удалить"
            aria-label="Удалить"
            :disabled="settings.repos.length <= 1"
            @click="requestRemoveRepo"
          >
            <PhTrash :size="16" weight="bold" aria-hidden="true" />
          </AppButton>
          <AppButton
            v-if="agentDesktop"
            type="button"
            variant="secondary"
            class="git-sidebar__sync-btn"
            :disabled="syncBusy || hasValidationErrors"
            title="Синхронизировать с remote"
            @click="manualGitSync"
          >
            <PhArrowsClockwise
              :size="16"
              weight="bold"
              aria-hidden="true"
              :class="{ 'git-sidebar__spin': syncBusy }"
            />
            Синхронизировать
          </AppButton>
          <AppButton
            v-if="!selectedRepo.isActive"
            type="button"
            variant="secondary"
            class="git-sidebar__make-active"
            @click="makeActive(selectedRepo.id)"
          >
            <PhStar :size="16" weight="bold" aria-hidden="true" class="git-sidebar__make-active-ic" />
            Сделать активным
          </AppButton>
        </div>

        <p v-if="blockError" class="git-sidebar__err">{{ blockError }}</p>
        <p v-if="syncMessage" class="git-sidebar__ok">{{ syncMessage }}</p>

        <div v-if="hasValidationErrors" class="git-sidebar__warn-box" role="status">
          <strong>Проверьте настройки:</strong>
          <ul class="git-sidebar__warn-list">
            <li v-for="(m, i) in validationMessages" :key="i">{{ m }}</li>
          </ul>
        </div>

        <label class="git-sidebar__field">
          <span class="git-sidebar__label">Имя</span>
          <AppInput
            :model-value="selectedRepo.name"
            placeholder="Моя команда / prod"
            @update:model-value="updateRepo('name', $event)"
          />
        </label>

        <label class="git-sidebar__field">
          <span class="git-sidebar__label">Remote URL</span>
          <AppInput
            :model-value="selectedRepo.remoteUrl"
            placeholder="https://github.com/org/repo.git или git@github.com:org/repo.git"
            @update:model-value="updateRepo('remoteUrl', $event)"
          />
        </label>

        <label class="git-sidebar__field">
          <span class="git-sidebar__label">Локальный путь</span>
          <AppInput
            :model-value="selectedRepo.localPath"
            placeholder="/home/user/repos/my-api-collections"
            @update:model-value="updateRepo('localPath', $event)"
          />
        </label>

        <div class="git-sidebar__field git-sidebar__field--branch-row">
          <label class="git-sidebar__field git-sidebar__field--grow">
            <span class="git-sidebar__label">Ветка</span>
            <AppSelect
              class="git-sidebar__select"
              :model-value="selectedRepo.branch"
              @update:model-value="updateRepo('branch', $event)"
            >
              <option v-for="b in branchOptions" :key="b" :value="b">{{ b }}</option>
            </AppSelect>
          </label>
          <AppButton
            v-if="agentDesktop"
            type="button"
            variant="secondary"
            class="git-sidebar__branch-fetch"
            :disabled="branchesLoading"
            title="Запросить ветки с remote (git ls-remote)"
            @click="fetchRemoteBranches"
          >
            <PhTreeStructure :size="16" weight="bold" aria-hidden="true" />
            Ветки
          </AppButton>
        </div>
        <p v-if="branchesError" class="git-sidebar__err">{{ branchesError }}</p>

        <label class="git-sidebar__field">
          <span class="git-sidebar__label">Корень данных в репозитории</span>
          <AppInput
            :model-value="selectedRepo.collectionsPath"
            placeholder="collections — внутри появятся collections/ и environments/"
            @update:model-value="updateRepo('collectionsPath', $event)"
          />
        </label>

        <label class="git-sidebar__field">
          <span class="git-sidebar__label">Авторизация</span>
          <AppSelect
            class="git-sidebar__select"
            :model-value="selectedRepo.authMode"
            @update:model-value="updateRepo('authMode', $event as GitRepoConfig['authMode'])"
          >
            <option value="none">Без учётных данных (публичный clone/pull)</option>
            <option value="https">HTTPS (PAT в агенте)</option>
            <option value="ssh">SSH (ключи ОС / ssh-agent)</option>
          </AppSelect>
        </label>

        <template v-if="selectedRepo.authMode === 'https'">
          <label class="git-sidebar__field">
            <span class="git-sidebar__label">PAT для HTTPS</span>
            <AppInput
              :model-value="httpsTokenDraft"
              type="password"
              placeholder="Вставьте токен и сохраните настройки"
              autocomplete="off"
              @update:model-value="httpsTokenDraft = $event"
            />
          </label>
          <p class="git-sidebar__hint">
            Токен сохраняется в bbolt при любом сохранении настроек (кнопки ниже или смена поля).
            <template v-if="selectedRepo.httpsTokenSet"> Сейчас в агенте <strong>есть</strong> сохранённый PAT.</template>
            <template v-else> Сохранённого PAT <strong>нет</strong>.</template>
          </p>
          <AppButton
            v-if="agentDesktop && selectedRepo.httpsTokenSet"
            type="button"
            variant="ghost"
            class="git-sidebar__clear-token"
            @click="clearHttpsToken"
          >
            Удалить PAT из агента
          </AppButton>
        </template>

        <p v-else-if="selectedRepo.authMode === 'ssh'" class="git-sidebar__hint">
          Используется URL вида <code>git@host:…</code> и SSH-ключи пользователя на машине (ssh-agent).
        </p>

        <label class="git-sidebar__field">
          <span class="git-sidebar__label">Коммиты в Git</span>
          <AppSelect
            class="git-sidebar__select"
            :model-value="selectedRepo.gitCommitMode"
            @update:model-value="updateRepo('gitCommitMode', $event as GitRepoConfig['gitCommitMode'])"
          >
            <option value="files">Только файлы (без git add / commit / push)</option>
            <option value="stage">Только git add — commit и push вручную</option>
            <option value="autoPush">Автоматически: add + commit + push</option>
          </AppSelect>
        </label>
        <p v-if="selectedRepo.gitCommitMode === 'autoPush'" class="git-sidebar__hint git-sidebar__hint--warn">
          Каждая синхронизация с изменениями создаёт отдельный коммит — для репозитория с кодом обычно лучше отдельное репо под данные или режим «Только файлы».
        </p>

        <label class="git-sidebar__field">
          <span class="git-sidebar__label">Синхронизация</span>
          <AppSelect
            class="git-sidebar__select"
            :model-value="selectedRepo.syncMode"
            @update:model-value="updateRepo('syncMode', $event as GitRepoConfig['syncMode'])"
          >
            <option value="manual">Вручную (кнопка «Синхронизировать»)</option>
            <option value="onSave">При сохранении коллекции / окружения</option>
            <option value="interval">По расписанию</option>
          </AppSelect>
        </label>

        <label v-if="selectedRepo.syncMode === 'interval'" class="git-sidebar__field">
          <span class="git-sidebar__label">Интервал, минуты</span>
          <AppInput
            :model-value="String(selectedRepo.syncIntervalMinutes)"
            inputmode="numeric"
            @update:model-value="
              updateRepo(
                'syncIntervalMinutes',
                Math.max(1, Math.min(1440, parseInt(String($event), 10) || 15))
              )
            "
          />
        </label>

        <label class="git-sidebar__field">
          <span class="git-sidebar__label">Конфликты</span>
          <AppSelect
            class="git-sidebar__select"
            :model-value="selectedRepo.conflictPolicy"
            @update:model-value="
              updateRepo('conflictPolicy', $event as GitRepoConfig['conflictPolicy'])
            "
          >
            <option value="lastWriteWins">Последняя запись побеждает</option>
            <option value="manual">Вручную (позже)</option>
            <option value="branchPerUser">Отдельные ветки (позже)</option>
          </AppSelect>
        </label>

        <div
          v-if="selectedRepo.conflictPolicy === 'lastWriteWins'"
          class="git-sidebar__conflict-banner"
          role="note"
        >
          <strong>Последняя запись побеждает:</strong>
          при одновременной работе возможна потеря чужих правок при синхронизации — последний push или
          локальное сохранение перезапишет конфликтующие файлы. Для команды лучше заранее договориться
          о разбиении коллекций или перейти на отдельные ветки.
        </div>

        <p class="git-sidebar__footer-meta">
          Обновлено: {{ settings.updatedAt ? settings.updatedAt.slice(0, 19).replace("T", " ") : "—" }}
        </p>
      </div>
    </div>

    <AppModal v-model:open="confirmDeleteOpen" title="Удалить репозиторий?">
      <p class="git-sidebar__modal-text">
        Подключение «{{ selectedRepo?.name ?? "" }}» будет удалено из списка.
        <template v-if="agentDesktop"> PAT этого репозитория также будет удалён из агента.</template>
      </p>
      <div class="git-sidebar__modal-actions">
        <AppButton type="button" variant="secondary" @click="closeConfirmDelete">
          Отмена
        </AppButton>
        <AppButton type="button" variant="danger" @click="onConfirmDelete">Удалить</AppButton>
      </div>
    </AppModal>
  </div>
</template>

<style scoped>
.git-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.85rem 0.9rem 1.25rem;
  min-height: 100%;
  min-width: 0;
  overflow: hidden;
}
.git-sidebar--embed {
  flex: 1;
  min-height: 0;
  padding: 0.65rem 0.75rem 0.85rem;
}
.git-sidebar__header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.git-sidebar__h {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.git-sidebar__sub {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-muted);
}
.git-sidebar__sub code {
  font-size: 10px;
}
.git-sidebar__icon-btn {
  min-width: 2rem;
  min-height: 2rem;
  padding: 0.25rem;
}

.git-sidebar__body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.git-sidebar__picker {
  flex-shrink: 0;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--chrome-divider);
  margin-bottom: 0.25rem;
}

.git-sidebar__field--repo {
  margin: 0;
}

.git-sidebar__repo-select {
  display: block;
  width: 100%;
  min-width: 0;
}

.git-sidebar__repo-select :deep(.app-select) {
  width: 100%;
  max-width: 100%;
}

.git-sidebar__section-title {
  margin: 0.35rem 0 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.git-sidebar__form-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 2px;
  box-sizing: border-box;
}
.git-sidebar__form-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.git-sidebar__tb-btn {
  min-width: 2rem;
  min-height: 2rem;
  padding: 0.25rem;
}
.git-sidebar__sync-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 12px;
}
.git-sidebar__spin {
  animation: git-spin 0.9s linear infinite;
}
@keyframes git-spin {
  to {
    transform: rotate(360deg);
  }
}
.git-sidebar__make-active {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 12px;
  flex-shrink: 0;
}
.git-sidebar__make-active-ic {
  flex-shrink: 0;
}

.git-sidebar__err {
  margin: 0;
  font-size: 12px;
  color: var(--danger, #c62828);
}
.git-sidebar__ok {
  margin: 0;
  font-size: 12px;
  color: var(--success, #2e7d32);
}

.git-sidebar__warn-box {
  padding: 0.5rem 0.55rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  background: var(--bg-hover);
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-secondary);
}
.git-sidebar__warn-list {
  margin: 0.35rem 0 0;
  padding-left: 1.1rem;
}
.git-sidebar__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}
.git-sidebar__field--branch-row {
  flex-direction: row;
  align-items: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.git-sidebar__field--grow {
  flex: 1;
  min-width: 0;
}
.git-sidebar__branch-fetch {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  margin-bottom: 1px;
}
.git-sidebar__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}
.git-sidebar__select {
  width: 100%;
  max-width: 100%;
}

.git-sidebar__select :deep(.app-select) {
  width: 100%;
  max-width: 100%;
}
.git-sidebar__hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-muted);
}
.git-sidebar__hint--warn {
  border-left: 3px solid var(--warning, #f9a825);
  padding-left: 0.5rem;
  color: var(--text-secondary);
}
.git-sidebar__clear-token {
  align-self: flex-start;
  font-size: 11px;
}

.git-sidebar__conflict-banner {
  margin: 0;
  padding: 0.55rem 0.6rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--accent-muted);
  background: var(--accent-muted);
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-secondary);
}
.git-sidebar__conflict-banner strong {
  color: var(--text-primary);
}

.git-sidebar__modal-text {
  margin: 0 0 1rem;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.git-sidebar__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.git-sidebar__footer-meta {
  margin: 0.25rem 0 0;
  font-size: 10px;
  color: var(--text-muted);
}
</style>
