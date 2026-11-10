import type { JsonSchemaLike } from "./operation-docs.js";

/** Operations whose input is `{collection, params, compact}` search parameters. */
export const SEARCH_OPERATIONS = new Set(["search", "documents.search"]);
/** Operations whose extra flags and top-level JSON keys become `params`. */
export const PARAMS_OPERATIONS = new Set([
  ...SEARCH_OPERATIONS,
  "documents.export",
]);

export type ParsedArgv = {
  positionals: string[];
  flags: Array<{ key: string; value: string | true }>;
};

/** `--per-page`, `--per_page` and `--perPage` all normalize to `perpage`. */
export function normalizeKey(key: string): string {
  return key.replace(/[-_]/g, "").toLowerCase();
}

/** `--per-page` and `--perPage` become the Typesense spelling `per_page`. */
export function snakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

/**
 * Parses operation argv with knowledge of which flags are booleans, so
 * `--q shoes products` reads `shoes` as the value of `--q` and `products` as
 * a positional (citty treats unknown flags as booleans).
 */
export function parseArgv(
  rawArgs: string[],
  isBoolean: (key: string) => boolean,
): ParsedArgv {
  const positionals: string[] = [];
  const flags: ParsedArgv["flags"] = [];
  for (let index = 0; index < rawArgs.length; index++) {
    const token = rawArgs[index] ?? "";
    if (token === "--") {
      positionals.push(...rawArgs.slice(index + 1));
      break;
    }
    if (!token.startsWith("--")) {
      if (/^-[A-Za-z]/.test(token)) continue;
      positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    const equals = body.indexOf("=");
    if (equals >= 0) {
      flags.push({ key: body.slice(0, equals), value: body.slice(equals + 1) });
      continue;
    }
    const next = rawArgs[index + 1];
    if (isBoolean(body) && /^(?:true|false)$/i.test(next ?? "")) {
      // `--facet true` / `--facet false` spell out a boolean value.
      flags.push({ key: body, value: String(next).toLowerCase() });
      index++;
    } else if (
      !isBoolean(body) &&
      next !== undefined &&
      (!next.startsWith("-") || /^-\d/.test(next))
    ) {
      flags.push({ key: body, value: next });
      index++;
    } else {
      flags.push({ key: body, value: true });
    }
  }
  return { positionals, flags };
}

function schemaTypes(schema: JsonSchemaLike | undefined): string[] {
  if (!schema) return [];
  if (Array.isArray(schema.type)) return schema.type;
  if (schema.type) return [schema.type];
  return (schema.anyOf ?? []).flatMap(schemaTypes);
}

/** Converts a flag value to the JSON type the input schema expects. */
export function coerceFlagValue(
  value: string | true,
  schema: JsonSchemaLike | undefined,
): unknown {
  const types = schemaTypes(schema);
  if (value === true) return true;
  if (types.length === 1 && types[0] === "string") return value;
  if (types.includes("boolean") && /^(?:true|false)$/i.test(value))
    return value.toLowerCase() === "true";
  if (
    (types.includes("number") || types.includes("integer")) &&
    value.trim() !== "" &&
    Number.isFinite(Number(value))
  )
    return Number(value);
  if (/^\s*[[{]/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      // Fall through to a plain or comma-separated string.
    }
  }
  if (types.includes("array") && !types.includes("string"))
    return value.split(",").map((entry) => entry.trim());
  return value;
}

/**
 * Moves keys that are not part of a params-style input (`collection`, `params`,
 * `compact`) into `params`, so `{"collection":"c","q":"*"}` works like
 * `{"collection":"c","params":{"q":"*"}}`.
 */
export function hoistParams(
  operationName: string,
  input: Record<string, unknown>,
  topLevelKeys: string[],
): Record<string, unknown> {
  if (!PARAMS_OPERATIONS.has(operationName)) return input;
  const top = new Set(topLevelKeys);
  const hoisted: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (top.has(key)) rest[key] = value;
    else hoisted[key] = value;
  }
  if (
    rest.params !== undefined &&
    (typeof rest.params !== "object" ||
      rest.params === null ||
      Array.isArray(rest.params))
  )
    return rest;
  const params = {
    ...hoisted,
    ...(rest.params as Record<string, unknown> | undefined),
  };
  if (SEARCH_OPERATIONS.has(operationName) && params.q === undefined)
    params.q = "*";
  if (!Object.keys(params).length && rest.params === undefined) return rest;
  return { ...rest, params };
}

/** Lists input keys that the schema does not know, with likely intended keys. */
export function unknownKeyHint(
  input: Record<string, unknown>,
  properties: string[],
): string | undefined {
  const unknown = Object.keys(input).filter(
    (key) => key !== "yes" && !properties.includes(key),
  );
  if (!unknown.length) return undefined;
  return `Unknown input field${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Valid fields: ${properties.join(", ") || "(none)"}.`;
}
