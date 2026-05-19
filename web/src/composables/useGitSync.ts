import type { GitWorkspaceSettings } from "../types/git";
import { activeGitRepo } from "../types/git";

export type GitSyncResult =
  | { ok: true; head?: string; message?: string }
  | { ok: false; error: string };

export async function runGitSync(repoId?: string): Promise<GitSyncResult> {
  if (!window.agent?.gitSync) {
    return { ok: false, error: "Нет local-agent (только десктоп)" };
  }
  try {
    const body = repoId ? { repoId } : {};
    const r = await window.agent.gitSync(body);
    if (r && typeof r === "object" && (r as { ok?: boolean }).ok) {
      return {
        ok: true,
        head: (r as { head?: string }).head,
        message: (r as { message?: string }).message,
      };
    }
    return { ok: false, error: "Неожиданный ответ git sync" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function shouldGitSyncOnSave(ws: GitWorkspaceSettings): boolean {
  const a = activeGitRepo(ws);
  return !!a && a.syncMode === "onSave" && gitRepoReadyForSync(a);
}

export function activeGitSyncIntervalMinutes(ws: GitWorkspaceSettings): number | null {
  const a = activeGitRepo(ws);
  if (!a || a.syncMode !== "interval" || !gitRepoReadyForSync(a)) return null;
  return Math.max(1, a.syncIntervalMinutes || 15);
}

function gitRepoReadyForSync(a: {
  remoteUrl: string;
  localPath: string;
  branch: string;
}): boolean {
  return (
    !!a.remoteUrl.trim() &&
    !!a.localPath.trim() &&
    !!a.branch.trim()
  );
}
