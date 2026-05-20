const REDACTED = "[REDACTED]";
const SECRET_KEYS = new Set([
  "api_key",
  "apikey",
  "secret",
  "token",
  "authorization",
]);

function shouldRedactKey(key: string): boolean {
  return SECRET_KEYS.has(key.toLowerCase());
}

function isTypesenseApiKeyShape(value: Record<string, unknown>): boolean {
  return Array.isArray(value.actions) && Array.isArray(value.collections);
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      shouldRedactKey(key) ||
      (key === "value" && isTypesenseApiKeyShape(record))
        ? REDACTED
        : redactSecrets(child),
    ]),
  );
}
