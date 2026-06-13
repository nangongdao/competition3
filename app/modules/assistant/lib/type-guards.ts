/**
 * Shared narrowing helpers for untyped Realtime server events.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getStringField(
  value: Record<string, unknown>,
  fieldName: string,
): string | null {
  const fieldValue = value[fieldName];
  return typeof fieldValue === "string" ? fieldValue : null;
}
