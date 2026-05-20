import { redactSecrets } from "@typesensekit/core";

export function render(value: unknown, json = false): string {
  const safeValue = redactSecrets(value);
  if (json || typeof value !== "object" || value === null) {
    return JSON.stringify(safeValue, null, 2);
  }
  if (Array.isArray(value)) {
    return JSON.stringify(safeValue, null, 2);
  }
  return JSON.stringify(safeValue, null, 2);
}

export function parseInput(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("--input must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}
