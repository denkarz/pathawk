import { computed, reactive, readonly } from "vue";

export type DiagnosticLevel = "error" | "warning";

export type DiagnosticEntry = {
  id: string;
  ts: number;
  level: DiagnosticLevel;
  message: string;
};

const entries = reactive<DiagnosticEntry[]>([]);

function add(level: DiagnosticLevel, message: string) {
  const trimmed = String(message ?? "").trim();
  if (!trimmed) return;
  entries.unshift({
    id: crypto.randomUUID(),
    ts: Date.now(),
    level,
    message: trimmed,
  });
  // keep last 200
  if (entries.length > 200) entries.length = 200;
}

export function useDiagnostics() {
  const errorsCount = computed(() => entries.filter((e) => e.level === "error").length);
  const warningsCount = computed(() => entries.filter((e) => e.level === "warning").length);

  function addError(message: string) {
    add("error", message);
  }

  function addWarning(message: string) {
    add("warning", message);
  }

  function clear() {
    entries.splice(0, entries.length);
  }

  return {
    entries: readonly(entries),
    errorsCount,
    warningsCount,
    addError,
    addWarning,
    clear,
  };
}

