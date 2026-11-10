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
  "Indexed fields only. Exact `:=`, token `:`, list `field:[a,b]`, range `year:[1990..1999]`, comparisons, &&/||. Backtick-quote spaces/special characters: brand:=`Smith & Co`.";

function commonSearchParamShape(value: ParamValue, descriptions: boolean) {
  const param = (description: string) => {
    const schema = value().optional();
    return descriptions ? schema.describe(description) : schema;
  };
  return {
    q: param("Query text; `*` matches all, without query_by."),
    query_by: param(
      "String fields, comma-separated. Required unless q is `*`.",
    ),
    filter_by: param(FILTER_BY_HELP),
    sort_by: param(
      "e.g. `rating:desc,price:asc` (max 3). Numeric or sort:true fields.",
    ),
    facet_by: param(
      "Comma-separated facet:true fields. Numeric stats min/max/sum/avg cover all matches; total_values counts distinct values.",
    ),
    max_facet_values: param(
      "Values per facet; default 10. Raise for all values.",
    ),
    per_page: param(
      "Default 10, max 250; 0 for counts/facets. Prefer compact:true and include_fields.",
    ),
    page: param("1-based page; paginate beyond 250 hits."),
    include_fields: param("Document fields to return, comma-separated."),
    exclude_fields: param("Comma-separated document fields to omit."),
    group_by: param(
      "Group hits by facet field(s); see group_limit (default 3 hits per group).",
    ),
    enable_synonyms: param("false disables synonym expansion (default true)."),
    enable_overrides: param(
      "false disables pinned/hidden hits (default true).",
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
  descriptions = true,
) {
  return z
    .object(commonSearchParamShape(value, descriptions))
    .catchall(catchall())
    .describe(SEARCH_PARAMS_HELP);
}

const SEARCH_PARAMS_HELP =
  "Typesense snake_case parameters; additional keys accepted (prefix, num_typos, group_limit, facet_query, ...).";

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
    "Prefer true: omit highlights, scores, request/timing metadata and facet highlighted values; preserve documents/counts/facets. Default false.",
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

/**
 * Typesense has no `compact` search parameter, so a `compact` flag placed
 * inside the search parameters is treated as the top-level option and removed
 * before the request is sent.
 */
export function takeCompactFlag<T extends JsonObject>(
  params: T | undefined,
): { compact: boolean; params: T | undefined } {
  if (!params || !("compact" in params)) return { compact: false, params };
  const { compact, ...rest } = params;
  return {
    compact: compact === true || compact === "true",
    params: rest as T,
  };
}

/** Asks Typesense to skip highlight work for compact searches unless the caller set it. */
export function compactRequestParams<T extends JsonObject>(params: T): T {
  return {
    highlight_fields: "none",
    enable_highlight_v1: false,
    ...params,
  };
}
