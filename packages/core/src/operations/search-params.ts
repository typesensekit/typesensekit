import { z } from "zod";

/** Any value Typesense accepts as a search query parameter. */
export const scalarParamValue = () =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
  ]);

export const searchParamValue = scalarParamValue();

/**
 * Same validation as scalarParamValue, but rendered in JSON Schema as a
 * description-only property, so documented keys stay compact for agents.
 */
export const documentedScalarParamValue = () =>
  z
    .unknown()
    .refine(
      (value) => searchParamValue.safeParse(value).success,
      "Expected a string, number, boolean, or array of strings or numbers.",
    );

/** Factory, so every property gets its own schema instance (no JSON Schema $refs). */
type ParamValue = () => z.ZodTypeAny;

export const FILTER_BY_HELP =
  "Filter expression, e.g. `price:<100 && in_stock:=true`, `brand:=[A,B]`, `year:[1990..1999]`, `tags:!=old`. `:=` is exact match, `:` is token match. Wrap values containing spaces, commas, `&`, `(`, `)` or other special characters in backticks: brand:=`Smith & Co`. Only indexed fields can be filtered.";

function commonSearchParamShape(value: ParamValue) {
  const param = (description: string) =>
    value().optional().describe(description);
  return {
    q: param(
      "Query text. Use `*` to match every document (then query_by is optional).",
    ),
    query_by: param(
      "Comma-separated string fields to search, e.g. `title,description`. Required unless q is `*`.",
    ),
    filter_by: param(FILTER_BY_HELP),
    sort_by: param(
      "e.g. `price:asc` or `rating:desc,price:asc` (max 3). Field must be numeric or have sort: true. Default: text match, then default_sorting_field.",
    ),
    facet_by: param(
      "Comma-separated facet fields (facet: true). Numeric facets also return stats (min, max, sum, avg).",
    ),
    max_facet_values: param(
      "Facet values returned per field. Default 10: raise it (e.g. 250) when you need every value.",
    ),
    per_page: param(
      "Hits per page. Default 10, max 250. Use 0 to only get `found` and facets.",
    ),
    page: param("1-based page number for paginating beyond per_page."),
    include_fields: param(
      "Comma-separated document fields to return (smaller responses).",
    ),
    exclude_fields: param("Comma-separated document fields to omit."),
    group_by: param(
      "Group hits by facet field(s); see group_limit (default 3 hits per group).",
    ),
    enable_synonyms: param("false disables synonym expansion (default true)."),
    enable_overrides: param(
      "false disables curation/override rules such as pinned or hidden hits (default true).",
    ),
    preset: param("Name of a stored preset whose params are applied."),
  };
}

/**
 * Typesense search parameters. Common keys are typed and documented; any other
 * Typesense search parameter is still accepted and passed through unchanged.
 */
export function searchParamsSchema(
  value: ParamValue = documentedScalarParamValue,
  catchall: ParamValue = scalarParamValue,
) {
  return z
    .object(commonSearchParamShape(value))
    .catchall(catchall())
    .describe(SEARCH_PARAMS_HELP);
}

const SEARCH_PARAMS_HELP =
  "Typesense search parameters (snake_case, sent as-is). Any other Typesense search parameter (prefix, num_typos, group_limit, facet_query, highlight_fields, ...) is also accepted.";

export const exportParamsSchema = z
  .object({
    filter_by: documentedScalarParamValue().optional().describe(FILTER_BY_HELP),
    include_fields: documentedScalarParamValue()
      .optional()
      .describe("Comma-separated fields to export."),
    exclude_fields: documentedScalarParamValue()
      .optional()
      .describe("Comma-separated fields to omit."),
  })
  .catchall(scalarParamValue())
  .describe("Typesense export parameters (snake_case, sent as-is).");

export const compactSchema = z
  .boolean()
  .optional()
  .describe(
    "true returns a smaller result: hits become {document} only (no highlight, highlights, text_match, text_match_info), facet counts drop the duplicate `highlighted` value, and request_params/search_cutoff/search_time_ms are omitted. Recommended unless you need match snippets or scores. Default false.",
  );

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const HIT_METADATA_KEYS = new Set([
  "highlight",
  "highlights",
  "text_match",
  "text_match_info",
]);
const RESULT_METADATA_KEYS = new Set([
  "request_params",
  "search_cutoff",
  "search_time_ms",
]);

function compactHit(hit: unknown): unknown {
  if (!isObject(hit)) return hit;
  return Object.fromEntries(
    Object.entries(hit).filter(([key]) => !HIT_METADATA_KEYS.has(key)),
  );
}

function compactFacetCount(facet: unknown): unknown {
  if (!isObject(facet) || !Array.isArray(facet.counts)) return facet;
  return {
    ...facet,
    counts: facet.counts.map((count) => {
      if (!isObject(count)) return count;
      const { highlighted: _highlighted, ...rest } = count;
      return rest;
    }),
  };
}

/** Strips match metadata from a Typesense search response; documents, counts and facets are kept. */
export function compactSearchResult(result: unknown): unknown {
  if (!isObject(result)) return result;
  const compacted: JsonObject = {};
  for (const [key, value] of Object.entries(result)) {
    if (RESULT_METADATA_KEYS.has(key)) continue;
    if (key === "hits" && Array.isArray(value)) {
      compacted.hits = value.map(compactHit);
    } else if (key === "grouped_hits" && Array.isArray(value)) {
      compacted.grouped_hits = value.map((group) =>
        isObject(group) && Array.isArray(group.hits)
          ? { ...group, hits: group.hits.map(compactHit) }
          : group,
      );
    } else if (key === "facet_counts" && Array.isArray(value)) {
      compacted.facet_counts = value.map(compactFacetCount);
    } else {
      compacted[key] = value;
    }
  }
  return compacted;
}

/** Asks Typesense to skip highlight work for compact searches unless the caller set it. */
export function compactRequestParams<T extends JsonObject>(params: T): T {
  return {
    highlight_fields: "none",
    enable_highlight_v1: false,
    ...params,
  };
}
