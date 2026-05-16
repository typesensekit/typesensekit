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
      message: error.message,
      details: error,
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
          ? errorLike.message
          : "Unknown Typesense error",
      details: error,
    };
  }

  return { code: "TypesenseError", message: String(error) };
}
