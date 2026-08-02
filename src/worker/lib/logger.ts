export type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export function logWorkerEvent(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  if (level === "error") {
    console.error(entry);
    return;
  }

  if (level === "warn") {
    console.warn(entry);
    return;
  }

  console.info(entry);
}
