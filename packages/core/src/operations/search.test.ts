import { describe, expect, it, vi } from "vitest";
import type { TypesenseClient } from "../client.js";
import { searchOperations } from "./search.js";

function getOperation(name: string) {
  const operation = searchOperations.find(
    (candidate) => candidate.name === name,
  );
  if (!operation) throw new Error(`${name} not found`);
  return operation;
}

describe("search helper operations", () => {
  it("runs facet exploration with focused search parameters", async () => {
    const operation = getOperation("search.facets");
    const get = vi.fn().mockResolvedValue({ facet_counts: [] });
    const client = { apiCall: { get } } as unknown as TypesenseClient;

    await operation.execute(
      client,
      operation.input.parse({
        collection: "products",
        facetBy: ["brand", "category"],
        filterBy: "in_stock:=true",
        maxFacetValues: 20,
      }),
    );

    expect(get).toHaveBeenCalledWith("/collections/products/documents/search", {
      q: "*",
      filter_by: "in_stock:=true",
      facet_by: "brand,category",
      max_facet_values: 20,
      per_page: 0,
    });
  });

  it("runs prefix suggestions with result limiting and included fields", async () => {
    const operation = getOperation("search.suggestions");
    const get = vi.fn().mockResolvedValue({ hits: [] });
    const client = { apiCall: { get } } as unknown as TypesenseClient;

    await operation.execute(
      client,
      operation.input.parse({
        collection: "products",
        q: "lou",
        queryBy: "title,brand",
        includeFields: ["title", "brand"],
        limit: 8,
      }),
    );

    expect(get).toHaveBeenCalledWith("/collections/products/documents/search", {
      q: "lou",
      query_by: "title,brand",
      include_fields: "title,brand",
      per_page: 8,
      prefix: true,
    });
  });
});
