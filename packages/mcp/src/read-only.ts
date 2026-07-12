import type { Operation } from "@typesensekit/core";
import type { z } from "zod";

export const READ_ONLY_OPERATION_NAMES = new Set([
  "aliases.list",
  "aliases.retrieve",
  "analytics.events.list",
  "analytics.rules.list",
  "analytics.rules.retrieve",
  "analytics.status",
  "collections.list",
  "collections.retrieve",
  "collections.wait",
  "conversations.history.retrieve",
  "conversations.models.list",
  "conversations.models.retrieve",
  "curation_sets.items.list",
  "curation_sets.items.retrieve",
  "curation_sets.list",
  "curation_sets.retrieve",
  "debug",
  "documents.export",
  "documents.get",
  "documents.get_many",
  "documents.search",
  "health",
  "metrics",
  "multi_search",
  "nl_search_models.list",
  "nl_search_models.retrieve",
  "overrides.list",
  "overrides.retrieve",
  "operations.schema_changes",
  "presets.list",
  "presets.retrieve",
  "search",
  "search.facets",
  "search.suggestions",
  "stats",
  "stemming.dictionaries.list",
  "stemming.dictionaries.retrieve",
  "stopwords.list",
  "stopwords.retrieve",
  "synonym_sets.items.list",
  "synonym_sets.items.retrieve",
  "synonym_sets.list",
  "synonym_sets.retrieve",
  "synonyms.list",
  "synonyms.retrieve",
]);

export type McpOperation = Operation<z.ZodTypeAny, unknown>;

export function isReadOnlyOperation(operation: McpOperation): boolean {
  return READ_ONLY_OPERATION_NAMES.has(operation.name);
}

export function filterMcpOperations(
  operations: McpOperation[],
  readOnly: boolean,
): McpOperation[] {
  return readOnly ? operations.filter(isReadOnlyOperation) : operations;
}

export function readOnlyFromEnv(value: string | undefined): boolean {
  if (value === undefined) return true;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}
