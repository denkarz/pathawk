import { ref } from "vue";
import type { GitWorkspaceSettings } from "../types/git";
import {
  createDefaultGitWorkspaceSettings,
  normalizeGitWorkspaceSettings,
} from "../types/git";

export const GIT_WORKSPACE_STORAGE_KEY = "pathawk-git-workspace-settings";

const settings = ref<GitWorkspaceSettings>(createDefaultGitWorkspaceSettings());

function hasAgentGit(): boolean {
  return typeof window !== "undefined" && !!window.agent?.getGitSettings;
}

/**
 * Загрузка / сохранение настроек Git: в десктопе — local-agent (bbolt), иначе localStorage.
 */
export function useGitWorkspaceSettings() {
  async function load(): Promise<void> {
    if (hasAgentGit()) {
      try {
        const raw = await window.agent!.getGitSettings!();
        if (raw && typeof raw === "object") {
          const reposRaw = (raw as { repos?: unknown }).repos;
          if (Array.isArray(reposRaw) && reposRaw.length > 0) {
            settings.value = normalizeGitWorkspaceSettings(raw);
            return;
          }
        }
      } catch {
        /* fallback */
      }
    }
    try {
      const raw = localStorage.getItem(GIT_WORKSPACE_STORAGE_KEY);
      if (raw) {
        settings.value = normalizeGitWorkspaceSettings(JSON.parse(raw));
      } else {
        settings.value = createDefaultGitWorkspaceSettings();
      }
    } catch {
      settings.value = createDefaultGitWorkspaceSettings();
    }
  }

  async function persist(): Promise<void> {
    const next: GitWorkspaceSettings = {
      ...settings.value,
      updatedAt: new Date().toISOString(),
    };
    settings.value = next;
    if (hasAgentGit() && window.agent?.putGitSettings) {
      try {
        await window.agent.putGitSettings(next as unknown as Record<string, unknown>);
      } catch {
        /* сеть / агент */
      }
    }
    try {
      localStorage.setItem(GIT_WORKSPACE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* quota / private mode */
    }
  }

  return {
    settings,
    load,
    persist,
  };
}
