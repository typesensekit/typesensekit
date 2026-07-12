import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { Operation } from "@typesensekit/core";
import { isDestructiveOperation } from "@typesensekit/core";
import type { z } from "zod";
import { READ_ONLY_OPERATION_NAMES } from "./read-only.js";

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
    destructiveHint: isDestructiveOperation(operation.name),
    idempotentHint: isIdempotent(operation.name, readOnly),
    openWorldHint: true,
  };
}
