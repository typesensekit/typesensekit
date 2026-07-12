const DESTRUCTIVE_OPERATION_NAMES = new Set([
  "collections.fields.drop",
  "collections.fields.replace",
  "documents.import",
  "operations.cache.clear",
  "operations.vote",
]);

export function isDestructiveOperation(
  name: string,
  input?: Record<string, unknown>,
): boolean {
  if (name === "api.call") {
    if (!input) return true;
    const method = String(input.method ?? "").toLowerCase();
    return method !== "get" && method !== "head";
  }
  return DESTRUCTIVE_OPERATION_NAMES.has(name) || name.endsWith(".delete");
}
