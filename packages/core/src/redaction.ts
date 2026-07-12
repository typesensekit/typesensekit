const REDACTED = "[REDACTED]";
const CIRCULAR = "[Circular]";
const SECRET_KEYS = new Set([
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "secret",
  "setcookie",
  "token",
  "xtypesenseapikey",
]);

function shouldRedactKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, "");
  return (
    SECRET_KEYS.has(normalized) ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret")
  );
}

function isTypesenseApiKeyShape(value: Record<string, unknown>): boolean {
  return Array.isArray(value.actions) && Array.isArray(value.collections);
}

export function redactText(value: string): string {
  return value
    .replace(
      /(["']?authorization["']?\s*[:=]\s*)(["']?)(?:Bearer|Basic)?\s*[-A-Za-z0-9._~+/=]+(["']?)/gi,
      (_match, prefix: string, openQuote: string) =>
        `${prefix}${openQuote}${REDACTED}${openQuote}`,
    )
    .replace(
      /(["']?(?:x-typesense-api-key|api[_-]?key|apikey|token|secret|cookie|set-cookie)["']?\s*[:=]\s*)(["']?)([^"',\s}\]]+)(["']?)/gi,
      (_match, prefix: string, openQuote: string, _secret: string) =>
        `${prefix}${openQuote}${REDACTED}${openQuote}`,
    )
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`);
}

function redactError(error: Error, seen: WeakSet<object>): unknown {
  const output: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(error)) {
    output[key] = redactValue(
      (error as unknown as Record<string, unknown>)[key],
      seen,
    );
  }
  if (!("name" in output)) output.name = error.name;
  if (!("message" in output)) output.message = redactText(error.message);
  return output;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactText(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (seen.has(value)) return CIRCULAR;
  seen.add(value);

  if (value instanceof Error) {
    return redactError(value, seen);
  }

  const record = value as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      shouldRedactKey(key) ||
      (key === "value" && isTypesenseApiKeyShape(record))
        ? REDACTED
        : redactValue(child, seen),
    ]),
  );
}

export function redactSecrets(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>());
}
