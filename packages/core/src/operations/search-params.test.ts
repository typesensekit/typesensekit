import { describe, expect, it, vi } from "vitest";
import type { TypesenseClient } from "../client.js";
import { documentOperations } from "./documents.js";
import { operations } from "./index.js";
import { searchOperations } from "./search.js";
import { compactSearchResult } from "./search-params.js";

function getOperation(name: string) {
  const operation = [...searchOperations, ...documentOperations].find(
    (candidate) => candidate.name === name,
  );
  if (!operation) throw new Error(`${name} not found`);
  return operation;
}

const rawResult = {
  facet_counts: [
    {
      field_name: "brand",
      counts: [{ count: 2, highlighted: "Acme", value: "Acme" }],
      stats: { total_values: 1 },
    },
  ],
  found: 2,
  out_of: 10,
  page: 1,
  request_params: { q: "lamp", per_page: 10 },
  search_cutoff: false,
  search_time_ms: 1,
  hits: [
    {
      document: { id: "1", name: "Desk Lamp" },
      highlight: { name: { snippet: "Desk <mark>Lamp</mark>" } },
      highlights: [{ field: "name", snippet: "Desk <mark>Lamp</mark>" }],
      text_match: 1,
      text_match_info: { score: "1" },
      geo_distance_meters: { location: 5 },
    },
  ],
  grouped_hits: [
    {
      group_key: ["Acme"],
      found: 2,
      hits: [{ document: { id: "1" }, text_match: 1, highlight: {} }],
    },
  ],
};

describe("compact search results", () => {
  it("keeps documents, counts and facets but drops match metadata", () => {
    expect(compactSearchResult(rawResult)).toEqual({
      facet_counts: [
        {
          field_name: "brand",
          counts: [{ count: 2, value: "Acme" }],
          stats: { total_values: 1 },
        },
      ],
      found: 2,
      out_of: 10,
      page: 1,
      hits: [
        {
          document: { id: "1", name: "Desk Lamp" },
          geo_distance_meters: { location: 5 },
        },
      ],
      grouped_hits: [
        { group_key: ["Acme"], found: 2, hits: [{ document: { id: "1" } }] },
      ],
    });
  });

  it("leaves results unchanged unless compact is requested", async () => {
    for (const name of ["search", "documents.search"]) {
      const operation = getOperation(name);
      const get = vi.fn().mockResolvedValue(rawResult);
      const client = { apiCall: { get } } as unknown as TypesenseClient;
      const params = { q: "lamp", query_by: "name", per_page: 5 };

      await expect(
        operation.execute(
          client,
          operation.input.parse({ collection: "products", params }),
        ),
      ).resolves.toBe(rawResult);
      expect(get).toHaveBeenCalledWith(
        "/collections/products/documents/search",
        params,
      );
    }
  });

  it("skips highlighting and strips metadata in compact mode", async () => {
    const operation = getOperation("documents.search");
    const get = vi.fn().mockResolvedValue(rawResult);
    const client = { apiCall: { get } } as unknown as TypesenseClient;

    const result = await operation.execute(
      client,
      operation.input.parse({
        collection: "products",
        params: { q: "lamp", query_by: "name", highlight_fields: "name" },
        compact: true,
      }),
    );

    expect(get).toHaveBeenCalledWith("/collections/products/documents/search", {
      highlight_fields: "name",
      enable_highlight_v1: false,
      q: "lamp",
      query_by: "name",
    });
    expect(result).toEqual(compactSearchResult(rawResult));
  });

  it("compacts every multi_search result", async () => {
    const operation = getOperation("multi_search");
    const post = vi.fn().mockResolvedValue({ results: [rawResult] });
    const client = { apiCall: { post } } as unknown as TypesenseClient;

    await expect(
      operation.execute(
        client,
        operation.input.parse({
          searches: [{ collection: "products", q: "*" }],
          compact: true,
        }),
      ),
    ).resolves.toEqual({ results: [compactSearchResult(rawResult)] });
    expect(post).toHaveBeenCalledWith(
      "/multi_search",
      { searches: [{ collection: "products", q: "*" }] },
      { highlight_fields: "none", enable_highlight_v1: false },
    );
  });
});

describe("search parameter schemas", () => {
  it("keeps documents.search value validation for documented keys", () => {
    const operation = getOperation("documents.search");
    expect(
      operation.input.safeParse({
        collection: "products",
        params: { q: "*", include_fields: ["id", "name"], per_page: 250 },
      }).success,
    ).toBe(true);
    expect(
      operation.input.safeParse({
        collection: "products",
        params: { q: { nested: true } },
      }).success,
    ).toBe(false);
  });

  it("gives every operation an agent description", () => {
    for (const operation of operations) {
      const description: string | undefined = (
        operation as { description?: string }
      ).description;
      if (description === undefined) continue;
      expect(description.length, operation.name).toBeGreaterThanOrEqual(
        operation.summary.length,
      );
    }
  });
});
