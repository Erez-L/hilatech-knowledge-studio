type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Structured JSON logging. Callers pass IDs and codes only: never document
 * text, question text, filenames, emails or secrets.
 */
export function log(level: Level, event: string, fields: Record<string, string | number | boolean | null | undefined> = {}) {
  const min = (process.env.LOG_LEVEL as Level | undefined) ?? (process.env.APP_ENV === "test" ? "error" : "info");
  if (ORDER[level] < (ORDER[min] ?? 20)) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}
