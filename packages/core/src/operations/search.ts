import { z } from "zod";
import { api, collectionPath } from "./http.js";
import type { Operation } from "./types.js";

const searchParams = z.record(z.unknown());
const facetBySchema = z.union([z.string().min(1), z.array(z.string().min(1))]);

function withoutUndefined(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );
}

export const searchOperations = [
  {
    name: "search",
    summary: "Search a collection",
    category: "search",
    input: z.object({ collection: z.string(), params: searchParams }),
    execute: async (client, input) =>
      api(client).get(
        `${collectionPath(input.collection)}/documents/search`,
        input.params,
      ),
  },
  {
    name: "multi_search",
    summary: "Run a Typesense multi-search",
    category: "search",
    input: z.object({
      searches: z.array(searchParams),
      commonParams: searchParams.optional(),
    }),
    execute: async (client, input) =>
      api(client).post(
        "/multi_search",
        { searches: input.searches },
        input.commonParams,
      ),
  },
  {
    name: "search.facets",
    summary: "Explore facet counts for a collection",
    category: "search",
    input: z.object({
      collection: z.string(),
      facetBy: facetBySchema,
      q: z.string().optional().default("*"),
      queryBy: z.string().optional(),
      filterBy: z.string().optional(),
      maxFacetValues: z.number().int().positive().optional(),
      perPage: z.number().int().nonnegative().optional().default(0),
    }),
    execute: async (client, input) =>
      api(client).get(
        `${collectionPath(input.collection)}/documents/search`,
        withoutUndefined({
          q: input.q,
          query_by: input.queryBy,
          filter_by: input.filterBy,
          facet_by: Array.isArray(input.facetBy)
            ? input.facetBy.join(",")
            : input.facetBy,
          max_facet_values: input.maxFacetValues,
          per_page: input.perPage,
        }),
      ),
  },
  {
    name: "search.suggestions",
    summary: "Fetch prefix search suggestions from a collection",
    category: "search",
    input: z.object({
      collection: z.string(),
      q: z.string(),
      queryBy: z.string(),
      filterBy: z.string().optional(),
      includeFields: z.union([z.string(), z.array(z.string())]).optional(),
      limit: z.number().int().positive().max(50).optional().default(5),
      prefix: z.boolean().optional().default(true),
    }),
    execute: async (client, input) =>
      api(client).get(
        `${collectionPath(input.collection)}/documents/search`,
        withoutUndefined({
          q: input.q,
          query_by: input.queryBy,
          filter_by: input.filterBy,
          include_fields: Array.isArray(input.includeFields)
            ? input.includeFields.join(",")
            : input.includeFields,
          per_page: input.limit,
          prefix: input.prefix,
        }),
      ),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
