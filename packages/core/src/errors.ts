import { redactSecrets, redactText } from "./redaction.js";

export type NormalizedTypesenseError = {
  code: string;
  message: string;
  details?: unknown;
};

type ErrorLike = {
  address?: unknown;
  cause?: unknown;
  code?: unknown;
  hostname?: unknown;
  host?: unknown;
  name?: unknown;
  message?: unknown;
  httpStatus?: unknown;
  port?: unknown;
  status?: unknown;
};

export type FormatTypesenseErrorOptions = {
  debug?: boolean;
};

const NETWORK_ERROR_CODES = new Set([
  "EAI_AGAIN",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

function readErrorLike(error: unknown): ErrorLike {
  return typeof error === "object" && error !== null
    ? (error as ErrorLike)
    : {};
}

function findNetworkErrorCode(error: unknown): string | undefined {
  const errorLike = readErrorLike(error);
  if (
    typeof errorLike.code === "string" &&
    NETWORK_ERROR_CODES.has(errorLike.code.toUpperCase())
  ) {
    return errorLike.code.toUpperCase();
  }

  if (typeof errorLike.message === "string") {
    const match = errorLike.message.match(
      /\b(EAI_AGAIN|ECONNABORTED|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT)\b/i,
    );
    if (match?.[1]) return match[1].toUpperCase();
  }

  return errorLike.cause === undefined
    ? undefined
    : findNetworkErrorCode(errorLike.cause);
}

function endpointLabel(error: unknown): string | undefined {
  const errorLike = readErrorLike(error);
  const host =
    typeof errorLike.hostname === "string"
      ? errorLike.hostname
      : typeof errorLike.host === "string"
        ? errorLike.host
        : typeof errorLike.address === "string"
          ? errorLike.address
          : undefined;
  const port =
    typeof errorLike.port === "number" || typeof errorLike.port === "string"
      ? String(errorLike.port)
      : undefined;

  if (host && port) return `${host}:${port}`;
  if (host) return host;
  return errorLike.cause === undefined
    ? undefined
    : endpointLabel(errorLike.cause);
}

function conciseNetworkErrorMessage(error: unknown): string | undefined {
  const code = findNetworkErrorCode(error);
  if (!code) return undefined;

  const endpoint = endpointLabel(error);
  return `Request failed: ${code}${endpoint ? ` ${endpoint}` : ""}`;
}

export function normalizeTypesenseError(
  error: unknown,
): NormalizedTypesenseError {
  if (error instanceof Error) {
    const errorLike = error as ErrorLike;
    const status = errorLike.httpStatus ?? errorLike.status;
    return {
      code:
        typeof status === "number"
          ? String(status)
          : error.name || "TypesenseError",
      message: redactText(error.message),
      details: redactSecrets(error),
    };
  }

  if (typeof error === "object" && error !== null) {
    const errorLike = error as ErrorLike;
    return {
      code:
        typeof errorLike.status === "number"
          ? String(errorLike.status)
          : "TypesenseError",
      message:
        typeof errorLike.message === "string"
          ? redactText(errorLike.message)
          : "Unknown Typesense error",
      details: redactSecrets(error),
    };
  }

  return { code: "TypesenseError", message: redactText(String(error)) };
}

export function formatTypesenseErrorMessage(
  error: unknown,
  options: FormatTypesenseErrorOptions = {},
): string {
  const normalized = normalizeTypesenseError(error);
  const message = conciseNetworkErrorMessage(error) ?? normalized.message;

  if (!options.debug) return message;

  return [
    message,
    "",
    "Debug details:",
    JSON.stringify(normalized.details ?? normalized, null, 2),
  ].join("\n");
}

type ErrorHintContext = {
  collection?: unknown;
  field?: unknown;
  fields?: unknown;
  name?: unknown;
};

function getFieldNames(context: ErrorHintContext): string[] {
  if (typeof context.field === "string") return [context.field];
  if (typeof context.name === "string") return [context.name];

  const { fields } = context;
  if (!Array.isArray(fields)) return [];
  return fields
    .map((field) => {
      if (typeof field !== "object" || field === null) return undefined;
      const name = (field as { name?: unknown }).name;
      return typeof name === "string" ? name : undefined;
    })
    .filter((name): name is string => Boolean(name));
}

export function getTypesenseErrorHint(
  error: unknown,
  context: ErrorHintContext = {},
): string | undefined {
  const { message } = normalizeTypesenseError(error);
  const collection =
    typeof context.collection === "string" ? context.collection : undefined;
  const [field] = getFieldNames(context);

  if (
    /already part of the schema/i.test(message) &&
    /drop it first/i.test(message)
  ) {
    if (collection && field) {
      return [
        "Typesense does not allow changing this field in place. Drop and re-add it:",
        "",
        `tsk collections.fields.drop --collection ${collection} --field ${field}`,
        `tsk collections.wait --collection ${collection} --field-missing ${field}`,
        `tsk collections.fields.add --collection ${collection} --input field.json`,
      ].join("\n");
    }

    return "Typesense does not allow changing this field in place. Drop the existing field, wait until it is missing, then add the replacement definition.";
  }

  if (
    /another collection update operation is in progress/i.test(message) ||
    /timeout of \d+ms exceeded/i.test(message) ||
    /econnaborted/i.test(message)
  ) {
    if (collection && field) {
      return [
        "A collection schema update may still be applying. Wait for the expected field state before retrying:",
        "",
        `tsk collections.wait --collection ${collection} --field-present ${field}`,
        `tsk collections.wait --collection ${collection} --field-missing ${field}`,
      ].join("\n");
    }

    return "A collection schema update may still be applying. Use collections.wait to poll the expected schema state before retrying.";
  }

  return undefined;
}
