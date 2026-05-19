/** Настройки Git для синхронизации коллекций с local-agent (десктоп). */

export type GitAuthMode = "none" | "https" | "ssh";
export type GitSyncMode = "manual" | "onSave" | "interval";
export type GitConflictPolicy = "lastWriteWins" | "manual" | "branchPerUser";

export type GitCommitMode = "files" | "stage" | "autoPush";

export type GitRepoConfig = {
  id: string;
  /** Короткое имя в списке */
  name: string;
  remoteUrl: string;
  /** Локальный каталог клона / рабочей копии */
  localPath: string;
  branch: string;
  /** Корень данных в репозитории: внутри создаются `collections/` и `environments/` с JSON по id */
  collectionsPath: string;
  authMode: GitAuthMode;
  isActive: boolean;
  syncMode: GitSyncMode;
  conflictPolicy: GitConflictPolicy;
  /**
   * Как завершать синхронизацию в Git:
   * files — только pull + записать JSON (без git add/commit/push);
   * stage — добавить в индекс (git add), коммит и push вручную;
   * autoPush — как раньше: add + commit + push (удобно только в отдельном репо под данные).
   */
  gitCommitMode: GitCommitMode;
  /** Интервал синхронизации (мин), если syncMode === interval */
  syncIntervalMinutes: number;
  lastSyncedAt?: string;
  lastSyncSource?: "local" | "remote";
  lastSeenHead?: string;
  /** Приходит с агента: PAT для HTTPS уже сохранён в bbolt */
  httpsTokenSet?: boolean;
};

export type GitWorkspaceSettings = {
  repos: GitRepoConfig[];
  defaultRepoId: string | null;
  updatedAt: string;
};

const SYNC_MODES: readonly GitSyncMode[] = ["manual", "onSave", "interval"];
const CONFLICT: readonly GitConflictPolicy[] = [
  "lastWriteWins",
  "manual",
  "branchPerUser",
];

function normalizeAuthMode(v: unknown): GitAuthMode {
  if (v === "token") return "https";
  if (v === "none" || v === "https" || v === "ssh") return v;
  return "none";
}

function normalizeGitCommitMode(v: unknown): GitCommitMode {
  if (v === "stage" || v === "autoPush" || v === "files") return v;
  return "files";
}

function normalizeSyncMode(v: unknown): GitSyncMode {
  return SYNC_MODES.includes(v as GitSyncMode) ? (v as GitSyncMode) : "manual";
}

function normalizeConflictPolicy(v: unknown): GitConflictPolicy {
  return CONFLICT.includes(v as GitConflictPolicy)
    ? (v as GitConflictPolicy)
    : "lastWriteWins";
}

function clampSyncInterval(n: number): number {
  if (!Number.isFinite(n)) return 15;
  return Math.max(1, Math.min(24 * 60, Math.floor(n)));
}

function normalizeRepo(raw: unknown, index: number): GitRepoConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : crypto.randomUUID();
  const name =
    typeof o.name === "string" && o.name.trim()
      ? o.name.trim()
      : `Репозиторий ${index + 1}`;
  let syncIntervalMinutes = 15;
  const si = o.syncIntervalMinutes;
  if (typeof si === "number") syncIntervalMinutes = clampSyncInterval(si);
  else if (typeof si === "string" && si.trim()) syncIntervalMinutes = clampSyncInterval(Number(si));

  return {
    id,
    name,
    remoteUrl: typeof o.remoteUrl === "string" ? o.remoteUrl : "",
    localPath: typeof o.localPath === "string" ? o.localPath : "",
    branch: typeof o.branch === "string" ? o.branch : "main",
    collectionsPath:
      typeof o.collectionsPath === "string" && o.collectionsPath.trim()
        ? o.collectionsPath.trim()
        : "collections",
    authMode: normalizeAuthMode(o.authMode),
    isActive: Boolean(o.isActive),
    syncMode: normalizeSyncMode(o.syncMode),
    conflictPolicy: normalizeConflictPolicy(o.conflictPolicy),
    gitCommitMode: normalizeGitCommitMode(o.gitCommitMode),
    syncIntervalMinutes,
    lastSyncedAt: typeof o.lastSyncedAt === "string" ? o.lastSyncedAt : undefined,
    lastSyncSource:
      o.lastSyncSource === "local" || o.lastSyncSource === "remote"
        ? o.lastSyncSource
        : undefined,
    lastSeenHead: typeof o.lastSeenHead === "string" ? o.lastSeenHead : undefined,
    httpsTokenSet: Boolean(o.httpsTokenSet),
  };
}

/** Ровно один активный репозиторий. */
export function ensureSingleActive(repos: GitRepoConfig[]): void {
  const actives = repos.filter((r) => r.isActive);
  if (actives.length === 0 && repos.length > 0) {
    repos[0].isActive = true;
    return;
  }
  if (actives.length > 1) {
    let first = true;
    for (const r of repos) {
      if (r.isActive) {
        if (first) first = false;
        else r.isActive = false;
      }
    }
  }
}

export function createDefaultGitWorkspaceSettings(): GitWorkspaceSettings {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  return {
    repos: [
      {
        id,
        name: "Основной",
        remoteUrl: "",
        localPath: "",
        branch: "main",
        collectionsPath: "collections",
        authMode: "none",
        isActive: true,
        syncMode: "manual",
        conflictPolicy: "lastWriteWins",
        gitCommitMode: "files",
        syncIntervalMinutes: 15,
      },
    ],
    defaultRepoId: id,
    updatedAt: now,
  };
}

export function normalizeGitWorkspaceSettings(raw: unknown): GitWorkspaceSettings {
  const fallback = createDefaultGitWorkspaceSettings();
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const reposRaw = o.repos;
  if (!Array.isArray(reposRaw) || reposRaw.length === 0) return fallback;

  const repos = reposRaw
    .map((r, i) => normalizeRepo(r, i))
    .filter((r): r is GitRepoConfig => r != null);

  if (repos.length === 0) return fallback;

  ensureSingleActive(repos);

  const activeFromFlags = repos.find((r) => r.isActive)?.id ?? repos[0].id;
  let defaultRepoId: string | null =
    typeof o.defaultRepoId === "string" && repos.some((r) => r.id === o.defaultRepoId)
      ? o.defaultRepoId
      : activeFromFlags;
  if (!defaultRepoId || !repos.some((r) => r.id === defaultRepoId)) {
    defaultRepoId = activeFromFlags;
  }
  const activeId = defaultRepoId;

  for (const r of repos) {
    r.isActive = r.id === activeId;
  }

  return {
    repos,
    defaultRepoId,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
  };
}

/** Ключ для проверки уникальности пары локальный путь + ветка. */
export function repoPairKey(localPath: string, branch: string): string {
  const p = localPath.trim().toLowerCase();
  const b = branch.trim().toLowerCase();
  return `${p}::${b}`;
}

export function activeGitRepo(
  settings: GitWorkspaceSettings
): GitRepoConfig | null {
  if (!settings.repos.length) return null;
  return settings.repos.find((r) => r.isActive) ?? settings.repos[0];
}
