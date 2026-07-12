import { describe, expect, it } from "vitest";
import { operations } from "./index.js";

describe("operation registry", () => {
  it("has unique operation names across the Typesense API surfaces", () => {
    const names = operations.map((operation) => operation.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        "collections.create",
        "documents.search",
        "documents.get_many",
        "multi_search",
        "search.facets",
        "search.suggestions",
        "keys.create",
        "analytics.events.create",
        "conversations.models.create",
        "collections.wait",
        "collections.fields.add",
        "collections.fields.drop",
        "collections.fields.replace",
        "synonym_sets.list",
        "synonym_sets.items.list",
        "curation_sets.list",
        "curation_sets.items.upsert",
        "api.call",
        "health",
      ]),
    );
  });
});
