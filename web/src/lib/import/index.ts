import { parse as parseYaml } from "yaml";
import { importPostmanCollection } from "./postmanCollection";
import { importOpenAPISpec } from "./openapi";
import type { CollectionDoc } from "../../types/collection";

export type ImportFormat = "postman" | "openapi";

/** Распознать формат по корню уже распарсенного документа. */
export function detectImportFormat(root: unknown): ImportFormat {
  if (!root || typeof root !== "object") {
    throw new Error("Пустой документ");
  }
  const o = root as Record<string, unknown>;
  if (typeof o.openapi === "string" && o.openapi.startsWith("3.")) {
    return "openapi";
  }
  const info = o.info;
  if (info && typeof info === "object") {
    const inf = info as Record<string, unknown>;
    const schema = String(inf.schema ?? "");
    if (schema.includes("getpostman.com") || schema.includes("postman")) {
      return "postman";
    }
    if (Array.isArray(o.item)) {
      return "postman";
    }
  }
  throw new Error(
    "Формат не распознан: нужен файл коллекции JSON v2 или спецификация OpenAPI 3.x"
  );
}

/** Текст файла → JSON/YAML parse → CollectionDoc. */
export function importFromFileText(text: string): CollectionDoc {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Пустой файл");
  let root: unknown;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    root = JSON.parse(trimmed) as unknown;
  } else {
    root = parseYaml(trimmed) as unknown;
  }
  const fmt = detectImportFormat(root);
  if (fmt === "openapi") return importOpenAPISpec(root);
  return importPostmanCollection(root);
}
