import { redactSecrets, redactText } from "./redaction.js";

export type NormalizedTypesenseError = {
  code: string;
  message: string;
  details?: unknown;
};

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  httpStatus?: unknown;
  status?: unknown;
};

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

export function formatTypesenseErrorMessage(error: unknown): string {
  return normalizeTypesenseError(error).message;
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
