import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { Operation } from "@typesensekit/core";
import type { z } from "zod";
import { READ_ONLY_OPERATION_NAMES } from "./read-only.js";

const DESTRUCTIVE_OPERATION_NAMES = new Set([
  "api.call",
  "collections.delete",
  "collections.fields.drop",
  "collections.fields.replace",
  "documents.delete",
  "keys.delete",
]);

function isDestructive(name: string): boolean {
  return DESTRUCTIVE_OPERATION_NAMES.has(name) || name.endsWith(".delete");
}

function isIdempotent(name: string, readOnly: boolean): boolean {
  return (
    readOnly ||
    name.endsWith(".upsert") ||
    name.endsWith(".update") ||
    name === "collections.wait" ||
    name === "operations.slow_requests.configure"
  );
}

export function operationToolAnnotations(
  operation: Operation<z.ZodTypeAny, unknown>,
): ToolAnnotations {
  const readOnly = READ_ONLY_OPERATION_NAMES.has(operation.name);
  return {
    readOnlyHint: readOnly,
    destructiveHint: isDestructive(operation.name),
    idempotentHint: isIdempotent(operation.name, readOnly),
    openWorldHint: true,
  };
}
