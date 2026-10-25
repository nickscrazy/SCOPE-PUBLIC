// Structured JSON logs on stdout. Callers pass identifiers, never email addresses,
// passwords, tokens, profile text or IP addresses.
const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof levels;
let threshold: number = levels.info;
let silent = false;
export function configureLogging(level: Level, quiet = false) {
  threshold = levels[level];
  silent = quiet;
}
function write(level: Level, event: string, fields: Record<string, unknown>) {
  if (silent || levels[level] < threshold) return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (levels[level] >= levels.warn) process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}
export const log = {
  debug: (event: string, fields: Record<string, unknown> = {}) =>
    write("debug", event, fields),
  info: (event: string, fields: Record<string, unknown> = {}) =>
    write("info", event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}) =>
    write("warn", event, fields),
  error: (event: string, fields: Record<string, unknown> = {}) =>
    write("error", event, fields),
};
export function errorName(e: unknown) {
  return e instanceof Error ? e.name + (e.message.startsWith("TED ") ? ": " + e.message : "") : "UnknownError";
}
