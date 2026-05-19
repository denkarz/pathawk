export type KvRow = {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
  description: string;
};

export function newKvRow(partial?: Partial<KvRow>): KvRow {
  const key = partial?.key ?? "";
  const value = partial?.value ?? "";
  const description = partial?.description ?? "";
  const hasCell =
    key.trim().length > 0 ||
    value.trim().length > 0 ||
    description.trim().length > 0;
  const enabled =
    partial?.enabled !== undefined ? partial.enabled : hasCell;
  return {
    id: partial?.id ?? crypto.randomUUID(),
    enabled,
    key,
    value,
    description,
  };
}

export function kvRowsFromRecord(obj: Record<string, string>): KvRow[] {
  const rows = Object.entries(obj).map(([key, value]) =>
    newKvRow({ key, value, description: "" })
  );
  return ensureTrailingEmptyRow(rows);
}

/** Одна пустая строка-заглушка в конце; без дублей пустых хвостов. */
export function ensureTrailingEmptyRow(rows: KvRow[]): KvRow[] {
  const copy = rows.map((r) => ({ ...r }));
  while (
    copy.length > 1 &&
    !copy[copy.length - 1].key.trim() &&
    !copy[copy.length - 1].value.trim() &&
    !copy[copy.length - 1].description.trim()
  ) {
    const prev = copy[copy.length - 2];
    if (!prev.key.trim() && !prev.value.trim() && !prev.description.trim()) {
      copy.pop();
      continue;
    }
    break;
  }
  const last = copy[copy.length - 1];
  if (
    !last ||
    last.key.trim() ||
    last.value.trim() ||
    last.description.trim()
  ) {
    copy.push(newKvRow());
  }
  return copy;
}

export function headersFromRows(rows: KvRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (!r.enabled) continue;
    const k = r.key.trim();
    if (!k) continue;
    out[k] = r.value;
  }
  return out;
}

/** Все пары с непустым ключом (без учёта чекбокса «включено»). */
export function keyValueRowsToRecord(rows: KvRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    out[k] = r.value;
  }
  return out;
}

export function countActiveKv(rows: KvRow[]): number {
  return rows.filter((r) => r.enabled && r.key.trim()).length;
}

/** Тело `application/x-www-form-urlencoded` из строк таблицы. */
export function urlSearchParamsFromRows(rows: KvRow[]): string {
  const p = new URLSearchParams();
  for (const r of rows) {
    if (!r.enabled) continue;
    const k = r.key.trim();
    if (!k) continue;
    p.append(k, r.value);
  }
  return p.toString();
}

export function buildUrlWithParams(urlStr: string, rows: KvRow[]): string {
  const trimmed = urlStr.trim();
  if (!trimmed) return trimmed;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    // Шаблоны вроде {{baseUrl}}/path — без валидного URL(): собираем query вручную.
    const qIdx = trimmed.indexOf("?");
    const baseOnly = qIdx === -1 ? trimmed : trimmed.slice(0, qIdx);
    const q = urlSearchParamsFromRows(rows);
    if (!q) return baseOnly;
    return `${baseOnly}?${q}`;
  }
  for (const r of rows) {
    if (!r.enabled) continue;
    const k = r.key.trim();
    if (!k) continue;
    u.searchParams.set(k, r.value);
  }
  return u.toString();
}

/** База URL без query + строки query-параметров (для загрузки черновика). */
export function splitUrlQuery(urlStr: string): { baseUrl: string; queryRows: KvRow[] } {
  const trimmed = urlStr.trim();
  if (!trimmed) {
    return { baseUrl: "", queryRows: [newKvRow()] };
  }
  try {
    const u = new URL(trimmed);
    const queryRows: KvRow[] = [];
    u.searchParams.forEach((value, key) => {
      queryRows.push(newKvRow({ key, value, description: "" }));
    });
    u.search = "";
    return {
      baseUrl: u.toString(),
      queryRows: ensureTrailingEmptyRow(queryRows),
    };
  } catch {
    // {{var}} в хосте/пути — new URL() падает; режем по первому «?» и парсим query через URLSearchParams.
    const qIdx = trimmed.indexOf("?");
    if (qIdx === -1) {
      return {
        baseUrl: trimmed,
        queryRows: [newKvRow()],
      };
    }
    const basePart = trimmed.slice(0, qIdx);
    const queryPart = trimmed.slice(qIdx + 1);
    const queryRows: KvRow[] = [];
    if (queryPart.length) {
      const sp = new URLSearchParams(queryPart);
      sp.forEach((value, key) => {
        queryRows.push(newKvRow({ key, value, description: "" }));
      });
    }
    return {
      baseUrl: basePart,
      queryRows: ensureTrailingEmptyRow(queryRows),
    };
  }
}

export type AuthType = "none" | "bearer" | "basic" | "apikey";

export type AuthState = {
  type: AuthType;
  bearerToken: string;
  basicUser: string;
  basicPass: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyIn: "header" | "query";
};

export function authHeaders(state: AuthState): Record<string, string> {
  const h: Record<string, string> = {};
  if (state.type === "bearer" && state.bearerToken.trim()) {
    h.Authorization = `Bearer ${state.bearerToken.trim()}`;
  } else if (state.type === "basic" && state.basicUser.trim()) {
    const raw = `${state.basicUser}:${state.basicPass}`;
    h.Authorization = `Basic ${btoa(unescape(encodeURIComponent(raw)))}`;
  } else if (state.type === "apikey" && state.apiKeyName.trim() && state.apiKeyIn === "header") {
    h[state.apiKeyName.trim()] = state.apiKeyValue;
  }
  return h;
}

/** Добавляет query-параметр из API Key (если выбрано «в query»). */
export function mergeAuthIntoHeaders(
  base: Record<string, string>,
  state: AuthState
): Record<string, string> {
  const auth = authHeaders(state);
  return { ...base, ...auth };
}
