import { z } from "zod";
import { api, collectionPath } from "./http.js";
import {
  compactRequestParams,
  compactSchema,
  compactSearchResult,
  FILTER_BY_HELP,
  searchParamsSchema,
  takeCompactFlag,
} from "./search-params.js";
import type { Operation } from "./types.js";

const searchParams = searchParamsSchema(
  () => z.unknown(),
  () => z.unknown(),
);
const facetBySchema = z.union([z.string().min(1), z.array(z.string().min(1))]);
const collectionSchema = z.string().describe("Collection name or alias.");

function withoutUndefined(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );
}

type CompactFlag = ReturnType<typeof takeCompactFlag<Record<string, unknown>>>;

export type SearchInput = {
  collection: string;
  params: Record<string, unknown>;
  compact?: boolean;
};

export async function runCollectionSearch(
  client: Parameters<Operation<z.ZodTypeAny, unknown>["execute"]>[0],
  input: SearchInput,
) {
  const path = `${collectionPath(input.collection)}/documents/search`;
  const nested = takeCompactFlag(input.params);
  const params = nested.params ?? {};
  if (!input.compact && !nested.compact) return api(client).get(path, params);
  const result = await api(client).get(path, compactRequestParams(params));
  return compactSearchResult(result);
}

export const SEARCH_DESCRIPTION =
  "Search one collection (or alias) with Typesense search parameters. Returns `found` (total matches), `hits` (one page, default 10, max 250 via per_page) and `facet_counts`. To count, use per_page: 0 and read `found`; to aggregate, use facet_by (numeric facets include min/max/sum/avg stats) or group_by instead of paging through documents. Results include synonym expansion and curation rules (pinned/hidden hits); disable with enable_synonyms/enable_overrides: false. Set compact: true (strongly recommended when per_page is above ~20) for a 5-10x smaller response.";

export const searchOperations = [
  {
    name: "search",
    summary: "Search a collection",
    description: SEARCH_DESCRIPTION,
    category: "search",
    input: z.object({
      collection: collectionSchema,
      params: searchParams,
      compact: compactSchema,
    }),
    execute: async (client, input) => runCollectionSearch(client, input),
  },
  {
    name: "multi_search",
    summary: "Run a Typesense multi-search",
    description:
      "Run several searches in one request, across one or more collections. Each entry in `searches` is an object of search parameters plus `collection` (e.g. {collection, q, query_by, filter_by, sort_by, per_page}); `commonParams` apply to all. Returns {results: [...]} in the same order. Use it to answer several independent questions in one call. Set compact: true for smaller results.",
    category: "search",
    input: z.object({
      searches: z
        .array(z.record(z.unknown()))
        .describe(
          "Search parameter objects, each with `collection` plus snake_case Typesense search parameters.",
        ),
      commonParams: z
        .record(z.unknown())
        .optional()
        .describe("Search parameters applied to every search."),
      compact: compactSchema,
    }),
    execute: async (client, input) => {
      const common = takeCompactFlag(input.commonParams);
      const searches: CompactFlag[] = input.searches.map(
        (search: Record<string, unknown>) => takeCompactFlag(search),
      );
      const allCompact = Boolean(input.compact) || common.compact;
      const anyCompact =
        allCompact || searches.some((search) => search.compact);
      if (!anyCompact) {
        return api(client).post(
          "/multi_search",
          { searches: input.searches },
          input.commonParams,
        );
      }
      const result = await api(client).post<{ results?: unknown }>(
        "/multi_search",
        {
          searches: searches.map((search) =>
            allCompact || !search.compact
              ? search.params
              : compactRequestParams(search.params ?? {}),
          ),
        },
        allCompact ? compactRequestParams(common.params ?? {}) : common.params,
      );
      return Array.isArray(result?.results)
        ? {
            ...result,
            results: result.results.map((entry, index) =>
              allCompact || searches[index]?.compact
                ? compactSearchResult(entry)
                : entry,
            ),
          }
        : result;
    },
  },
  {
    name: "search.facets",
    summary: "Explore facet counts for a collection",
    description:
      "Get facet value counts for one or more facet fields (facet: true in the schema), optionally for a query/filter. Returns facet_counts with value counts and, for numeric fields, stats: min, max, sum and avg are computed over every matching document (total_values is only the number of distinct values). Only the top 10 values per field are returned unless you raise maxFacetValues. `found` is the number of matching documents.",
    category: "search",
    input: z.object({
      collection: collectionSchema,
      facetBy: facetBySchema.describe(
        "Facet field name(s); comma-separated string or array.",
      ),
      q: z.string().optional().default("*"),
      queryBy: z
        .string()
        .optional()
        .describe("Fields to search when q is not `*`."),
      filterBy: z.string().optional().describe(FILTER_BY_HELP),
      maxFacetValues: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Values per facet field (Typesense default 10). Use e.g. 250 to see all.",
        ),
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
    description:
      "Autocomplete-style prefix search: returns up to `limit` hits for a partial query q over queryBy fields.",
    category: "search",
    input: z.object({
      collection: collectionSchema,
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
