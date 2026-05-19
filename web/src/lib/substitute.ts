/**
 * Значение для {{key}}: null, если ключа нет или значение пустое/одни пробелы.
 * Пустая строка в коллекции/окружении не считается успешной подстановкой (иначе превью URL «зеленеет» без реальных данных).
 */
export function resolvedVar(
  vars: Record<string, string>,
  rawKey: string
): string | null {
  const key = String(rawKey).trim();
  if (!Object.prototype.hasOwnProperty.call(vars, key)) return null;
  const raw = String(vars[key] ?? "");
  if (raw.trim() === "") return null;
  return raw;
}

/**
 * Подстановка переменных {{varName}} (окружение и коллекция).
 * Неизвестные ключи и пустые значения оставляются как {{varName}}.
 */
export function applyVariables(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, rawKey: string) => {
    const key = String(rawKey).trim();
    const val = resolvedVar(vars, key);
    if (val == null) return `{{${key}}}`;
    return val;
  });
}

export function applyVariablesToHeaders(
  headers: Record<string, string>,
  vars: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[applyVariables(k, vars)] = applyVariables(v, vars);
  }
  return out;
}
