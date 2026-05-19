import type { CollectionDoc, FolderNode, SavedRequest } from "../../types/collection";
import { newKvRow, type AuthState, type KvRow } from "../requestEditor";

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
] as const;

/** OpenAPI 3.0/3.1 (объект после JSON/YAML parse) → CollectionDoc. */
export function importOpenAPISpec(root: unknown): CollectionDoc {
  if (!root || typeof root !== "object") {
    throw new Error("Некорректный документ");
  }
  const doc = root as Record<string, unknown>;
  const ver = String(doc.openapi ?? "");
  if (!ver.startsWith("3.")) {
    throw new Error(`Поддерживается только OpenAPI 3.x (получено: ${ver || "пусто"})`);
  }
  const info = doc.info;
  const title =
    info && typeof info === "object"
      ? String((info as Record<string, unknown>).title ?? "OpenAPI")
      : "OpenAPI";
  const rootServers = Array.isArray(doc.servers) ? (doc.servers as unknown[]) : [];
  const components = doc.components && typeof doc.components === "object" ? (doc.components as Record<string, unknown>) : null;
  const securitySchemes =
    components &&
    components.securitySchemes &&
    typeof components.securitySchemes === "object" &&
    !Array.isArray(components.securitySchemes)
      ? (components.securitySchemes as Record<string, unknown>)
      : {};
  const rootSecurity = Array.isArray(doc.security) ? (doc.security as unknown[]) : [];
  let collection: CollectionDoc = {
    id: crypto.randomUUID(),
    name: title,
    folders: [],
    requests: [],
  };
  const paths = doc.paths;
  if (paths && typeof paths === "object" && !Array.isArray(paths)) {
    for (const [pathKey, pathItem] of Object.entries(paths as Record<string, unknown>)) {
      if (pathKey.startsWith("x-")) continue;
      if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) continue;
      const pi = pathItem as Record<string, unknown>;
      const segments = openapiPathSegments(pathKey);
      if (segments.length === 0) continue;
      const pathNorm = pathKey.startsWith("/") ? pathKey : `/${pathKey}`;
      const folderPath = segments.length > 1 ? segments.slice(0, -1) : [];
      const leafSegment = segments[segments.length - 1] ?? "";
      const pathServers = Array.isArray(pi.servers) ? (pi.servers as unknown[]) : [];
      const pathParams = Array.isArray(pi.parameters) ? (pi.parameters as unknown[]) : [];
      for (const m of HTTP_METHODS) {
        const op = pi[m];
        if (!op || typeof op !== "object" || Array.isArray(op)) continue;
        const opObj = op as Record<string, unknown>;
        const opServers = Array.isArray(opObj.servers) ? (opObj.servers as unknown[]) : [];
        const opParams = Array.isArray(opObj.parameters) ? (opObj.parameters as unknown[]) : [];
        const fullUrl = buildServerUrl(opServers, pathServers, rootServers, pathNorm);
        const { paramRows, headerRows } = buildParamsRows(pathParams, opParams);
        const auth = buildAuthState(opObj, rootSecurity, securitySchemes);
        const summary = String(opObj.summary ?? "").trim();
        const opId = String(opObj.operationId ?? "").trim();
        const name =
          opId ||
          summary ||
          `${m.toUpperCase()} ${leafSegment}`;
        const req: SavedRequest = {
          id: crypto.randomUUID(),
          name,
          method: m.toUpperCase(),
          url: fullUrl,
          headers: { Accept: "application/json" },
          body: guessBodyFromOperation(opObj, m),
          paramRows,
          headerRows,
          auth,
        };
        collection = addRequestUnderFolderPath(collection, folderPath, req);
      }
    }
  }
  return collection;
}

function serverUrlFromList(servers: unknown[]): string {
  if (!Array.isArray(servers) || servers.length === 0) return "";
  const s0 = servers[0];
  if (!s0 || typeof s0 !== "object") return "";
  const url = (s0 as Record<string, unknown>).url;
  return typeof url === "string" ? url.replace(/\/$/, "") : "";
}

function buildServerUrl(opServers: unknown[], pathServers: unknown[], rootServers: unknown[], path: string): string {
  const base =
    serverUrlFromList(opServers) ||
    serverUrlFromList(pathServers) ||
    serverUrlFromList(rootServers);
  return base ? `${base}${path}` : path;
}

function buildParamsRows(pathParams: unknown[], opParams: unknown[]): { paramRows?: KvRow[]; headerRows?: KvRow[] } {
  const all = [...(Array.isArray(pathParams) ? pathParams : []), ...(Array.isArray(opParams) ? opParams : [])];
  const paramRows: KvRow[] = [];
  const headerRows: KvRow[] = [];
  for (const p of all) {
    if (!p || typeof p !== "object" || Array.isArray(p)) continue;
    const po = p as Record<string, unknown>;
    const where = String(po.in ?? "");
    const name = String(po.name ?? "");
    if (!name.trim()) continue;
    const required = !!po.required;
    const desc = String(po.description ?? "");
    if (where === "query") {
      paramRows.push(newKvRow({ enabled: required, key: name, value: "", description: desc }));
    } else if (where === "header") {
      headerRows.push(newKvRow({ enabled: required, key: name, value: "", description: desc }));
    }
  }
  return {
    paramRows: paramRows.length ? paramRows : undefined,
    headerRows: headerRows.length ? headerRows : undefined,
  };
}

function buildAuthState(
  opObj: Record<string, unknown>,
  rootSecurity: unknown[],
  schemes: Record<string, unknown>
): AuthState | undefined {
  const opSecurity = Array.isArray(opObj.security) ? (opObj.security as unknown[]) : null;
  const secList = opSecurity ?? (Array.isArray(rootSecurity) ? rootSecurity : []);
  // Security requirements: array of objects { schemeName: [scopes] }
  for (const req of secList) {
    if (!req || typeof req !== "object" || Array.isArray(req)) continue;
    const ro = req as Record<string, unknown>;
    const keys = Object.keys(ro);
    for (const k of keys) {
      const scheme = schemes[k];
      if (!scheme || typeof scheme !== "object" || Array.isArray(scheme)) continue;
      const so = scheme as Record<string, unknown>;
      const type = String(so.type ?? "");
      if (type === "http") {
        const schemeName = String(so.scheme ?? "").toLowerCase();
        if (schemeName === "bearer") {
          return {
            type: "bearer",
            bearerToken: "{{token}}",
            basicUser: "",
            basicPass: "",
            apiKeyName: "",
            apiKeyValue: "",
            apiKeyIn: "header",
          };
        }
        if (schemeName === "basic") {
          return {
            type: "basic",
            bearerToken: "",
            basicUser: "{{username}}",
            basicPass: "{{password}}",
            apiKeyName: "",
            apiKeyValue: "",
            apiKeyIn: "header",
          };
        }
      }
      if (type === "apiKey") {
        const name = String(so.name ?? "");
        const where = String(so.in ?? "").toLowerCase();
        return {
          type: "apikey",
          bearerToken: "",
          basicUser: "",
          basicPass: "",
          apiKeyName: name,
          apiKeyValue: "{{apiKey}}",
          apiKeyIn: where === "query" ? "query" : "header",
        };
      }
    }
  }
  return undefined;
}

/** `/tests/GetTests/` → `["tests","GetTests"]` */
function openapiPathSegments(pathKey: string): string[] {
  return pathKey
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Положить запрос в `folders` по цепочке имён; пустой путь → корень `requests`. */
function addRequestUnderFolderPath(
  doc: CollectionDoc,
  folderPath: string[],
  req: SavedRequest
): CollectionDoc {
  if (folderPath.length === 0) {
    return { ...doc, requests: [...doc.requests, req] };
  }
  return { ...doc, folders: mergeFolderChain(doc.folders, folderPath, req) };
}

function mergeFolderChain(
  nodes: FolderNode[],
  path: string[],
  req: SavedRequest
): FolderNode[] {
  const [head, ...rest] = path;
  const idx = nodes.findIndex((n) => n.name === head);
  if (idx === -1) {
    if (rest.length === 0) {
      return [
        ...nodes,
        {
          id: crypto.randomUUID(),
          name: head,
          folders: [],
          requests: [req],
        },
      ];
    }
    return [
      ...nodes,
      {
        id: crypto.randomUUID(),
        name: head,
        folders: mergeFolderChain([], rest, req),
        requests: [],
      },
    ];
  }
  const n = nodes[idx];
  if (rest.length === 0) {
    return nodes.map((x, i) =>
      i === idx ? { ...n, requests: [...n.requests, req] } : x
    );
  }
  return nodes.map((x, i) =>
    i === idx ? { ...n, folders: mergeFolderChain(n.folders, rest, req) } : x
  );
}

function guessBodyFromOperation(
  op: Record<string, unknown>,
  method: string
): string | null {
  if (method === "get" || method === "head" || method === "delete") return null;
  const rb = op.requestBody;
  if (!rb || typeof rb !== "object") return null;
  const rbo = rb as Record<string, unknown>;
  const content = rbo.content;
  if (!content || typeof content !== "object") return null;
  const c = content as Record<string, unknown>;
  const appJson = c["application/json"];
  if (appJson && typeof appJson === "object") {
    const ex = (appJson as Record<string, unknown>).example;
    if (ex !== undefined) {
      return typeof ex === "string" ? ex : JSON.stringify(ex, null, 2);
    }
  }
  return null;
}
