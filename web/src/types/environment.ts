export type EnvironmentDoc = {
  id: string;
  name: string;
  /** плоский набор переменных для {{key}} */
  variables: Record<string, string>;
};

export function normalizeEnvironment(raw: Record<string, unknown>): EnvironmentDoc {
  const id = String(raw.id ?? "");
  const name = String(raw.name ?? "Окружение");
  let variables: Record<string, string> = {};
  const v = raw.variables;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      variables[k] = String(val ?? "");
    }
  }
  return { id, name, variables };
}
