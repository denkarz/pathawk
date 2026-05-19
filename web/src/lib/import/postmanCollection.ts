import type { CollectionDoc, FolderNode, SavedRequest } from "../../types/collection";
import { newKvRow, type KvRow, type AuthState } from "../requestEditor";

/** Импорт коллекции JSON v2 (распространённый обменный формат) → CollectionDoc. */
export function importPostmanCollection(root: unknown): CollectionDoc {
  if (!root || typeof root !== "object") {
    throw new Error("Некорректный JSON коллекции");
  }
  const doc = root as Record<string, unknown>;
  const info = doc.info;
  if (!info || typeof info !== "object") {
    throw new Error("Нет поля info (ожидается коллекция JSON v2)");
  }
  const infoObj = info as Record<string, unknown>;
  const schema = String(infoObj.schema ?? "");
  if (!schema.includes("getpostman.com") && !Array.isArray(doc.item)) {
    throw new Error("Не похоже на коллекцию JSON v2");
  }
  const name = String(infoObj.name || "Импортированная коллекция");
  const variables = postmanCollectionVariablesToRecord(doc.variable);
  const { folders, requests } = Array.isArray(doc.item)
    ? postmanItemsToTree(doc.item as unknown[])
    : { folders: [], requests: [] };
  return {
    id: crypto.randomUUID(),
    name,
    variables: Object.keys(variables).length ? variables : undefined,
    folders,
    requests,
  };
}

function postmanCollectionVariablesToRecord(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(v)) return out;
  for (const it of v) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (o.disabled) continue;
    const key = String(o.key ?? "").trim();
    if (!key) continue;
    out[key] = String(o.value ?? "");
  }
  return out;
}

/** Один уровень `item[]`: вложенные массивы `item` → FolderNode, листья с `request` → запросы уровня. */
function postmanItemsToTree(items: unknown[]): {
  folders: FolderNode[];
  requests: SavedRequest[];
} {
  const folders: FolderNode[] = [];
  const requests: SavedRequest[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const obj = it as Record<string, unknown>;
    if (Array.isArray(obj.item)) {
      const inner = postmanItemsToTree(obj.item as unknown[]);
      folders.push({
        id: crypto.randomUUID(),
        name: String(obj.name || "папка"),
        folders: inner.folders,
        requests: inner.requests,
      });
      continue;
    }
    if (obj.request) {
      try {
        requests.push(
          postmanRequestToSaved(obj.request, String(obj.name || "запрос"))
        );
      } catch {
        /* пропускаем битые узлы */
      }
    }
  }
  return { folders, requests };
}

function postmanUrlToString(url: unknown): string {
  if (typeof url === "string") return url;
  if (!url || typeof url !== "object") return "";
  const u = url as Record<string, unknown>;
  if (typeof u.raw === "string" && u.raw.trim()) return u.raw.trim();
  const protocol = String(u.protocol ?? "https");
  const hostArr = Array.isArray(u.host) ? (u.host as unknown[]).map(String) : [];
  const host = hostArr.join(".");
  const pathArr = Array.isArray(u.path) ? (u.path as unknown[]).map(String) : [];
  const path = pathArr.length ? `/${pathArr.join("/")}` : "";
  let base = `${protocol}://${host}${path}`;
  if (Array.isArray(u.query) && u.query.length) {
    const q = (u.query as unknown[])
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const qo = x as Record<string, unknown>;
        if (qo.disabled) return null;
        const k = encodeURIComponent(String(qo.key ?? ""));
        const v = encodeURIComponent(String(qo.value ?? ""));
        return k ? `${k}=${v}` : null;
      })
      .filter(Boolean)
      .join("&");
    if (q) base += `?${q}`;
  }
  return base;
}

function postmanUrlToParamRows(url: unknown): KvRow[] | undefined {
  if (!url || typeof url !== "object" || Array.isArray(url)) return undefined;
  const u = url as Record<string, unknown>;
  if (!Array.isArray(u.query)) return undefined;
  const rows: KvRow[] = [];
  for (const q of u.query as unknown[]) {
    if (!q || typeof q !== "object") continue;
    const qo = q as Record<string, unknown>;
    const key = String(qo.key ?? "");
    if (!key.trim()) continue;
    rows.push(
      newKvRow({
        enabled: !qo.disabled,
        key,
        value: String(qo.value ?? ""),
        description: String(qo.description ?? ""),
      })
    );
  }
  return rows;
}

function postmanHeadersToRows(headers: unknown): KvRow[] | undefined {
  if (!Array.isArray(headers)) return undefined;
  const rows: KvRow[] = [];
  for (const h of headers) {
    if (!h || typeof h !== "object") continue;
    const ho = h as Record<string, unknown>;
    const key = String(ho.key ?? "");
    if (!key.trim()) continue;
    rows.push(
      newKvRow({
        enabled: !ho.disabled,
        key,
        value: String(ho.value ?? ""),
        description: String(ho.description ?? ""),
      })
    );
  }
  return rows;
}

function postmanAuthToState(auth: unknown): AuthState | undefined {
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) return undefined;
  const a = auth as Record<string, unknown>;
  const type = String(a.type ?? "").toLowerCase();
  const getFirstVal = (arr: unknown, key: string) => {
    if (!Array.isArray(arr)) return "";
    for (const it of arr as unknown[]) {
      if (!it || typeof it !== "object") continue;
      const io = it as Record<string, unknown>;
      if (String(io.key ?? "") === key) return String(io.value ?? "");
    }
    return "";
  };
  if (type === "bearer") {
    const token = getFirstVal(a.bearer, "token");
    return {
      type: "bearer",
      bearerToken: token,
      basicUser: "",
      basicPass: "",
      apiKeyName: "",
      apiKeyValue: "",
      apiKeyIn: "header",
    };
  }
  if (type === "basic") {
    const user = getFirstVal(a.basic, "username");
    const pass = getFirstVal(a.basic, "password");
    return {
      type: "basic",
      bearerToken: "",
      basicUser: user,
      basicPass: pass,
      apiKeyName: "",
      apiKeyValue: "",
      apiKeyIn: "header",
    };
  }
  if (type === "apikey") {
    const key = getFirstVal(a.apikey, "key");
    const value = getFirstVal(a.apikey, "value");
    const inRaw = getFirstVal(a.apikey, "in").toLowerCase();
    return {
      type: "apikey",
      bearerToken: "",
      basicUser: "",
      basicPass: "",
      apiKeyName: key,
      apiKeyValue: value,
      apiKeyIn: inRaw === "query" ? "query" : "header",
    };
  }
  return undefined;
}

function postmanHeadersToRecord(headers: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(headers)) return out;
  for (const h of headers) {
    if (!h || typeof h !== "object") continue;
    const ho = h as Record<string, unknown>;
    if (ho.disabled) continue;
    const k = String(ho.key ?? "");
    if (!k) continue;
    out[k] = String(ho.value ?? "");
  }
  return out;
}

function postmanBodyToUrlEncodedRows(body: unknown): KvRow[] | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  const mode = String(b.mode ?? "raw");
  if (mode !== "urlencoded" || !Array.isArray(b.urlencoded)) return undefined;
  const rows: KvRow[] = [];
  for (const p of b.urlencoded as unknown[]) {
    if (!p || typeof p !== "object") continue;
    const po = p as Record<string, unknown>;
    const key = String(po.key ?? "");
    if (!key.trim()) continue;
    rows.push(
      newKvRow({
        enabled: !po.disabled,
        key,
        value: String(po.value ?? ""),
        description: String(po.description ?? ""),
      })
    );
  }
  return rows;
}

function postmanBodyToString(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const mode = String(b.mode ?? "raw");
  if (mode === "raw" && typeof b.raw === "string") return b.raw;
  if (mode === "urlencoded" && b.urlencoded && Array.isArray(b.urlencoded)) {
    const parts: string[] = [];
    for (const p of b.urlencoded as unknown[]) {
      if (!p || typeof p !== "object") continue;
      const po = p as Record<string, unknown>;
      if (po.disabled) continue;
      parts.push(
        `${encodeURIComponent(String(po.key ?? ""))}=${encodeURIComponent(String(po.value ?? ""))}`
      );
    }
    return parts.length ? parts.join("&") : null;
  }
  if (mode === "graphql" && b.graphql && typeof b.graphql === "object") {
    const g = b.graphql as Record<string, unknown>;
    const q = String(g.query ?? "");
    return q ? JSON.stringify({ query: q, variables: g.variables }) : null;
  }
  return null;
}

function postmanRequestToSaved(request: unknown, displayName: string): SavedRequest {
  if (typeof request === "string") {
    return {
      id: crypto.randomUUID(),
      name: displayName,
      method: "GET",
      url: request,
      headers: {},
      body: null,
    };
  }
  if (!request || typeof request !== "object") {
    throw new Error("request");
  }
  const r = request as Record<string, unknown>;
  const method = String(r.method ?? "GET").toUpperCase();
  const url = postmanUrlToString(r.url);
  const name = url.trim() ? displayName : `${displayName} (нет URL)`;
  const headers = postmanHeadersToRecord(r.header);
  const headerRows = postmanHeadersToRows(r.header);
  const paramRows = postmanUrlToParamRows(r.url);
  const auth = postmanAuthToState(r.auth);
  const body = postmanBodyToString(r.body);
  const bodyUrlEncodedRows = postmanBodyToUrlEncodedRows(r.body);
  const bodyMode = bodyUrlEncodedRows ? "urlencoded" : body?.trim() ? "raw" : "none";
  return {
    id: crypto.randomUUID(),
    name,
    method,
    url,
    headers,
    body,
    headerRows,
    paramRows,
    auth,
    bodyUrlEncodedRows,
    bodyMode,
  };
}
