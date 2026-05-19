import type { AuthState, KvRow } from "../lib/requestEditor";

export type SavedRequestBodyMode = "none" | "urlencoded" | "raw" | "binary";
export type SavedRequestRawLanguage = "json" | "text" | "xml" | "html" | "javascript";

/** Сохранённый запрос внутри коллекции (local-agent). */
export type SavedRequest = {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  /** UI-метаданные для таблиц и авторизации (не обязательны). */
  paramRows?: KvRow[];
  headerRows?: KvRow[];
  bodyMode?: SavedRequestBodyMode;
  rawLanguage?: SavedRequestRawLanguage;
  bodyUrlEncodedRows?: KvRow[];
  auth?: AuthState;
};

/** Папка: может содержать подпапки и запросы. */
export type FolderNode = {
  id: string;
  name: string;
  folders: FolderNode[];
  requests: SavedRequest[];
};

/** Документ коллекции в bbolt. */
export type CollectionDoc = {
  id: string;
  name: string;
  /** Переменные коллекции (импорт `collection.variable`) для {{key}}. */
  variables?: Record<string, string>;
  folders: FolderNode[];
  /** Запросы в корне коллекции (рядом с папками). */
  requests: SavedRequest[];
};

function isKvRow(v: unknown): v is KvRow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.enabled === "boolean" &&
    typeof o.key === "string" &&
    typeof o.value === "string" &&
    typeof o.description === "string"
  );
}

function normalizeKvRows(v: unknown): KvRow[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const rows: KvRow[] = [];
  for (const it of v) {
    if (isKvRow(it)) rows.push(it);
  }
  return rows.length ? rows : [];
}

function normalizeAuth(v: unknown): AuthState | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const type = String(o.type ?? "none");
  if (!["none", "bearer", "basic", "apikey"].includes(type)) return undefined;
  const apiKeyIn = String(o.apiKeyIn ?? "header");
  return {
    type: type as AuthState["type"],
    bearerToken: String(o.bearerToken ?? ""),
    basicUser: String(o.basicUser ?? ""),
    basicPass: String(o.basicPass ?? ""),
    apiKeyName: String(o.apiKeyName ?? ""),
    apiKeyValue: String(o.apiKeyValue ?? ""),
    apiKeyIn: (apiKeyIn === "query" ? "query" : "header") as AuthState["apiKeyIn"],
  };
}

function normalizeSavedRequest(o: Record<string, unknown>): SavedRequest {
  const bodyModeRaw = String(o.bodyMode ?? "");
  const rawLangRaw = String(o.rawLanguage ?? "");
  return {
    id: String(o.id ?? crypto.randomUUID()),
    name: String(o.name ?? "Запрос"),
    method: String(o.method ?? "GET"),
    url: String(o.url ?? ""),
    headers:
      o.headers && typeof o.headers === "object" && !Array.isArray(o.headers)
        ? (o.headers as Record<string, string>)
        : {},
    body: o.body != null ? String(o.body) : null,
    paramRows: normalizeKvRows(o.paramRows),
    headerRows: normalizeKvRows(o.headerRows),
    bodyUrlEncodedRows: normalizeKvRows(o.bodyUrlEncodedRows),
    bodyMode:
      bodyModeRaw === "none" || bodyModeRaw === "urlencoded" || bodyModeRaw === "raw" || bodyModeRaw === "binary"
        ? (bodyModeRaw as SavedRequestBodyMode)
        : undefined,
    rawLanguage:
      rawLangRaw === "json" ||
      rawLangRaw === "text" ||
      rawLangRaw === "xml" ||
      rawLangRaw === "html" ||
      rawLangRaw === "javascript"
        ? (rawLangRaw as SavedRequestRawLanguage)
        : undefined,
    auth: normalizeAuth(o.auth),
  };
}

export function normalizeFolder(raw: unknown): FolderNode | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? crypto.randomUUID());
  const name = String(o.name ?? "Папка");
  const requests: SavedRequest[] = [];
  if (Array.isArray(o.requests)) {
    for (const r of o.requests) {
      if (!r || typeof r !== "object") continue;
      requests.push(normalizeSavedRequest(r as Record<string, unknown>));
    }
  }
  const folders: FolderNode[] = [];
  if (Array.isArray(o.folders)) {
    for (const f of o.folders) {
      const n = normalizeFolder(f);
      if (n) folders.push(n);
    }
  }
  return { id, name, folders, requests };
}

export function normalizeCollection(raw: Record<string, unknown>): CollectionDoc {
  const id = String(raw.id ?? "");
  const name = String(raw.name ?? "Без имени");
  const variables: Record<string, string> = {};
  if (raw.variables && typeof raw.variables === "object" && !Array.isArray(raw.variables)) {
    for (const [k, v] of Object.entries(raw.variables as Record<string, unknown>)) {
      const key = String(k ?? "").trim();
      if (!key) continue;
      variables[key] = String(v ?? "");
    }
  }
  const folders: FolderNode[] = [];
  if (Array.isArray(raw.folders)) {
    for (const f of raw.folders) {
      const n = normalizeFolder(f);
      if (n) folders.push(n);
    }
  }
  const requests: SavedRequest[] = [];
  if (Array.isArray(raw.requests)) {
    for (const r of raw.requests) {
      if (!r || typeof r !== "object") continue;
      requests.push(normalizeSavedRequest(r as Record<string, unknown>));
    }
  }
  return { id, name, variables: Object.keys(variables).length ? variables : undefined, folders, requests };
}
