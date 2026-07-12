import { describe, expect, it } from "vitest";
import { filterMcpOperations, readOnlyFromEnv } from "./read-only.js";

const operations = [
  { name: "search" },
  { name: "search.facets" },
  { name: "search.suggestions" },
  { name: "documents.get" },
  { name: "documents.get_many" },
  { name: "collections.retrieve" },
  { name: "curation_sets.list" },
  { name: "curation_sets.items.retrieve" },
  { name: "stemming.dictionaries.list" },
  { name: "nl_search_models.retrieve" },
  { name: "operations.schema_changes" },
  { name: "analytics.status" },
  { name: "documents.index" },
  { name: "collections.delete" },
  { name: "keys.retrieve" },
  { name: "api.call" },
] as never[];

describe("MCP read-only operation filtering", () => {
  it("keeps read-only tools and hides write, secret, and raw API tools", () => {
    expect(filterMcpOperations(operations, true).map((op) => op.name)).toEqual([
      "search",
      "search.facets",
      "search.suggestions",
      "documents.get",
      "documents.get_many",
      "collections.retrieve",
      "curation_sets.list",
      "curation_sets.items.retrieve",
      "stemming.dictionaries.list",
      "nl_search_models.retrieve",
      "operations.schema_changes",
      "analytics.status",
    ]);
  });

  it("can expose every operation when read-only mode is disabled", () => {
    expect(filterMcpOperations(operations, false)).toEqual(operations);
  });

  it("defaults to read-only unless explicitly disabled", () => {
    expect(readOnlyFromEnv(undefined)).toBe(true);
    expect(readOnlyFromEnv("true")).toBe(true);
    expect(readOnlyFromEnv("0")).toBe(false);
    expect(readOnlyFromEnv("false")).toBe(false);
    expect(readOnlyFromEnv("no")).toBe(false);
    expect(readOnlyFromEnv("off")).toBe(false);
  });
});
