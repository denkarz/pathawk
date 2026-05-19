<script setup lang="ts">
import { ref, computed, toRef, reactive, watch, shallowRef, nextTick } from "vue";
import type { SavedRequest } from "../../types/collection";
import {
  applyVariables,
  applyVariablesToHeaders,
  resolvedVar,
} from "../../lib/substitute";
import {
  type KvRow,
  type AuthState,
  kvRowsFromRecord,
  newKvRow,
  headersFromRows,
  authHeaders,
  buildUrlWithParams,
  splitUrlQuery,
  countActiveKv,
  urlSearchParamsFromRows,
  ensureTrailingEmptyRow,
} from "../../lib/requestEditor";
import AppButton from "../atoms/AppButton.vue";
import AppInput from "../atoms/AppInput.vue";
import AppSelect from "../atoms/AppSelect.vue";
import RequestKvTable from "../molecules/RequestKvTable.vue";
import RequestCodeMirror, {
  type CmLanguage,
} from "../molecules/RequestCodeMirror.vue";
import AppContextMenu from "../atoms/AppContextMenu.vue";
import { PhX } from "@phosphor-icons/vue";
import AppLogoPathawk from "../atoms/AppLogoPathawk.vue";

type BodyMode = "none" | "urlencoded" | "raw" | "binary";
type RawLanguage = "json" | "text" | "xml" | "html" | "javascript";

const props = withDefaults(
  defineProps<{
    variables?: Record<string, string>;
    breadcrumb?: string;
  }>(),
  { variables: () => ({}), breadcrumb: "Запрос" }
);
const variables = toRef(props, "variables");

const emit = defineEmits<{
  /** Черновик изменился (debounce снаружи). */
  draftChanged: [draft: ReturnType<typeof getDraftForSave>];
  /** Потеря фокуса внутри формы (сохранить сразу). */
  draftBlur: [draft: ReturnType<typeof getDraftForSave>];
  /** Активная вкладка (и запрос) изменилась. */
  activeRequestChanged: [reqId: string | null];
}>();

export type HttpRequestPayload = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  bodyBase64?: string | null;
  timeoutMs?: number;
};

export type HttpResponseResult =
  | {
      ok: true;
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      durationMs: number;
    }
  | {
      ok: false;
      error: string;
      durationMs: number;
    };

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

type RequestTab = {
  key: string;
  reqId: string | null;
  title: string;
  /** Последний применённый снапшот запроса (для переключения вкладок). */
  reqSnapshot: SavedRequest | null;
};

// Вкладки показываем только для открытых сохранённых запросов.
// Если ничего не открыто — табстрок скрыт (редактор остаётся доступен).
const tabs = ref<RequestTab[]>([]);
const activeTabKey = ref<string | null>(null);

function setActiveTab(key: string) {
  activeTabKey.value = key;
  const t = tabs.value.find((x) => x.key === key) ?? null;
  emit("activeRequestChanged", t?.reqId ?? null);
  if (t?.reqSnapshot) {
    applySavedRequest(t.reqSnapshot);
  } else if (t && t.reqId === null) {
    // scratch — ничего не делаем, поля уже заполнены текущим черновиком
  }
}

function closeTab(key: string) {
  const idx = tabs.value.findIndex((t) => t.key === key);
  if (idx < 0) return;
  const wasActive = activeTabKey.value === key;
  tabs.value.splice(idx, 1);
  if (wasActive) {
    const next = tabs.value[Math.min(idx, tabs.value.length - 1)] ?? null;
    if (next) {
      setActiveTab(next.key);
    } else {
      activeTabKey.value = null;
      emit("activeRequestChanged", null);
    }
  }
}

function ensureTabForRequest(req: SavedRequest) {
  const existing = tabs.value.find((t) => t.reqId === req.id);
  if (existing) {
    existing.title = req.name || existing.title;
    existing.reqSnapshot = req;
    setActiveTab(existing.key);
    return;
  }
  const t: RequestTab = {
    key: `req:${req.id}`,
    reqId: req.id,
    title: req.name || "Запрос",
    reqSnapshot: req,
  };
  tabs.value.push(t);
  setActiveTab(t.key);
}

const tabMenuOpen = ref(false);
const tabMenuAnchor = ref<HTMLElement | null>(null);
const tabMenuKey = ref<string | null>(null);

function openTabMenu(e: MouseEvent, key: string) {
  e.preventDefault();
  tabMenuAnchor.value = e.currentTarget as HTMLElement | null;
  tabMenuKey.value = key;
  tabMenuOpen.value = true;
}

function closeTabMenu() {
  tabMenuOpen.value = false;
  tabMenuAnchor.value = null;
  tabMenuKey.value = null;
}

function closeAllTabs() {
  tabs.value = [];
  activeTabKey.value = null;
  emit("activeRequestChanged", null);
}

function closeOtherTabs(key: string) {
  const keep = tabs.value.find((t) => t.key === key) ?? null;
  tabs.value = keep ? [keep] : [];
  if (keep) setActiveTab(keep.key);
  else {
    activeTabKey.value = null;
    emit("activeRequestChanged", null);
  }
}

function closeTabsLeftOf(key: string) {
  const idx = tabs.value.findIndex((t) => t.key === key);
  if (idx <= 0) return;
  tabs.value.splice(0, idx);
  setActiveTab(key);
}

function closeTabsRightOf(key: string) {
  const idx = tabs.value.findIndex((t) => t.key === key);
  if (idx < 0 || idx >= tabs.value.length - 1) return;
  tabs.value.splice(idx + 1);
  setActiveTab(key);
}

const method = ref("GET");
const url = ref("https://httpbin.org/get");
const headerRows = ref<KvRow[]>(
  kvRowsFromRecord({ Accept: "application/json" })
);
const paramRows = ref<KvRow[]>(splitUrlQuery("https://httpbin.org/get").queryRows);

/** База и query из текущей строки url (после split). */
function urlQueryBase(): { baseUrl: string; queryRows: KvRow[] } {
  return splitUrlQuery(url.value.trim());
}

/** Таблица «Параметры» или, если в ней ещё нет ключей, query из адресной строки. */
function effectiveParamRows(): KvRow[] {
  const { queryRows } = urlQueryBase();
  const hasTable = paramRows.value.some((r) => r.key.trim());
  return hasTable ? paramRows.value : queryRows;
}

/** Полный URL в поле ввода (локальная строка, чтобы не перетирать ввод при синке из таблицы параметров). */
const localUrl = ref("");
const urlFieldFocused = ref(false);
let urlSyncDepth = 0;

function syncLocalUrlFromState() {
  const base = urlQueryBase().baseUrl;
  localUrl.value = buildUrlWithParams(base, effectiveParamRows());
}

function onUrlInput(v: string) {
  urlSyncDepth++;
  localUrl.value = v;
  const { baseUrl, queryRows } = splitUrlQuery(v);
  url.value = baseUrl;
  paramRows.value = queryRows;
  nextTick(() => {
    urlSyncDepth--;
  });
}

function onUrlFocus() {
  urlFieldFocused.value = true;
}

function onUrlBlur() {
  urlFieldFocused.value = false;
  nextTick(() => {
    if (urlSyncDepth > 0) return;
    syncLocalUrlFromState();
  });
}

syncLocalUrlFromState();
const bodyText = ref("");
const bodyMode = ref<BodyMode>("none");
const rawLanguage = ref<RawLanguage>("json");
const bodyUrlEncodedRows = ref<KvRow[]>([newKvRow()]);
const binaryBodyBase64 = ref("");
const binaryFileName = ref("");
const responsePretty = ref(true);
const sending = ref(false);
const response = ref<HttpResponseResult | null>(null);
const subTab = ref<"params" | "authorization" | "headers" | "body">("headers");

const authState = reactive<AuthState>({
  type: "none",
  bearerToken: "",
  basicUser: "",
  basicPass: "",
  apiKeyName: "",
  apiKeyValue: "",
  apiKeyIn: "header",
});

/** Строки заголовков, созданные из вкладки «Авторизация» (чтобы не дублировать и снимать при смене типа). */
const authManagedRowIds = shallowRef(new Set<string>());
/** Подавляем parse/materialize при загрузке сохранённого запроса (порядок полей). */
const loadingSavedRequest = ref(false);

let materializingFromAuth = false;

function materializeAuthIntoHeaderRows() {
  materializingFromAuth = true;
  try {
    const incoming = authHeaders(authState);
    const managed = authManagedRowIds.value;

    if (Object.keys(incoming).length === 0) {
      const next = headerRows.value.filter((r) => !managed.has(r.id));
      authManagedRowIds.value = new Set();
      headerRows.value = ensureTrailingEmptyRow(next);
      return;
    }

    const incomingLc = new Set(Object.keys(incoming).map((k) => k.toLowerCase()));
    let next = headerRows.value.filter((r) => !managed.has(r.id));
    next = next.filter((r) => {
      if (!r.enabled) return true;
      const k = r.key.trim().toLowerCase();
      return !k || !incomingLc.has(k);
    });
    const newManaged = new Set<string>();
    const newRows: KvRow[] = [];
    for (const [k, v] of Object.entries(incoming)) {
      const row = newKvRow({ key: k, value: v, description: "" });
      newManaged.add(row.id);
      newRows.push(row);
    }
    authManagedRowIds.value = newManaged;
    headerRows.value = ensureTrailingEmptyRow([...newRows, ...next]);
  } finally {
    materializingFromAuth = false;
  }
}

function parseAuthFromHeaderRows() {
  if (materializingFromAuth || loadingSavedRequest.value) return;
  const rows = headerRows.value;
    const authRow = rows.find(
      (r) => r.enabled && r.key.trim().toLowerCase() === "authorization"
    );
    const rawAuth = authRow ? authRow.value.trim() : "";

    if (rawAuth.startsWith("Bearer ")) {
      authState.type = "bearer";
      authState.bearerToken = rawAuth.slice(7).trim();
      authState.basicUser = "";
      authState.basicPass = "";
    } else if (rawAuth.startsWith("Basic ")) {
      authState.type = "basic";
      authState.bearerToken = "";
      try {
        const b64 = rawAuth.slice(6).trim();
        const decoded = decodeURIComponent(escape(atob(b64)));
        const i = decoded.indexOf(":");
        authState.basicUser = i >= 0 ? decoded.slice(0, i) : decoded;
        authState.basicPass = i >= 0 ? decoded.slice(i + 1) : "";
      } catch {
        authState.basicUser = "";
        authState.basicPass = "";
      }
    } else if (!rawAuth && (authState.type === "bearer" || authState.type === "basic")) {
      // Нет Authorization в таблице: сбрасываем тип только если раньше уже были
      // введены учётные данные (пользователь снял заголовок). Если токен/логин
      // пустые — это нормальный выбор «Bearer/Basic» в селекторе до ввода полей.
      if (authState.type === "bearer" && authState.bearerToken.trim()) {
        authState.type = "none";
        authState.bearerToken = "";
        authState.basicUser = "";
        authState.basicPass = "";
      } else if (
        authState.type === "basic" &&
        (authState.basicUser.trim() || authState.basicPass !== "")
      ) {
        authState.type = "none";
        authState.bearerToken = "";
        authState.basicUser = "";
        authState.basicPass = "";
      }
    } else if (
      rawAuth &&
      !rawAuth.startsWith("Bearer ") &&
      !rawAuth.startsWith("Basic ")
    ) {
      if (authState.type === "bearer" || authState.type === "basic") {
        authState.type = "none";
        authState.bearerToken = "";
        authState.basicUser = "";
        authState.basicPass = "";
      }
      if (authRow) {
        const next = new Set(authManagedRowIds.value);
        next.delete(authRow.id);
        authManagedRowIds.value = next;
      }
    }

    if (authState.type === "apikey" && authState.apiKeyIn === "header") {
      const managed = authManagedRowIds.value;
      const managedRow = rows.find((r) => managed.has(r.id));
      if (managedRow && managedRow.enabled && managedRow.key.trim()) {
        authState.apiKeyName = managedRow.key.trim();
        authState.apiKeyValue = managedRow.value;
      } else {
        const name = authState.apiKeyName.trim();
        if (name) {
          const kr = rows.find(
            (r) => r.enabled && r.key.trim().toLowerCase() === name.toLowerCase()
          );
          if (kr) authState.apiKeyValue = kr.value;
        }
      }
    }
}

watch(
  authState,
  () => {
    if (loadingSavedRequest.value) return;
    materializeAuthIntoHeaderRows();
  },
  { deep: true, flush: "sync" }
);

watch(
  () => headerRows.value,
  () => {
    if (loadingSavedRequest.value) return;
    parseAuthFromHeaderRows();
  },
  { deep: true, flush: "sync" }
);

watch(
  [url, paramRows],
  () => {
    if (
      loadingSavedRequest.value ||
      urlFieldFocused.value ||
      urlSyncDepth > 0
    ) {
      return;
    }
    syncLocalUrlFromState();
  },
  { deep: true }
);

const hasHttp = computed(
  () => typeof window !== "undefined" && !!window.desktop?.httpRequest
);

const canSend = computed(
  () => hasHttp.value && localUrl.value.trim().length > 0
);

const cmRequestLanguage = computed<CmLanguage>(() => rawLanguage.value);

function headerKeysLower(h: Record<string, string>): Set<string> {
  return new Set(Object.keys(h).map((k) => k.toLowerCase()));
}

function effectiveHeaders(): Record<string, string> {
  const h = { ...headersFromRows(headerRows.value) };
  const seen = headerKeysLower(h);
  const add = (name: string, value: string) => {
    if (seen.has(name.toLowerCase())) return;
    h[name] = value;
    seen.add(name.toLowerCase());
  };
  if (["GET", "HEAD"].includes(method.value)) return h;
  switch (bodyMode.value) {
    case "urlencoded":
      add("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8");
      break;
    case "raw":
      if (rawLanguage.value === "json") {
        add("Content-Type", "application/json;charset=UTF-8");
      } else if (rawLanguage.value === "xml") {
        add("Content-Type", "application/xml;charset=UTF-8");
      } else if (rawLanguage.value === "html") {
        add("Content-Type", "text/html;charset=UTF-8");
      } else if (rawLanguage.value === "javascript") {
        add("Content-Type", "application/javascript;charset=UTF-8");
      }
      break;
    case "binary":
      if (binaryBodyBase64.value) {
        add("Content-Type", "application/octet-stream");
      }
      break;
    default:
      break;
  }
  return h;
}

function computeSendBody(): { body: string | null; bodyBase64?: string } {
  if (["GET", "HEAD"].includes(method.value)) {
    return { body: null };
  }
  switch (bodyMode.value) {
    case "none":
      return { body: null };
    case "raw": {
      const t = bodyText.value.trim();
      return { body: t.length ? bodyText.value : null };
    }
    case "urlencoded": {
      const parts: string[] = [];
      for (const r of bodyUrlEncodedRows.value) {
        if (!r.enabled) continue;
        const k = r.key.trim();
        if (!k) continue;
        parts.push(`${k}=${r.value}`);
      }
      const s = parts.join("&");
      return { body: s.length ? s : null };
    }
    case "binary":
      return binaryBodyBase64.value
        ? { body: binaryBodyBase64.value, bodyBase64: binaryBodyBase64.value }
        : { body: null };
    default:
      return { body: null };
  }
}

function detectResponseLanguage(text: string, contentType: string): CmLanguage {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("json")) return "json";
  if (ct.includes("xml") && !ct.includes("html")) return "xml";
  if (ct.includes("html")) return "html";
  if (ct.includes("javascript")) return "javascript";
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      JSON.parse(t);
      return "json";
    } catch {
      /* fallthrough */
    }
  }
  if (t.startsWith("<?xml") || /^<[\w-]+[\s>]/.test(t)) return "xml";
  return "text";
}

const responseEditorLanguage = computed(() => {
  if (!response.value || !response.value.ok) return "text" as CmLanguage;
  const ct = response.value.headers["content-type"] ?? "";
  return detectResponseLanguage(response.value.body, ct);
});

const responseEditorBody = computed(() => {
  if (!response.value || !response.value.ok) return "";
  const b = response.value.body;
  if (!responsePretty.value) return b;
  if (responseEditorLanguage.value === "json") {
    try {
      return JSON.stringify(JSON.parse(b), null, 2);
    } catch {
      return b;
    }
  }
  return b;
});

function beautifyBody() {
  if (bodyMode.value !== "raw") return;
  if (rawLanguage.value === "json") {
    try {
      bodyText.value = JSON.stringify(JSON.parse(bodyText.value || "{}"), null, 2);
    } catch {
      /* ignore */
    }
  }
}

function onBinaryFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  binaryFileName.value = file.name;
  const fr = new FileReader();
  fr.onload = () => {
    const data = String(fr.result ?? "");
    const i = data.indexOf(",");
    binaryBodyBase64.value = i >= 0 ? data.slice(i + 1) : "";
  };
  fr.readAsDataURL(file);
  input.value = "";
}

const rowAccentClass = computed(() => {
  const m = method.value.toLowerCase();
  const allowed = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
  return allowed.has(m) ? `http-panel__row--${m}` : "http-panel__row--default";
});

const headersCount = computed(() => countActiveKv(headerRows.value));
const paramsCount = computed(() => countActiveKv(paramRows.value));
const bodyHasContent = computed(() => {
  switch (bodyMode.value) {
    case "none":
      return false;
    case "raw":
      return bodyText.value.trim().length > 0;
    case "urlencoded":
      return countActiveKv(bodyUrlEncodedRows.value) > 0;
    case "binary":
      return binaryBodyBase64.value.length > 0;
    default:
      return false;
  }
});

/** Шаблон URL для превью {{var}} и сохранения: строка из поля адреса (compose) + API key в query при необходимости. */
function buildTemplateDisplayUrl(): string {
  let out = localUrl.value.trim();
  if (
    authState.type === "apikey" &&
    authState.apiKeyIn === "query" &&
    authState.apiKeyName.trim()
  ) {
    const joiner = out.includes("?") ? "&" : "?";
    out += `${joiner}${authState.apiKeyName.trim()}=${authState.apiKeyValue}`;
  }
  return out;
}

/** Фактический URL для HTTP: разбор строки из поля адреса, подстановка {{var}} в базе и в query. */
function buildSendUrl(vars: Record<string, string>): string {
  const { baseUrl, queryRows } = splitUrlQuery(localUrl.value);
  const base = applyVariables(baseUrl, vars);
  const rows = queryRows.map((r) => ({
    ...r,
    key: applyVariables(r.key, vars),
    value: applyVariables(r.value, vars),
  }));
  let u = buildUrlWithParams(base, rows);
  if (
    authState.type === "apikey" &&
    authState.apiKeyIn === "query" &&
    authState.apiKeyName.trim()
  ) {
    u = buildUrlWithParams(u, [
      {
        id: "auth-apikey",
        enabled: true,
        key: applyVariables(authState.apiKeyName.trim(), vars),
        value: applyVariables(authState.apiKeyValue, vars),
        description: "",
      },
    ]);
  }
  return applyVariables(u, vars);
}

function parseHeaders(): Record<string, string> {
  return effectiveHeaders();
}

function getDraftForSave(): Omit<SavedRequest, "id" | "name"> & { headers: Record<string, string> } {
  const hasBody = !["GET", "HEAD"].includes(method.value);
  const { body, bodyBase64 } = computeSendBody();
  const outBody =
    hasBody && body != null && String(body).length && !bodyBase64
      ? String(body)
      : null;
  return {
    method: method.value,
    url: buildTemplateDisplayUrl(),
    headers: effectiveHeaders(),
    body: outBody,
    paramRows: paramRows.value,
    headerRows: headerRows.value,
    bodyMode: bodyMode.value,
    rawLanguage: rawLanguage.value,
    bodyUrlEncodedRows: bodyUrlEncodedRows.value,
    auth: { ...authState },
  };
}

const varsForSend = computed(() => variables.value || {});
const finalUrl = computed(() => buildTemplateDisplayUrl());
const resolvedUrl = computed(() => applyVariables(finalUrl.value, varsForSend.value));
type UrlPart = { text: string; kind: "text" | "resolved" | "missing"; key?: string };
const urlPreviewParts = computed<UrlPart[]>(() => {
  const template = finalUrl.value;
  const v = varsForSend.value;
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  const parts: UrlPart[] = [];
  let last = 0;
  for (;;) {
    const m = re.exec(template);
    if (!m) break;
    const idx = m.index ?? 0;
    if (idx > last) {
      parts.push({ text: template.slice(last, idx), kind: "text" });
    }
    const key = String(m[1] ?? "").trim();
    const val = resolvedVar(v, key);
    if (val != null) {
      parts.push({ text: val, kind: "resolved", key });
    } else {
      parts.push({ text: `{{${key}}}`, kind: "missing", key });
    }
    last = idx + m[0].length;
  }
  if (last < template.length) {
    parts.push({ text: template.slice(last), kind: "text" });
  }
  return parts.length ? parts : [{ text: template, kind: "text" }];
});
const urlPreviewOk = computed(() => !urlPreviewParts.value.some((p) => p.kind === "missing"));

function applySavedRequest(req: SavedRequest) {
  loadingSavedRequest.value = true;
  try {
  method.value = req.method || "GET";
  const rawUrl = (req.url || "").trim();
  if (Array.isArray(req.paramRows)) {
    const { baseUrl, queryRows } = splitUrlQuery(rawUrl);
    url.value = baseUrl || rawUrl;
    const cloned = ensureTrailingEmptyRow(req.paramRows.map((r) => ({ ...r })));
    const hasSaved = cloned.some((r) => r.key.trim());
    paramRows.value = hasSaved ? cloned : queryRows;
  } else {
    const { baseUrl, queryRows } = splitUrlQuery(rawUrl);
    url.value = baseUrl || rawUrl;
    paramRows.value = queryRows;
  }
  if (Array.isArray(req.headerRows)) {
    headerRows.value = req.headerRows;
  } else {
    headerRows.value = kvRowsFromRecord(
      req.headers && Object.keys(req.headers).length
        ? (req.headers as Record<string, string>)
        : { Accept: "application/json" }
    );
  }
  const rawBody = (req.body ?? "").trim();
  if (req.bodyMode) {
    bodyMode.value = req.bodyMode as BodyMode;
  } else {
    bodyMode.value = rawBody.length ? "raw" : "none";
  }
  bodyText.value = req.body ?? "";
  if (bodyMode.value === "raw" && rawBody.length) {
    try {
      JSON.parse(rawBody);
      rawLanguage.value = "json";
    } catch {
      rawLanguage.value = "text";
    }
  } else {
    rawLanguage.value = "json";
  }
  if (Array.isArray(req.bodyUrlEncodedRows)) {
    bodyUrlEncodedRows.value = req.bodyUrlEncodedRows;
  } else {
    bodyUrlEncodedRows.value = [newKvRow()];
  }
  binaryBodyBase64.value = "";
  binaryFileName.value = "";
  response.value = null;
  const a = req.auth;
  authState.type = a?.type ?? "none";
  authState.bearerToken = a?.bearerToken ?? "";
  authState.basicUser = a?.basicUser ?? "";
  authState.basicPass = a?.basicPass ?? "";
  authState.apiKeyName = a?.apiKeyName ?? "";
  authState.apiKeyValue = a?.apiKeyValue ?? "";
  authState.apiKeyIn = a?.apiKeyIn ?? "header";
  } finally {
    loadingSavedRequest.value = false;
  }
  materializeAuthIntoHeaderRows();
  syncLocalUrlFromState();
}

defineExpose({ getDraftForSave, applySavedRequest, parseHeaders, ensureTabForRequest, setActiveTab });

let draftTimer: number | null = null;
function scheduleDraftChanged() {
  if (draftTimer != null) window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    emit("draftChanged", getDraftForSave());
  }, 0);
}

watch(
  () => [
    method.value,
    url.value,
    localUrl.value,
    bodyText.value,
    bodyMode.value,
    rawLanguage.value,
    binaryBodyBase64.value,
    binaryFileName.value,
    responsePretty.value,
    subTab.value,
    JSON.stringify(headerRows.value),
    JSON.stringify(paramRows.value),
    JSON.stringify(bodyUrlEncodedRows.value),
    JSON.stringify(authState),
  ],
  scheduleDraftChanged
);

function onFocusOut(e: FocusEvent) {
  const to = e.relatedTarget as Node | null;
  if (to && (e.currentTarget as HTMLElement).contains(to)) return;
  emit("draftBlur", getDraftForSave());
}

async function send() {
  if (!window.desktop?.httpRequest) return;
  sending.value = true;
  response.value = null;
  try {
    const headers = effectiveHeaders();
    const hasBody = !["GET", "HEAD"].includes(method.value);
    const v = varsForSend.value;
    let body: string | null = null;
    let bodyBase64: string | null = null;
    if (hasBody) {
      switch (bodyMode.value) {
        case "raw": {
          const t = bodyText.value.trim();
          body = t.length ? applyVariables(bodyText.value, v) : null;
          break;
        }
        case "urlencoded": {
          const rows = bodyUrlEncodedRows.value.map((r) => ({
            ...r,
            key: applyVariables(r.key, v),
            value: applyVariables(r.value, v),
          }));
          const s = urlSearchParamsFromRows(rows);
          body = s.length ? s : null;
          break;
        }
        case "binary":
          bodyBase64 = binaryBodyBase64.value ? binaryBodyBase64.value : null;
          break;
        default:
          break;
      }
    }
    const headersOut = applyVariablesToHeaders(headers, v);
    if (authState.type === "bearer" && authState.bearerToken.trim()) {
      const t = applyVariables(authState.bearerToken, v).trim();
      if (t) headersOut["Authorization"] = `Bearer ${t}`;
    } else if (authState.type === "basic") {
      const u = applyVariables(authState.basicUser, v).trim();
      if (u) {
        const p = applyVariables(authState.basicPass, v);
        headersOut["Authorization"] = `Basic ${btoa(
          unescape(encodeURIComponent(`${u}:${p}`))
        )}`;
      }
    }
    const payload: HttpRequestPayload = {
      method: method.value,
      url: buildSendUrl(v),
      headers: headersOut,
      body: bodyBase64 ? null : body,
      bodyBase64: hasBody && bodyBase64 ? bodyBase64 : null,
      timeoutMs: 120_000,
    };
    response.value = await window.desktop.httpRequest(payload);
  } catch (e) {
    response.value = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      durationMs: 0,
    };
  } finally {
    sending.value = false;
  }
}

</script>

<template>
  <section class="http-panel" @focusout="onFocusOut">
    <div
      v-if="tabs.length"
      class="http-panel__tabstrip"
      role="tablist"
      aria-label="Открытые запросы"
    >
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="http-panel__tab"
        :class="{ 'http-panel__tab--active': t.key === activeTabKey }"
        role="tab"
        :aria-selected="t.key === activeTabKey"
        :title="t.title"
        @click="setActiveTab(t.key)"
        @contextmenu="openTabMenu($event, t.key)"
      >
        <span class="http-panel__tab-title">{{ t.title }}</span>
        <span class="http-panel__tab-spacer" />
        <span
          v-if="tabs.length"
          class="http-panel__tab-close"
          role="button"
          aria-label="Закрыть вкладку"
          title="Закрыть"
          @click.stop="closeTab(t.key)"
        >
          <PhX :size="14" weight="bold" aria-hidden="true" />
        </span>
      </button>
    </div>

    <AppContextMenu
      :open="tabMenuOpen"
      :anchor-el="tabMenuAnchor"
      align="left"
      @close="closeTabMenu"
    >
      <button
        type="button"
        class="http-panel__menu-item"
        role="menuitem"
        @click="
          closeTabMenu();
          if (tabMenuKey) closeTab(tabMenuKey);
        "
      >
        Закрыть
      </button>
      <button
        type="button"
        class="http-panel__menu-item"
        role="menuitem"
        @click="
          closeTabMenu();
          if (tabMenuKey) closeOtherTabs(tabMenuKey);
        "
      >
        Закрыть другие
      </button>
      <button
        type="button"
        class="http-panel__menu-item"
        role="menuitem"
        @click="
          closeTabMenu();
          if (tabMenuKey) closeTabsLeftOf(tabMenuKey);
        "
      >
        Закрыть слева
      </button>
      <button
        type="button"
        class="http-panel__menu-item"
        role="menuitem"
        @click="
          closeTabMenu();
          if (tabMenuKey) closeTabsRightOf(tabMenuKey);
        "
      >
        Закрыть справа
      </button>
      <button
        type="button"
        class="http-panel__menu-item"
        role="menuitem"
        @click="
          closeTabMenu();
          closeAllTabs();
        "
      >
        Закрыть все
      </button>
    </AppContextMenu>

    <div v-if="tabs.length" class="http-panel__toolbar">
      <p v-if="!hasHttp" class="http-panel__warn">
        Отправка только в Electron.
      </p>
    </div>

    <div v-if="tabs.length && hasHttp" class="http-panel__compose" :class="rowAccentClass">
      <AppSelect v-model="method">
        <option v-for="m in methods" :key="m" :value="m">{{ m }}</option>
      </AppSelect>
      <AppInput
        :model-value="localUrl"
        class="http-panel__url"
        type="text"
        placeholder="https://api.example.com/…"
        autocomplete="off"
        @update:model-value="onUrlInput"
        @focus="onUrlFocus"
        @blur="onUrlBlur"
      />
      <AppButton
        variant="primary"
        type="button"
        class="http-panel__send"
        :disabled="!canSend || sending"
        @click="send"
      >
        {{ sending ? "…" : "Отправить" }}
      </AppButton>
    </div>
    <p
      v-if="tabs.length && hasHttp"
      class="http-panel__resolved"
      :class="{ 'http-panel__resolved--ok': urlPreviewOk }"
      :title="resolvedUrl"
    >
      <span class="http-panel__resolved-arrow" aria-hidden="true">→</span>
      <span class="http-panel__resolved-url">
        <template v-for="(p, i) in urlPreviewParts" :key="i">
          <span
            v-if="p.kind === 'missing'"
            class="http-panel__resolved-part http-panel__resolved-part--missing"
            :title="`Не найдена переменная: ${p.key}`"
          >
            {{ p.text }}
          </span>
          <span
            v-else-if="p.kind === 'resolved'"
            class="http-panel__resolved-part http-panel__resolved-part--resolved"
            :title="p.key ? `{{${p.key}}}` : undefined"
          >
            {{ p.text }}
          </span>
          <span v-else class="http-panel__resolved-part">{{ p.text }}</span>
        </template>
      </span>
    </p>

    <div v-if="tabs.length" class="http-panel__split">
      <div class="http-panel__req">
        <div class="http-panel__subtabs-row">
          <div class="http-panel__subtabs http-panel__subtabs--full" role="tablist">
            <button
              type="button"
              class="http-panel__subtab"
              :class="{ 'http-panel__subtab--on': subTab === 'params' }"
              role="tab"
              :aria-selected="subTab === 'params'"
              @click="subTab = 'params'"
            >
              Параметры
              <span v-if="paramsCount" class="http-panel__subcount">({{ paramsCount }})</span>
            </button>
            <button
              type="button"
              class="http-panel__subtab"
              :class="{ 'http-panel__subtab--on': subTab === 'authorization' }"
              role="tab"
              :aria-selected="subTab === 'authorization'"
              @click="subTab = 'authorization'"
            >
              Авторизация
            </button>
            <button
              type="button"
              class="http-panel__subtab"
              :class="{ 'http-panel__subtab--on': subTab === 'headers' }"
              role="tab"
              :aria-selected="subTab === 'headers'"
              @click="subTab = 'headers'"
            >
              Заголовки
              <span v-if="headersCount" class="http-panel__subcount">({{ headersCount }})</span>
            </button>
            <button
              type="button"
              class="http-panel__subtab http-panel__subtab--body"
              :class="{ 'http-panel__subtab--on': subTab === 'body' }"
              role="tab"
              :aria-selected="subTab === 'body'"
              @click="subTab = 'body'"
            >
              Тело
              <span
                v-if="bodyHasContent"
                class="http-panel__body-dot"
                aria-label="Тело задано"
              />
            </button>
          </div>
        </div>

        <div
          class="http-panel__req-scroll"
          :class="{ 'http-panel__req-scroll--body': subTab === 'body' }"
        >
          <template v-if="subTab === 'params'">
            <p class="http-panel__section-hint">
              Параметры query синхронизируются с полем URL выше: правки здесь обновляют адрес и наоборот.
              В ключах и значениях можно писать <code v-pre>{{varName}}</code> (окружение и коллекция).
            </p>
            <RequestKvTable v-model="paramRows" />
          </template>

          <template v-else-if="subTab === 'authorization'">
            <p class="http-panel__section-hint">
              Типичные заголовки авторизации дублируются во вкладке «Заголовки»; правки таблицы
              отражаются здесь и наоборот (кроме ключа API в строке запроса).
              В полях ниже поддерживается <code v-pre>{{varName}}</code>.
            </p>
            <div class="http-panel__auth">
              <label class="http-panel__auth-label" for="auth-type">Тип</label>
              <AppSelect id="auth-type" v-model="authState.type" class="http-panel__auth-select">
                <option value="none">Нет</option>
                <option value="bearer">Токен Bearer</option>
                <option value="basic">Базовая авторизация</option>
                <option value="apikey">Ключ API</option>
              </AppSelect>
            </div>

            <template v-if="authState.type === 'bearer'">
              <label class="http-panel__auth-label" for="auth-bearer">Токен</label>
              <AppInput
                id="auth-bearer"
                v-model="authState.bearerToken"
                type="password"
                placeholder="токен"
                autocomplete="off"
              />
            </template>

            <template v-else-if="authState.type === 'basic'">
              <label class="http-panel__auth-label" for="auth-user">Имя пользователя</label>
              <AppInput id="auth-user" v-model="authState.basicUser" type="text" autocomplete="off" />
              <label class="http-panel__auth-label" for="auth-pass">Пароль</label>
              <AppInput id="auth-pass" v-model="authState.basicPass" type="password" autocomplete="off" />
            </template>

            <template v-else-if="authState.type === 'apikey'">
              <label class="http-panel__auth-label" for="auth-key-name">Ключ</label>
              <AppInput id="auth-key-name" v-model="authState.apiKeyName" type="text" placeholder="X-API-Key" />
              <label class="http-panel__auth-label" for="auth-key-val">Значение</label>
              <AppInput id="auth-key-val" v-model="authState.apiKeyValue" type="password" autocomplete="off" />
              <fieldset class="http-panel__auth-fieldset">
                <legend class="http-panel__auth-legend">Добавить в</legend>
                <label class="http-panel__auth-radio">
                  <input v-model="authState.apiKeyIn" type="radio" value="header" />
                  Заголовок
                </label>
                <label class="http-panel__auth-radio">
                  <input v-model="authState.apiKeyIn" type="radio" value="query" />
                  Строка запроса
                </label>
              </fieldset>
            </template>
          </template>

          <template v-else-if="subTab === 'headers'">
            <p class="http-panel__section-hint">
              Bearer, Basic и ключ API (режим «заголовок») синхронизированы с вкладкой «Авторизация».
              В ключах и значениях — <code v-pre>{{varName}}</code>.
            </p>
            <RequestKvTable v-model="headerRows" />
          </template>

          <template v-else>
            <p class="http-panel__section-hint">
              В теле (сыром и x-www-form-urlencoded) поддерживается <code v-pre>{{varName}}</code> в тексте и в
              ключах/значениях формы.
            </p>
            <div class="http-panel__body-layout">
              <div class="http-panel__body-chrome">
                <div class="http-panel__body-modes" role="radiogroup" aria-label="Тип тела">
                  <label class="http-panel__body-mode">
                    <input v-model="bodyMode" type="radio" name="req-body-mode" value="none" />
                    <span>Нет</span>
                  </label>
                  <label class="http-panel__body-mode">
                    <input
                      v-model="bodyMode"
                      type="radio"
                      name="req-body-mode"
                      value="urlencoded"
                    />
                    <span>Форма URL</span>
                  </label>
                  <label class="http-panel__body-mode">
                    <input v-model="bodyMode" type="radio" name="req-body-mode" value="raw" />
                    <span>Сырой текст</span>
                  </label>
                  <AppSelect
                    v-if="bodyMode === 'raw'"
                    v-model="rawLanguage"
                    class="http-panel__raw-lang"
                    aria-label="Формат тела"
                  >
                    <option value="json">JSON</option>
                    <option value="text">Текст</option>
                    <option value="xml">XML</option>
                    <option value="html">HTML</option>
                    <option value="javascript">JavaScript</option>
                  </AppSelect>
                  <label class="http-panel__body-mode">
                    <input v-model="bodyMode" type="radio" name="req-body-mode" value="binary" />
                    <span>Двоичные</span>
                  </label>
                </div>
                <button
                  v-if="bodyMode === 'raw' && rawLanguage === 'json'"
                  type="button"
                  class="http-panel__beautify"
                  @click="beautifyBody"
                >
                  Форматировать
                </button>
              </div>

              <p v-if="bodyMode === 'none'" class="http-panel__body-msg http-panel__body-msg--muted">
                У этого запроса нет тела.
              </p>

              <div v-if="bodyMode === 'urlencoded'" class="http-panel__body-editor">
                <RequestKvTable v-model="bodyUrlEncodedRows" />
              </div>
              <div v-else-if="bodyMode === 'binary'" class="http-panel__binary">
                <label class="http-panel__binary-btn">
                  <input type="file" class="http-panel__binary-input" @change="onBinaryFile" />
                  Выбрать файл
                </label>
                <span v-if="binaryFileName" class="http-panel__binary-name">{{ binaryFileName }}</span>
              </div>
              <div v-else-if="bodyMode === 'raw'" class="http-panel__body-editor">
                <RequestCodeMirror v-model="bodyText" :language="cmRequestLanguage" />
              </div>
            </div>
          </template>
        </div>
      </div>

      <div class="http-panel__res" aria-label="Ответ">
        <div class="http-panel__res-head">
          <span class="http-panel__res-title">Ответ</span>
        </div>
        <div v-if="!response" class="http-panel__empty">
          <p class="http-panel__empty-text">
            Нажмите «Отправить», чтобы получить ответ.
          </p>
        </div>
        <div v-else class="http-panel__res-body">
          <template v-if="response.ok">
            <div class="http-panel__status-line">
              <span class="http-panel__status-badge">{{ response.status }}</span>
              <span class="http-panel__status-text">{{ response.statusText }}</span>
              <span class="http-panel__duration">{{ response.durationMs }} мс</span>
            </div>
            <div class="http-panel__res-toolbar">
              <label class="http-panel__res-pretty">
                <input v-model="responsePretty" type="checkbox" />
                Красиво
              </label>
            </div>
            <div class="http-panel__res-editor">
              <RequestCodeMirror
                :model-value="responseEditorBody"
                :language="responseEditorLanguage"
                readonly
                :rich="false"
              />
            </div>
          </template>
          <p v-else class="http-panel__err">
            {{ response.error }}
            <span class="http-panel__duration">({{ response.durationMs }} мс)</span>
          </p>
        </div>
      </div>
    </div>

    <div v-else class="http-panel__empty" role="presentation">
      <div class="http-panel__empty-inner" aria-hidden="true">
        <AppLogoPathawk class="http-panel__empty-logo" title="Pathawk" />
        <div class="http-panel__empty-title">Pathawk</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.http-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--chrome-main);
  overflow: hidden;
}
.http-panel__tabstrip {
  display: flex;
  align-items: flex-end;
  gap: 0;
  flex-shrink: 0;
  padding: 0 0.5rem;
  min-height: 34px;
  border-bottom: 1px solid var(--chrome-divider);
  background: var(--chrome-nav);
  overflow-x: auto;
}
.http-panel__tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.85rem;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  margin-bottom: -1px;
  cursor: pointer;
  background: transparent;
  max-width: 240px;
}
.http-panel__tab--active {
  color: var(--text-primary);
  background: var(--chrome-main);
  border-color: var(--chrome-divider);
  border-bottom-color: var(--chrome-main);
}
.http-panel__tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.http-panel__tab-spacer {
  flex: 1;
  min-width: 0;
}
.http-panel__tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}
.http-panel__tab:hover .http-panel__tab-close {
  color: var(--text-secondary);
}
.http-panel__tab-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.http-panel__menu-item {
  width: 100%;
  text-align: left;
  padding: 0.45rem 0.6rem;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.http-panel__menu-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.http-panel__toolbar {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.35rem 0.75rem;
  border-bottom: 1px solid var(--chrome-divider);
  font-size: 12px;
}
.http-panel__breadcrumb {
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.http-panel__hint {
  margin: 0;
  color: var(--text-muted);
}
.http-panel__warn {
  margin: 0;
  color: #b45309;
}
[data-theme="dark"] .http-panel__warn {
  color: #fbbf24;
}
.http-panel__code {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 0.1rem 0.3rem;
  border-radius: var(--radius-sm);
  background: var(--bg-code);
  color: var(--text-primary);
}
.http-panel__compose {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--chrome-divider);
  background: var(--bg-subtle);
}
/* Селектор метода — первый .app-select; фикс. ширина чуть больше самой длинной подписи (OPTIONS) + отступы и стрелка */
.http-panel__compose > :deep(.app-select) {
  box-sizing: border-box;
  flex-shrink: 0;
  font-weight: 700;
  font-family: var(--font-mono);
  width: calc(7.35ch + 2rem);
  min-width: calc(7.35ch + 2rem);
  max-width: calc(7.35ch + 2rem);
}
.http-panel__row--get {
  border-left: 3px solid var(--method-get);
}
.http-panel__row--post {
  border-left: 3px solid var(--method-get);
}
.http-panel__row--put {
  border-left: 3px solid var(--method-get);
}
.http-panel__row--patch {
  border-left: 3px solid var(--method-get);
}
.http-panel__row--delete {
  border-left: 3px solid var(--method-get);
}
.http-panel__row--head,
.http-panel__row--options,
.http-panel__row--default {
  border-left: 3px solid var(--method-get);
}
.http-panel__url {
  flex: 1;
  min-width: 160px;
}
.http-panel__resolved {
  margin: 0.3rem 0 0;
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.http-panel__resolved--ok {
  color: #15803d;
}
[data-theme="dark"] .http-panel__resolved--ok {
  color: #4ade80;
}
.http-panel__resolved-arrow {
  margin-right: 0.35rem;
  opacity: 0.8;
}
.http-panel__resolved-url {
  min-width: 0;
}
.http-panel__resolved-part--missing {
  color: #b91c1c;
  font-weight: 700;
}
[data-theme="dark"] .http-panel__resolved-part--missing {
  color: #fca5a5;
}
.http-panel__resolved-part--resolved {
  color: inherit;
}
.http-panel__send {
  flex-shrink: 0;
  min-width: 6.5rem;
}
.http-panel__split {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.http-panel__empty {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--chrome-main);
}
.http-panel__empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  opacity: 0.34;
  filter: grayscale(1);
  user-select: none;
  pointer-events: none;
}
/* http-panel__empty-logo сливается с корнем AppLogoPathawk (<img>), вложенного img нет */
.http-panel__empty-inner :deep(.http-panel__empty-logo) {
  width: min(480px, 80vmin);
  height: min(480px, 80vmin);
  max-width: 100%;
  filter: none;
}
.http-panel__empty-title {
  font-weight: 800;
  letter-spacing: -0.02em;
  font-size: 22px;
  color: var(--text-muted);
}
.http-panel__req {
  flex: 1 1 42%;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-bottom: 2px solid var(--chrome-divider);
}
.http-panel__subtabs-row {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0 0.35rem 0 0.5rem;
  border-bottom: 1px solid var(--chrome-divider);
  background: var(--chrome-main);
}
.http-panel__subtabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  min-width: 0;
}
.http-panel__subtabs--full {
  flex: 1;
}
.http-panel__subtab {
  margin: 0;
  padding: 0.45rem 0.65rem;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}
.http-panel__subtab:hover {
  color: var(--text-primary);
}
.http-panel__subtab--on {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.http-panel__subcount {
  font-weight: 600;
  color: var(--accent);
  font-size: 11px;
}
.http-panel__subtab--body {
  gap: 0.35rem;
}
.http-panel__body-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-2);
  box-shadow: 0 0 0 1px var(--chrome-main);
}
[data-theme="dark"] .http-panel__body-dot {
  background: var(--accent);
}
.http-panel__req-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.5rem 0.75rem 0.75rem;
}
.http-panel__req-scroll--body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.http-panel__body-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.http-panel__body-chrome {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.75rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--chrome-divider);
}
.http-panel__body-modes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.65rem;
}
.http-panel__body-mode {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}
.http-panel__body-mode input {
  accent-color: var(--accent-2);
  margin: 0;
}
.http-panel__body-mode:has(input:checked) span {
  color: var(--accent-2);
}
.http-panel__raw-lang {
  width: auto;
  min-width: 92px;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-2);
}
.http-panel__beautify {
  margin: 0;
  padding: 0;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-2);
  background: none;
  border: none;
  cursor: pointer;
}
.http-panel__beautify:hover {
  text-decoration: underline;
}
.http-panel__body-msg {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.45;
}
.http-panel__body-msg--muted {
  color: var(--text-muted);
}
.http-panel__body-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.http-panel__binary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.http-panel__binary-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.4rem 0.75rem;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  cursor: pointer;
  overflow: hidden;
}
.http-panel__binary-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  font-size: 0;
}
.http-panel__binary-name {
  font-size: 12px;
  color: var(--text-muted);
}
.http-panel__section-hint {
  margin: 0 0 0.5rem;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.45;
}
.http-panel__field-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  margin: 0 0 0.3rem;
}
.http-panel__auth {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-width: 420px;
}
.http-panel__auth-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  margin-top: 0.35rem;
}
.http-panel__auth-select {
  max-width: 280px;
}
.http-panel__auth-fieldset {
  margin: 0.75rem 0 0;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--chrome-divider);
  border-radius: var(--radius-sm);
}
.http-panel__auth-legend {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 0 0.25rem;
}
.http-panel__auth-radio {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-right: 1rem;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}
.http-panel__res {
  flex: 1 1 48%;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--chrome-main);
}
.http-panel__res-head {
  flex-shrink: 0;
  padding: 0.35rem 0.75rem;
  border-bottom: 1px solid var(--chrome-divider);
  background: var(--chrome-nav);
}
.http-panel__res-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.http-panel__res .http-panel__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  min-height: 120px;
}
.http-panel__empty-text {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
  max-width: 280px;
  line-height: 1.5;
}
.http-panel__res-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0.65rem 0.75rem;
}
.http-panel__res-toolbar {
  flex-shrink: 0;
  margin-bottom: 0.4rem;
}
.http-panel__res-pretty {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}
.http-panel__res-pretty input {
  accent-color: var(--accent-2);
}
.http-panel__res-editor {
  flex: 1;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.http-panel__status-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}
.http-panel__status-badge {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: var(--radius-pill);
  background: var(--accent-muted);
  color: var(--accent);
  border: 1px solid var(--accent-2-muted);
}
.http-panel__status-text {
  font-weight: 600;
  color: var(--text-primary);
}
.http-panel__duration {
  font-size: 12px;
  color: var(--text-muted);
}
.http-panel__err {
  margin: 0;
  color: #dc2626;
  font-size: 13px;
}
[data-theme="dark"] .http-panel__err {
  color: #f87171;
}
</style>
